import { createAdminClient, createClient } from 'npm:@insforge/sdk';

const API = 'https://api.calendly.com';
const AUTH = 'https://auth.calendly.com/oauth';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type,Authorization' };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: cors });
const token = (req: Request) => (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
const client = (req: Request) => createClient({ baseUrl: Deno.env.get('INSFORGE_BASE_URL'), anonKey: Deno.env.get('ANON_KEY'), ...(token(req) ? { edgeFunctionToken: token(req) } : {}) });
const systemClient = () => createAdminClient({ baseUrl: Deno.env.get('INSFORGE_BASE_URL'), apiKey: Deno.env.get('API_KEY') || '' });
const read = async (result: any, message: string) => { if (result?.error) throw new Error(result.error.message || message); return result?.data; };

async function portal(db: any) {
  const user = await read(await db.database.rpc('resolve_current_portal_user'), 'Authentication required');
  if (!user?.tenantId) throw new Error('Tenant context is required');
  return user;
}
function secret() { const value = Deno.env.get('CALENDLY_TOKEN_ENCRYPTION_KEY'); if (!value || value.length < 32) throw new Error('Calendly credential encryption is not configured'); return value; }
async function key() { return crypto.subtle.importKey('raw', new TextEncoder().encode(secret().slice(0, 32)), 'AES-GCM', false, ['encrypt', 'decrypt']); }
function b64(bytes: Uint8Array) { return btoa(String.fromCharCode(...bytes)); }
function bytes(value: string) { return Uint8Array.from(atob(value), c => c.charCodeAt(0)); }
async function encrypt(value: unknown) { const iv = crypto.getRandomValues(new Uint8Array(12)); const data = new TextEncoder().encode(JSON.stringify(value)); const encoded = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(), data)); return `${b64(iv)}.${b64(encoded)}`; }
async function decrypt(value: string) { const [iv, data] = value.split('.'); const raw = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(iv) }, await key(), bytes(data)); return JSON.parse(new TextDecoder().decode(raw)); }
async function integration(db: any, tenantId: string) { const rows = await read(await db.database.from('tenant_booking_integrations').select('*').eq('tenant_id', tenantId).eq('provider', 'calendly').limit(1), 'Failed to load Calendly settings'); return rows?.[0] || null; }
async function credentials(db: any, tenantId: string, bookingId: string) { const rows = await read(await db.database.from('tenant_booking_credentials').select('*').eq('tenant_id', tenantId).eq('booking_integration_id', bookingId).limit(1), 'Failed to load Calendly credentials'); return rows?.[0] || null; }

export default async function(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  const db = client(req); const url = new URL(req.url); const action = url.searchParams.get('action') || (url.searchParams.has('code') && url.searchParams.has('state') ? 'callback' : 'status');
  try {
    if (action === 'callback') {
      const code = url.searchParams.get('code'); const state = url.searchParams.get('state'); if (!code || !state) throw new Error('Calendly authorization response is incomplete');
      const stateData = await decrypt(state); if (Date.now() - stateData.createdAt > 10 * 60 * 1000) throw new Error('Calendly authorization expired');
      const tokenResponse = await fetch(`${AUTH}/token`, { method: 'POST', headers: { Authorization: `Basic ${btoa(`${Deno.env.get('CALENDLY_CLIENT_ID')}:${Deno.env.get('CALENDLY_CLIENT_SECRET')}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: stateData.redirect }) });
      const tokens = await tokenResponse.json(); if (!tokenResponse.ok) throw new Error(tokens?.error_description || 'Calendly authorization failed');
      const meResponse = await fetch(`${API}/users/me`, { headers: { Authorization: `Bearer ${tokens.access_token}` } }); const me = await meResponse.json(); if (!meResponse.ok) throw new Error('Calendly account verification failed');
      const secureDb = systemClient(); let item = await integration(secureDb, stateData.tenantId); const values = { tenant_id: stateData.tenantId, provider: 'calendly', status: 'connected', external_account_id: me?.resource?.uri || null, booking_url: me?.resource?.scheduling_url || null, oauth_connected_at: new Date().toISOString(), oauth_error: null };
      if (item) await read(await secureDb.database.from('tenant_booking_integrations').update(values).eq('id', item.id).eq('tenant_id', stateData.tenantId), 'Failed to update Calendly connection'); else { const rows = await read(await secureDb.database.from('tenant_booking_integrations').insert([values]).select(), 'Failed to create Calendly connection'); item = rows?.[0]; }
      const encrypted_payload = await encrypt(tokens); const credential = await credentials(secureDb, stateData.tenantId, item.id); const credentialValues = { tenant_id: stateData.tenantId, booking_integration_id: item.id, provider: 'calendly', encrypted_payload, expires_at: new Date(Date.now() + Number(tokens.expires_in || 7200) * 1000).toISOString() };
      if (credential) await read(await secureDb.database.from('tenant_booking_credentials').update({ ...credentialValues, refresh_version: credential.refresh_version + 1 }).eq('id', credential.id), 'Failed to save Calendly credentials'); else await read(await secureDb.database.from('tenant_booking_credentials').insert([credentialValues]), 'Failed to save Calendly credentials');
      const frontendUrl = (Deno.env.get('FRONTEND_URL') || 'http://localhost:3000').replace(/\/$/, '');
      return Response.redirect(`${frontendUrl}/settings/company?calendly=connected`, 302);
    }
    const user = await portal(db); const tenantId = user.tenantId;
    if (action === 'status') { const item = await integration(db, tenantId); return json({ success: true, connected: Boolean(item?.status === 'connected' && item?.oauth_connected_at), integration: item && { status: item.status, eventTypeId: item.event_type_id, bookingUrl: item.booking_url, oauthError: item.oauth_error } }); }
    if (action === 'connect-url') {
      const redirect = `${Deno.env.get('INSFORGE_FUNCTION_BASE_URL') || new URL(req.url).origin}/calendly-oauth`;
      const state = await encrypt({ tenantId, userId: user.authUserId, redirect, createdAt: Date.now() });
      const scopes = 'users:read event_types:read availability:read scheduled_events:read scheduled_events:write webhooks:write';
      const authorize = new URL(`${AUTH}/authorize`); authorize.search = new URLSearchParams({ client_id: Deno.env.get('CALENDLY_CLIENT_ID') || '', response_type: 'code', redirect_uri: redirect, scope: scopes, state }).toString();
      if (!Deno.env.get('CALENDLY_CLIENT_ID') || !Deno.env.get('CALENDLY_CLIENT_SECRET')) throw new Error('Calendly OAuth is not configured');
      return json({ success: true, authorizeUrl: authorize.toString() });
    }
    if (action === 'event-types') { const item = await integration(db, tenantId); if (!item) throw new Error('Connect Calendly first'); const credential = await credentials(systemClient(), tenantId, item.id); if (!credential) throw new Error('Calendly credentials are unavailable'); const tokens = await decrypt(credential.encrypted_payload); const result = await fetch(`${API}/event_types?user=${encodeURIComponent(item.external_account_id)}&active=true`, { headers: { Authorization: `Bearer ${tokens.access_token}` } }); const data = await result.json(); if (!result.ok) throw new Error(data?.message || 'Failed to load Calendly event types'); return json({ success: true, eventTypes: (data.collection || []).map((e: any) => ({ id: e.uri, name: e.name, duration: e.duration, schedulingUrl: e.scheduling_url })) }); }
    throw new Error('Unsupported Calendly action');
  } catch (error) { return json({ success: false, error: error instanceof Error ? error.message : 'Calendly action failed' }, 400); }
}
