import { createAdminClient, createClient } from 'npm:@insforge/sdk';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};
const defaultReturnTo = '/settings/company?meta=connected';

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: cors });
const token = (req: Request) => (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
const client = (req: Request) => createClient({
  baseUrl: Deno.env.get('INSFORGE_BASE_URL'),
  anonKey: Deno.env.get('ANON_KEY'),
  ...(token(req) ? { edgeFunctionToken: token(req) } : {}),
});
const systemClient = () => createAdminClient({
  baseUrl: Deno.env.get('INSFORGE_BASE_URL'),
  apiKey: Deno.env.get('API_KEY') || '',
});

async function read(result: any, message: string) {
  if (result?.error) throw new Error(result.error.message || message);
  return result?.data;
}

async function portal(db: any) {
  const user = await read(await db.database.rpc('resolve_current_portal_user'), 'Authentication required');
  if (!user?.tenantId) throw new Error('Tenant context is required');
  return user;
}

async function inputBody(req: Request): Promise<any> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

function graphVersion() {
  return (Deno.env.get('META_GRAPH_VERSION') || 'v20.0').replace(/^\/+/, '');
}

function graphBase() {
  return `https://graph.facebook.com/${graphVersion()}`;
}

function dialogBase() {
  return `https://www.facebook.com/${graphVersion()}/dialog/oauth`;
}

function safeReturnTo(value?: string) {
  if (!value || typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return defaultReturnTo;
  }
  try {
    const parsed = new URL(value, 'https://app.local');
    if (parsed.origin !== 'https://app.local') return defaultReturnTo;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return defaultReturnTo;
  }
}

function addConnectionStatus(path: string, status: 'connected' | 'error', message?: string) {
  const parsed = new URL(safeReturnTo(path), 'https://app.local');
  parsed.searchParams.set('platform', 'meta');
  parsed.searchParams.set('status', status);
  if (status === 'connected') parsed.searchParams.set('connected', '1');
  if (message) parsed.searchParams.set('error', message);
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

function encryptionSecret() {
  const value = Deno.env.get('META_TOKEN_ENCRYPTION_KEY');
  if (!value || value.length < 32) throw new Error('Meta credential encryption is not configured');
  return value;
}

async function encryptionKey() {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(encryptionSecret().slice(0, 32)),
    'AES-GCM',
    false,
    ['encrypt', 'decrypt'],
  );
}

function b64(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes));
}

function bytes(value: string) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

async function encrypt(value: unknown) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(JSON.stringify(value));
  const encoded = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await encryptionKey(), data));
  return `${b64(iv)}.${b64(encoded)}`;
}

async function decrypt(value: string) {
  const [iv, data] = value.split('.');
  const raw = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(iv) }, await encryptionKey(), bytes(data));
  return JSON.parse(new TextDecoder().decode(raw));
}

function requiredMetaConfig() {
  const appId = Deno.env.get('META_APP_ID') || '';
  const appSecret = Deno.env.get('META_APP_SECRET') || '';
  if (!appId || !appSecret) throw new Error('Meta OAuth is not configured');
  return { appId, appSecret };
}

async function integration(db: any, tenantId: string) {
  const rows = await read(
    await db.database.from('tenant_meta_integrations').select('*').eq('tenant_id', tenantId).limit(1),
    'Failed to load Meta settings',
  );
  return rows?.[0] || null;
}

async function credentials(db: any, tenantId: string, integrationId: string) {
  const rows = await read(
    await db.database
      .from('tenant_meta_credentials')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('meta_integration_id', integrationId)
      .limit(1),
    'Failed to load Meta credentials',
  );
  return rows?.[0] || null;
}

async function fetchMeta(path: string, accessToken: string, params: Record<string, string> = {}) {
  const url = new URL(`${graphBase()}${path}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value) url.searchParams.set(key, value);
  });
  url.searchParams.set('access_token', accessToken);
  const response = await fetch(url.toString());
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || 'Meta request failed');
  }
  return data;
}

function safeArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function setupHealth(item: any, forms: any[] = [], channel: any = null) {
  const connected = item?.status === 'connected' && item?.token_status === 'active';
  const checks = [
    { key: 'oauth', label: 'Meta OAuth', status: connected ? 'connected' : 'needs_reconnect' },
    { key: 'page', label: 'Facebook Page', status: item?.page_id ? 'connected' : 'missing' },
    { key: 'adAccount', label: 'Ad account', status: item?.ad_account_id ? 'connected' : 'missing' },
    { key: 'leadForms', label: 'Lead forms', status: forms.some((form) => form.status === 'active') ? 'connected' : 'missing' },
    { key: 'messenger', label: 'Messenger channel', status: channel?.status === 'active' ? 'connected' : channel ? 'needs_attention' : 'missing' },
  ];
  return {
    status: connected && item?.page_id && item?.ad_account_id ? 'connected' : connected ? 'needs_attention' : 'needs_reconnect',
    checks,
    checkedAt: new Date().toISOString(),
  };
}

async function loadSetup(db: any, tenantId: string) {
  const [item, forms, channels] = await Promise.all([
    integration(db, tenantId),
    read(
      await db.database.from('tenant_facebook_lead_forms').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }),
      'Failed to load Meta lead forms',
    ).catch(() => []),
    read(
      await db.database.from('tenant_messenger_channels').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }),
      'Failed to load Messenger channels',
    ).catch(() => []),
  ]);
  return { integration: item, forms: forms || [], messengerChannels: channels || [] };
}

async function validateAgent(tenantId: string, agentId?: string | null) {
  if (!agentId) return null;
  const rows = await read(
    await systemClient().database.from('tenant_agents').select('id, tenant_id, status').eq('id', agentId).eq('tenant_id', tenantId).limit(1),
    'Failed to validate assigned AI agent',
  );
  if (!rows?.[0] || rows[0].status === 'archived') throw new Error('Assigned AI agent was not found for this tenant');
  return rows[0].id;
}

export default async function(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  const db = client(req);
  const url = new URL(req.url);
  const action = url.searchParams.get('action') || (url.searchParams.has('code') && url.searchParams.has('state') ? 'callback' : 'status');
  let callbackReturnTo = defaultReturnTo;

  try {
    if (action === 'health') {
      return json({
        success: true,
        function: 'meta-oauth',
        configured: Boolean(Deno.env.get('META_APP_ID') && Deno.env.get('META_APP_SECRET') && Deno.env.get('META_TOKEN_ENCRYPTION_KEY')),
        graphVersion: graphVersion(),
        actions: ['connect-url', 'callback', 'status', 'assets', 'save-selection', 'disconnect', 'test-setup'],
      });
    }

    if (action === 'callback') {
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      if (!code || !state) throw new Error('Meta authorization response is incomplete');
      const stateData = await decrypt(state);
      if (Date.now() - Number(stateData.createdAt || 0) > 10 * 60 * 1000) throw new Error('Meta authorization expired');
      callbackReturnTo = safeReturnTo(stateData.returnTo);

      const { appId, appSecret } = requiredMetaConfig();
      const tokenUrl = new URL(`${graphBase()}/oauth/access_token`);
      tokenUrl.search = new URLSearchParams({
        client_id: appId,
        client_secret: appSecret,
        redirect_uri: stateData.redirect,
        code,
      }).toString();
      const tokenResponse = await fetch(tokenUrl.toString());
      const shortToken = await tokenResponse.json();
      if (!tokenResponse.ok) throw new Error(shortToken?.error?.message || 'Meta authorization failed');

      const longUrl = new URL(`${graphBase()}/oauth/access_token`);
      longUrl.search = new URLSearchParams({
        grant_type: 'fb_exchange_token',
        client_id: appId,
        client_secret: appSecret,
        fb_exchange_token: shortToken.access_token,
      }).toString();
      const longResponse = await fetch(longUrl.toString());
      const longToken = await longResponse.json();
      if (!longResponse.ok) throw new Error(longToken?.error?.message || 'Meta long-lived token exchange failed');
      const accessToken = longToken.access_token || shortToken.access_token;
      const expiresIn = Number(longToken.expires_in || shortToken.expires_in || 0);
      const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;
      const me = await fetchMeta('/me', accessToken, { fields: 'id,name' });
      const permissions = await fetchMeta('/me/permissions', accessToken).catch(() => ({ data: [] }));
      const grantedPermissions = safeArray(permissions.data)
        .filter((permission: any) => permission?.status === 'granted')
        .map((permission: any) => String(permission.permission || '').trim())
        .filter(Boolean);

      const secureDb = systemClient();
      let item = await integration(secureDb, stateData.tenantId);
      const values = {
        tenant_id: stateData.tenantId,
        connected_by_user_id: stateData.userId || null,
        provider: 'meta',
        meta_user_id: me?.id || null,
        granted_permissions: grantedPermissions,
        token_status: 'active',
        status: 'connected',
        setup_health: setupHealth({ status: 'connected', token_status: 'active' }),
        metadata: {
          ...(item?.metadata || {}),
          connectedAccountName: me?.name || null,
          graphVersion: graphVersion(),
          source: 'phase27_meta_oauth',
        },
        oauth_connected_at: new Date().toISOString(),
        token_expires_at: expiresAt,
        last_health_checked_at: new Date().toISOString(),
      };
      if (item) {
        await read(
          await secureDb.database.from('tenant_meta_integrations').update(values).eq('id', item.id).eq('tenant_id', stateData.tenantId),
          'Failed to update Meta connection',
        );
      } else {
        const rows = await read(
          await secureDb.database.from('tenant_meta_integrations').insert([values]).select(),
          'Failed to create Meta connection',
        );
        item = rows?.[0];
      }

      const encryptedPayload = await encrypt({
        accessToken,
        tokenType: longToken.token_type || shortToken.token_type || 'bearer',
        expiresAt,
        grantedPermissions,
        metaUser: { id: me?.id || null, name: me?.name || null },
      });
      const existingCredential = await credentials(secureDb, stateData.tenantId, item.id);
      const credentialValues = {
        tenant_id: stateData.tenantId,
        meta_integration_id: item.id,
        provider: 'meta',
        encrypted_payload: encryptedPayload,
        expires_at: expiresAt,
      };
      if (existingCredential) {
        await read(
          await secureDb.database
            .from('tenant_meta_credentials')
            .update({ ...credentialValues, refresh_version: Number(existingCredential.refresh_version || 0) + 1 })
            .eq('id', existingCredential.id),
          'Failed to save Meta credentials',
        );
      } else {
        await read(
          await secureDb.database.from('tenant_meta_credentials').insert([credentialValues]),
          'Failed to save Meta credentials',
        );
      }

      const frontendUrl = (Deno.env.get('FRONTEND_URL') || 'http://localhost:3000').replace(/\/$/, '');
      return Response.redirect(`${frontendUrl}${addConnectionStatus(callbackReturnTo, 'connected')}`, 302);
    }

    const user = await portal(db);
    const tenantId = user.tenantId;

    if (action === 'status') {
      const setup = await loadSetup(db, tenantId);
      return json({
        success: true,
        configured: Boolean(Deno.env.get('META_APP_ID') && Deno.env.get('META_APP_SECRET') && Deno.env.get('META_TOKEN_ENCRYPTION_KEY')),
        ...setup,
      });
    }

    if (action === 'connect-url') {
      const { appId } = requiredMetaConfig();
      const body = await inputBody(req);
      const returnTo = safeReturnTo(body.returnTo || url.searchParams.get('returnTo') || defaultReturnTo);
      const redirect = `${Deno.env.get('INSFORGE_FUNCTION_BASE_URL') || new URL(req.url).origin}/meta-oauth`;
      const state = await encrypt({ tenantId, userId: user.authUserId, redirect, returnTo, createdAt: Date.now() });
      const defaultScopes = [
        'pages_show_list',
        'pages_read_engagement',
        'pages_manage_metadata',
        'leads_retrieval',
        'ads_read',
        'business_management',
        'pages_messaging',
      ].join(',');
      const scope = Deno.env.get('META_OAUTH_SCOPES') || defaultScopes;
      const authorize = new URL(dialogBase());
      authorize.search = new URLSearchParams({
        client_id: appId,
        response_type: 'code',
        redirect_uri: redirect,
        scope,
        state,
      }).toString();
      return json({ success: true, authorizeUrl: authorize.toString() });
    }

    if (action === 'assets') {
      const secureDb = systemClient();
      const item = await integration(secureDb, tenantId);
      if (!item || item.status === 'disconnected' || item.token_status !== 'active') {
        return json({ success: true, pages: [], adAccounts: [], forms: [], error: 'Connect Meta first' });
      }
      const credential = await credentials(secureDb, tenantId, item.id);
      if (!credential) throw new Error('Meta credentials are unavailable');
      const decrypted = await decrypt(credential.encrypted_payload);
      const accessToken = decrypted.accessToken;
      const pages = await fetchMeta('/me/accounts', accessToken, {
        fields: 'id,name,access_token,tasks',
        limit: '100',
      }).catch(() => ({ data: [] }));
      const adAccounts = await fetchMeta('/me/adaccounts', accessToken, {
        fields: 'id,account_id,name,account_status',
        limit: '100',
      }).catch(() => ({ data: [] }));
      const selectedPageId = url.searchParams.get('pageId') || item.page_id || safeArray(pages.data)[0]?.id;
      const selectedPage = safeArray(pages.data).find((page: any) => page.id === selectedPageId);
      const pageToken = selectedPage?.access_token || accessToken;
      const forms = selectedPageId
        ? await fetchMeta(`/${selectedPageId}/leadgen_forms`, pageToken, {
          fields: 'id,name,status,created_time',
          limit: '100',
        }).catch(() => ({ data: [] }))
        : { data: [] };
      return json({
        success: true,
        pages: safeArray(pages.data).map((page: any) => ({ id: page.id, name: page.name, tasks: page.tasks || [] })),
        adAccounts: safeArray(adAccounts.data).map((account: any) => ({
          id: account.id,
          accountId: account.account_id,
          name: account.name,
          status: account.account_status,
        })),
        forms: safeArray(forms.data).map((form: any) => ({
          id: form.id,
          name: form.name,
          status: form.status,
          createdTime: form.created_time,
        })),
      });
    }

    if (action === 'save-selection') {
      const body = await inputBody(req);
      const secureDb = systemClient();
      const item = await integration(secureDb, tenantId);
      if (!item || item.status === 'disconnected') throw new Error('Connect Meta before saving assets');
      const assignedAgentId = await validateAgent(tenantId, body.assignedAgentId || null);
      const sourceLabel = String(body.sourceLabel || '').trim() || 'Facebook';
      const pageId = String(body.pageId || '').trim();
      if (!pageId) throw new Error('Select a Facebook Page');
      const pageName = String(body.pageName || '').trim() || null;
      const adAccountId = String(body.adAccountId || '').trim() || null;
      const adAccountName = String(body.adAccountName || '').trim() || null;

      await read(
        await secureDb.database
          .from('tenant_meta_integrations')
          .update({
            page_id: pageId,
            page_name: pageName,
            ad_account_id: adAccountId,
            ad_account_name: adAccountName,
            status: item.token_status === 'active' ? 'connected' : 'needs_attention',
            setup_health: setupHealth({ ...item, page_id: pageId, ad_account_id: adAccountId }),
            metadata: {
              ...(item.metadata || {}),
              sourceLabel,
              selectedAt: new Date().toISOString(),
              selectedByUserId: user.authUserId || null,
            },
            last_health_checked_at: new Date().toISOString(),
          })
          .eq('id', item.id)
          .eq('tenant_id', tenantId),
        'Failed to save Meta asset selection',
      );

      const selectedForms = safeArray(body.forms).filter((form: any) => form?.id);
      const existingForms = await read(
        await secureDb.database.from('tenant_facebook_lead_forms').select('*').eq('tenant_id', tenantId),
        'Failed to load existing lead forms',
      );
      for (const form of selectedForms) {
        const formValues = {
          tenant_id: tenantId,
          meta_integration_id: item.id,
          page_id: pageId,
          form_id: String(form.id),
          form_name: String(form.name || '').trim() || null,
          assigned_agent_id: assignedAgentId,
          default_campaign_id: body.defaultCampaignId || null,
          source_label: sourceLabel,
          field_mapping: form.fieldMapping || {},
          status: form.status === 'paused' ? 'paused' : 'active',
          metadata: { source: 'phase27_settings', providerStatus: form.providerStatus || form.status || null },
        };
        const existing = safeArray(existingForms).find((row: any) => row.form_id === String(form.id));
        if (existing) {
          await read(
            await secureDb.database.from('tenant_facebook_lead_forms').update(formValues).eq('id', existing.id).eq('tenant_id', tenantId),
            'Failed to update Lead Ads form',
          );
        } else {
          await read(
            await secureDb.database.from('tenant_facebook_lead_forms').insert([formValues]),
            'Failed to save Lead Ads form',
          );
        }
      }
      const selectedFormIds = new Set(selectedForms.map((form: any) => String(form.id)));
      for (const existing of safeArray(existingForms)) {
        if (!selectedFormIds.has(existing.form_id) && existing.status !== 'archived') {
          await read(
            await secureDb.database.from('tenant_facebook_lead_forms').update({ status: 'archived' }).eq('id', existing.id).eq('tenant_id', tenantId),
            'Failed to archive removed Lead Ads form',
          );
        }
      }

      const messenger = body.messenger || {};
      if (messenger.enabled || messenger.twilioSenderId || messenger.twilioChannelId) {
        const channelValues = {
          tenant_id: tenantId,
          meta_integration_id: item.id,
          page_id: pageId,
          twilio_sender_id: String(messenger.twilioSenderId || '').trim() || null,
          twilio_channel_id: String(messenger.twilioChannelId || '').trim() || null,
          assigned_agent_id: assignedAgentId,
          source_label: sourceLabel,
          status: messenger.status === 'active' ? 'active' : messenger.twilioSenderId || messenger.twilioChannelId ? 'needs_attention' : 'pending',
          metadata: { source: 'phase27_settings' },
        };
        const existingChannels = await read(
          await secureDb.database.from('tenant_messenger_channels').select('*').eq('tenant_id', tenantId).eq('page_id', pageId).limit(1),
          'Failed to load Messenger channel',
        );
        if (existingChannels?.[0]) {
          await read(
            await secureDb.database.from('tenant_messenger_channels').update(channelValues).eq('id', existingChannels[0].id).eq('tenant_id', tenantId),
            'Failed to update Messenger channel',
          );
        } else {
          await read(
            await secureDb.database.from('tenant_messenger_channels').insert([channelValues]),
            'Failed to save Messenger channel',
          );
        }
      }

      return json({ success: true, ...(await loadSetup(db, tenantId)) });
    }

    if (action === 'disconnect') {
      const secureDb = systemClient();
      const item = await integration(secureDb, tenantId);
      if (!item) return json({ success: true, disconnected: true });
      await read(
        await secureDb.database
          .from('tenant_meta_integrations')
          .update({
            token_status: 'revoked',
            status: 'disconnected',
            setup_health: setupHealth({ status: 'disconnected', token_status: 'revoked' }),
            metadata: { ...(item.metadata || {}), disconnectedAt: new Date().toISOString(), disconnectedByUserId: user.authUserId || null },
            last_health_checked_at: new Date().toISOString(),
          })
          .eq('id', item.id)
          .eq('tenant_id', tenantId),
        'Failed to disconnect Meta',
      );
      await secureDb.database.from('tenant_meta_credentials').delete().eq('tenant_id', tenantId).eq('meta_integration_id', item.id);
      await secureDb.database.from('tenant_facebook_lead_forms').update({ status: 'archived' }).eq('tenant_id', tenantId).eq('meta_integration_id', item.id);
      await secureDb.database.from('tenant_messenger_channels').update({ status: 'disabled' }).eq('tenant_id', tenantId).eq('meta_integration_id', item.id);
      return json({ success: true, disconnected: true });
    }

    if (action === 'test-setup') {
      const setup = await loadSetup(db, tenantId);
      const health = setupHealth(setup.integration, setup.forms, setup.messengerChannels?.[0] || null);
      if (setup.integration?.id) {
        await read(
          await systemClient().database
            .from('tenant_meta_integrations')
            .update({ setup_health: health, last_health_checked_at: new Date().toISOString() })
            .eq('id', setup.integration.id)
            .eq('tenant_id', tenantId),
          'Failed to update Meta setup health',
        );
      }
      return json({ success: true, health });
    }

    throw new Error('Unsupported Meta action');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Meta action failed';
    if (action === 'callback') {
      const frontendUrl = (Deno.env.get('FRONTEND_URL') || 'http://localhost:3000').replace(/\/$/, '');
      return Response.redirect(`${frontendUrl}${addConnectionStatus(callbackReturnTo, 'error', message)}`, 302);
    }
    return json({ success: false, error: message }, 400);
  }
}
