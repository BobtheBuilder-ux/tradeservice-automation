import { createAdminClient } from 'npm:@insforge/sdk';
import twilio from 'npm:twilio';

type JsonRecord = Record<string, any>;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Hub-Signature-256,X-Twilio-Signature',
};

const STOP_PATTERNS = [/\bstop\b/i, /unsubscribe/i, /do not contact/i, /don't contact/i, /wrong number/i];

function adminClient() {
  return createAdminClient({
    baseUrl: Deno.env.get('INSFORGE_BASE_URL'),
    apiKey: Deno.env.get('API_KEY') || '',
  });
}

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: corsHeaders });
}

function twilioXml() {
  return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
    headers: { ...corsHeaders, 'Content-Type': 'text/xml' },
  });
}

function firstValue(...values: unknown[]) {
  return values.find((value) => value !== undefined && value !== null && value !== '');
}

function safeError(error: unknown) {
  return error instanceof Error ? error.message : 'Meta intake failed';
}

function compactText(value: unknown, maxLength = 1500) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

function normalizePhone(value: unknown) {
  const raw = String(value || '').trim().replace(/^whatsapp:/i, '').replace(/^messenger:/i, '');
  const digits = raw.replace(/\D/g, '');
  return digits ? `+${digits}` : '';
}

function lower(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

function graphVersion() {
  return (Deno.env.get('META_GRAPH_VERSION') || 'v20.0').replace(/^\/+/, '');
}

function graphBase() {
  return `https://graph.facebook.com/${graphVersion()}`;
}

function b64(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes));
}

function bytes(value: string) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

async function encryptionKey() {
  const secret = Deno.env.get('META_TOKEN_ENCRYPTION_KEY') || '';
  if (secret.length < 32) throw new Error('Meta credential encryption is not configured');
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret.slice(0, 32)),
    'AES-GCM',
    false,
    ['decrypt'],
  );
}

async function decrypt(value: string) {
  const [iv, data] = value.split('.');
  const raw = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(iv) }, await encryptionKey(), bytes(data));
  return JSON.parse(new TextDecoder().decode(raw));
}

async function hmacHex(secret: string, body: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)));
  return Array.from(signature).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function requireMetaSignature(req: Request, rawBody: string) {
  const appSecret = Deno.env.get('META_APP_SECRET') || '';
  const header = req.headers.get('x-hub-signature-256') || '';
  if (!appSecret || !header) throw new Error('Invalid Meta webhook signature');
  const expected = `sha256=${await hmacHex(appSecret, rawBody)}`;
  if (expected.length !== header.length) throw new Error('Invalid Meta webhook signature');
  let diff = 0;
  for (let index = 0; index < expected.length; index += 1) diff |= expected.charCodeAt(index) ^ header.charCodeAt(index);
  if (diff !== 0) throw new Error('Invalid Meta webhook signature');
}

function requestUrlForTwilioSignature(req: Request) {
  const configured = Deno.env.get('TWILIO_WEBHOOK_BASE_URL');
  if (configured) return `${configured.replace(/\/$/, '')}/meta-lead-intake${new URL(req.url).search}`;
  return req.url;
}

function requireTwilioSignature(req: Request, params: Record<string, string>) {
  const token = Deno.env.get('TWILIO_AUTH_TOKEN');
  const signature = req.headers.get('x-twilio-signature');
  if (!token || !signature || !twilio.validateRequest(token, signature, requestUrlForTwilioSignature(req), params)) {
    throw new Error('Invalid Twilio webhook signature');
  }
}

async function readBody(req: Request) {
  const raw = await req.text();
  if ((req.headers.get('content-type') || '').includes('application/json')) {
    return { raw, data: JSON.parse(raw || '{}') };
  }
  return { raw, data: Object.fromEntries(new URLSearchParams(raw)) };
}

async function read(result: any, message: string) {
  if (result?.error) throw new Error(result.error.message || message);
  return result?.data;
}

async function fetchMeta(path: string, accessToken: string, params: Record<string, string> = {}) {
  const url = new URL(`${graphBase()}${path}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value) url.searchParams.set(key, value);
  });
  url.searchParams.set('access_token', accessToken);
  const response = await fetch(url.toString());
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || `Meta request failed with ${response.status}`);
  return data;
}

async function loadIntegrationByPage(db: any, pageId: string) {
  const rows = await read(
    await db.database.from('tenant_meta_integrations').select('*').eq('page_id', pageId).limit(1),
    'Failed to resolve Meta integration',
  );
  return rows?.[0] || null;
}

async function loadCredential(db: any, integration: any) {
  const rows = await read(
    await db.database.from('tenant_meta_credentials').select('*')
      .eq('tenant_id', integration.tenant_id)
      .eq('meta_integration_id', integration.id)
      .limit(1),
    'Failed to load Meta credentials',
  );
  if (!rows?.[0]) throw new Error('Meta credentials are unavailable');
  return decrypt(rows[0].encrypted_payload);
}

async function pageAccessToken(db: any, integration: any) {
  const credential = await loadCredential(db, integration);
  const userToken = credential.accessToken;
  const pages = await fetchMeta('/me/accounts', userToken, { fields: 'id,access_token', limit: '100' }).catch(() => ({ data: [] }));
  const page = (pages.data || []).find((item: any) => String(item.id) === String(integration.page_id));
  return page?.access_token || userToken;
}

function fieldMap(fieldData: any[]) {
  const out: JsonRecord = {};
  for (const field of Array.isArray(fieldData) ? fieldData : []) {
    const name = lower(field?.name).replace(/[\s-]+/g, '_');
    const values = Array.isArray(field?.values) ? field.values : [];
    const value = values.length > 1 ? values.join(', ') : values[0];
    if (name) out[name] = value;
  }
  return out;
}

function pickMapped(fields: JsonRecord, aliases: string[]) {
  for (const alias of aliases) {
    if (fields[alias] !== undefined && fields[alias] !== null && String(fields[alias]).trim() !== '') return String(fields[alias]).trim();
  }
  return '';
}

function truthyConsent(value: unknown) {
  const text = lower(value);
  if (!text) return null;
  if (['yes', 'true', '1', 'y', 'approved', 'agree', 'agreed', 'consent', 'opt_in', 'opt-in', 'subscribed'].includes(text)) return true;
  if (['no', 'false', '0', 'n', 'denied', 'decline', 'declined', 'opt_out', 'opt-out', 'unsubscribed'].includes(text)) return false;
  return /yes|agree|consent|permission|subscribe|opt.?in/i.test(text) ? true : null;
}

function consentFromFields(fields: JsonRecord, channel: string, fallback = true) {
  const channelKeys = Object.keys(fields).filter((key) => key.includes(channel) && /consent|permission|opt|subscribe|contact/i.test(key));
  const genericKeys = Object.keys(fields).filter((key) => !key.includes('do_not') && /consent|permission|opt_in|subscribe|contact_permission/i.test(key));
  for (const key of [...channelKeys, ...genericKeys]) {
    const consent = truthyConsent(fields[key]);
    if (consent !== null) return consent;
  }
  return fallback;
}

function leadNameParts(fields: JsonRecord) {
  const fullName = pickMapped(fields, ['full_name', 'name', 'your_name', 'contact_name']);
  const firstName = pickMapped(fields, ['first_name', 'firstname', 'first']);
  const lastName = pickMapped(fields, ['last_name', 'lastname', 'last']);
  if (!fullName && (firstName || lastName)) return { fullName: [firstName, lastName].filter(Boolean).join(' '), firstName, lastName };
  if (fullName && (!firstName || !lastName)) {
    const parts = fullName.split(/\s+/);
    return { fullName, firstName: firstName || parts[0] || '', lastName: lastName || parts.slice(1).join(' ') };
  }
  return { fullName, firstName, lastName };
}

function metaLeadPayload(input: { tenantId: string; form: any; integration: any; metaLead: any; fields: JsonRecord }) {
  const { tenantId, form, integration, metaLead, fields } = input;
  const names = leadNameParts(fields);
  const email = pickMapped(fields, ['email', 'email_address', 'work_email']);
  const phone = normalizePhone(pickMapped(fields, ['phone_number', 'phone', 'mobile_phone', 'mobile', 'telephone']));
  const serviceInterest = pickMapped(fields, ['service_interest', 'service', 'interested_in', 'coverage_type_needed', 'what_service_do_you_need']);
  const sourceLabel = form.source_label || integration.metadata?.sourceLabel || 'Facebook';
  return {
    tenant_id: tenantId,
    email: email || null,
    phone: phone || null,
    first_name: names.firstName || null,
    last_name: names.lastName || null,
    full_name: names.fullName || email || phone || 'Facebook lead',
    company: pickMapped(fields, ['company', 'company_name', 'business_name']) || null,
    job_title: pickMapped(fields, ['job_title', 'role', 'position']) || null,
    lead_source: sourceLabel,
    source: 'facebook_lead_ads',
    status: 'new',
    custom_fields: {
      facebookLeadAd: {
        fieldData: fields,
        sourceLabel,
        receivedAt: new Date().toISOString(),
      },
    },
    assigned_tenant_agent_id: form.assigned_agent_id || null,
    service_interest: serviceInterest || null,
    location_summary: pickMapped(fields, ['city', 'location', 'zip_code', 'postal_code']) || null,
    preferred_contact_channel: email ? 'email' : phone ? 'call' : 'email',
    call_consent: Boolean(phone && consentFromFields(fields, 'call', true)),
    sms_consent: Boolean(phone && consentFromFields(fields, 'sms', true)),
    whatsapp_consent: Boolean(phone && consentFromFields(fields, 'whatsapp', true)),
    email_consent: Boolean(email && consentFromFields(fields, 'email', true)),
    lead_stage: 'new',
    scheduling_state: 'not_started',
    meta_provider_lead_id: String(metaLead.id || metaLead.leadgen_id || ''),
    meta_page_id: integration.page_id || form.page_id || metaLead.page_id || null,
    meta_form_id: form.form_id || metaLead.form_id || null,
    meta_campaign_id: metaLead.campaign_id || null,
    meta_campaign_name: metaLead.campaign_name || null,
    meta_adset_id: metaLead.adset_id || metaLead.adgroup_id || null,
    meta_adset_name: metaLead.adset_name || metaLead.adgroup_name || null,
    meta_ad_id: metaLead.ad_id || null,
    meta_ad_name: metaLead.ad_name || null,
    meta_source_label: sourceLabel,
    meta_raw_attribution: {
      createdTime: metaLead.created_time || null,
      platform: metaLead.platform || null,
      campaignId: metaLead.campaign_id || null,
      adsetId: metaLead.adset_id || metaLead.adgroup_id || null,
      adId: metaLead.ad_id || null,
      formName: form.form_name || null,
    },
  };
}

async function findExistingLead(db: any, tenantId: string, payload: JsonRecord) {
  if (payload.meta_provider_lead_id) {
    const rows = await read(
      await db.database.from('leads').select('*').eq('tenant_id', tenantId).eq('meta_provider_lead_id', payload.meta_provider_lead_id).limit(1),
      'Failed to match Meta lead',
    );
    if (rows?.[0]) return rows[0];
  }
  if (payload.email) {
    const rows = await read(
      await db.database.from('leads').select('*').eq('tenant_id', tenantId).ilike('email', payload.email).limit(1),
      'Failed to match lead email',
    );
    if (rows?.[0]) return rows[0];
  }
  if (payload.phone) {
    const rows = await read(
      await db.database.from('leads').select('*').eq('tenant_id', tenantId).or(`phone.eq.${payload.phone},phone.eq.${payload.phone.slice(1)}`).limit(1),
      'Failed to match lead phone',
    );
    if (rows?.[0]) return rows[0];
  }
  return null;
}

async function upsertLead(db: any, tenantId: string, payload: JsonRecord) {
  const existing = await findExistingLead(db, tenantId, payload);
  if (existing?.id) {
    const patch = {
      ...payload,
      email: existing.email || payload.email,
      phone: existing.phone || payload.phone,
      full_name: existing.full_name || payload.full_name,
      custom_fields: { ...(existing.custom_fields || {}), ...(payload.custom_fields || {}) },
      updated_at: new Date().toISOString(),
    };
    const rows = await read(
      await db.database.from('leads').update(patch).eq('tenant_id', tenantId).eq('id', existing.id).select(),
      'Failed to update Facebook lead',
    );
    return { lead: rows?.[0], created: false };
  }
  const rows = await read(await db.database.from('leads').insert([payload]).select(), 'Failed to create Facebook lead');
  return { lead: rows?.[0], created: true };
}

async function ensureConversation(db: any, tenantId: string, lead: any, channel: string, metadata: JsonRecord = {}) {
  const rows = await read(
    await db.database.from('lead_conversations').select('*')
      .eq('tenant_id', tenantId)
      .eq('lead_id', lead.id)
      .eq('channel', channel)
      .limit(1),
    'Failed to load lead conversation',
  );
  if (rows?.[0]) return rows[0];
  const created = await read(
    await db.database.from('lead_conversations').insert([{
      tenant_id: tenantId,
      lead_id: lead.id,
      channel,
      status: 'active',
      conversation_status: 'active_nurture',
      metadata,
    }]).select(),
    'Failed to create lead conversation',
  );
  return created?.[0] || null;
}

async function insertMessage(db: any, row: JsonRecord) {
  const rows = await read(await db.database.from('lead_conversation_messages').insert([row]).select(), 'Failed to record message');
  return rows?.[0] || null;
}

async function recordProviderEvent(db: any, input: JsonRecord) {
  const existing = await read(
    await db.database.from('tenant_meta_provider_events').select('*')
      .eq('provider', 'meta')
      .eq('event_type', input.event_type)
      .eq('provider_event_id', input.provider_event_id)
      .limit(1),
    'Failed to load provider event',
  );
  if (existing?.[0]) {
    const reusable = ['received', 'failed'].includes(existing[0].status);
    return { event: existing[0], duplicate: !reusable };
  }
  const rows = await read(
    await db.database.from('tenant_meta_provider_events').insert([{
      provider: 'meta',
      status: 'received',
      ...input,
    }]).select(),
    'Failed to record provider event',
  );
  return { event: rows?.[0], duplicate: false };
}

async function patchProviderEvent(db: any, eventId: string, patch: JsonRecord) {
  await db.database.from('tenant_meta_provider_events').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', eventId);
}

async function callLifecycle(db: any, input: JsonRecord) {
  const base = (Deno.env.get('INSFORGE_FUNCTION_BASE_URL') || '').replace(/\/$/, '');
  const secret = Deno.env.get('MESSAGE_ACTIONS_SECRET') || Deno.env.get('ELEVENLABS_TOOL_SECRET') || '';
  if (!base || !secret || !input.leadId) return null;
  try {
    const response = await fetch(`${base}/bob-queue-actions?action=evaluate-lifecycle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Message-Actions-Secret': secret, 'X-ElevenLabs-Tool-Secret': secret },
      body: JSON.stringify(input),
    });
    return await response.json().catch(() => null);
  } catch {
    return null;
  }
}

function messengerLifecycleOutcome(draft: any, fallback = 'answered') {
  if (draft?.optOutIntent || ['opt_out', 'wrong_number', 'not_interested_final'].includes(draft?.detectedIntent)) {
    if (draft?.detectedIntent === 'wrong_number') return 'wrong_number';
    if (draft?.detectedIntent === 'not_interested_final') return 'not_interested_final';
    return 'opted_out';
  }
  return draft?.lifecycleRecommendation?.outcome || fallback;
}

async function messagingBrain(input: JsonRecord) {
  const base = (Deno.env.get('INSFORGE_FUNCTION_BASE_URL') || '').replace(/\/$/, '');
  const secret = Deno.env.get('MESSAGE_ACTIONS_SECRET') || Deno.env.get('ELEVENLABS_TOOL_SECRET') || '';
  if (!base || !secret) throw new Error('Messaging brain runtime is not configured');
  const response = await fetch(`${base}/openai-messaging-brain?action=generate-reply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Message-Actions-Secret': secret },
    body: JSON.stringify(input),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.success === false) throw new Error(data?.error || `Messaging brain failed with ${response.status}`);
  return data;
}

async function sendMessengerReply(input: { from: string; to: string; body: string; statusCallback?: string }) {
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
  if (!accountSid || !authToken) throw new Error('Twilio credentials are not configured');
  const form = new URLSearchParams({ From: input.from, To: input.to, Body: input.body });
  if (input.statusCallback) form.set('StatusCallback', input.statusCallback);
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.message || `Twilio Messenger send failed with ${response.status}`);
  return data;
}

async function processLeadgenChange(db: any, change: any) {
  const value = change?.value || {};
  const pageId = String(value.page_id || '');
  const formId = String(value.form_id || '');
  const leadgenId = String(value.leadgen_id || value.lead_id || '');
  if (!pageId || !formId || !leadgenId) return { ignored: true, reason: 'missing_leadgen_identifiers' };

  const integration = await loadIntegrationByPage(db, pageId);
  if (!integration?.id || integration.status !== 'connected' || integration.token_status !== 'active') return { ignored: true, reason: 'integration_not_active' };
  const formRows = await read(
    await db.database.from('tenant_facebook_lead_forms').select('*')
      .eq('tenant_id', integration.tenant_id)
      .eq('form_id', formId)
      .eq('status', 'active')
      .limit(1),
    'Failed to load Facebook lead form',
  );
  const form = formRows?.[0];
  if (!form?.id) return { ignored: true, reason: 'lead_form_not_watched' };

  const eventId = `leadgen:${leadgenId}`;
  const recorded = await recordProviderEvent(db, {
    tenant_id: integration.tenant_id,
    meta_integration_id: integration.id,
    source_channel: 'lead_form',
    event_type: 'leadgen',
    provider_event_id: eventId,
    page_id: pageId,
    form_id: formId,
    provider_lead_id: leadgenId,
    metadata: { providerValue: value },
  });
  if (recorded.duplicate) return { duplicate: true, eventId };

  try {
    const token = await pageAccessToken(db, integration);
    const metaLead = await fetchMeta(`/${leadgenId}`, token, {
      fields: 'id,created_time,field_data,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id,page_id,platform',
    });
    const fields = fieldMap(metaLead.field_data || []);
    const payload = metaLeadPayload({ tenantId: integration.tenant_id, form, integration, metaLead, fields });
    const { lead, created } = await upsertLead(db, integration.tenant_id, payload);
    const conversation = await ensureConversation(db, integration.tenant_id, lead, 'lead_form', {
      source: 'facebook_lead_ads',
      pageId,
      formId,
      leadgenId,
    });
    const message = await insertMessage(db, {
      tenant_id: integration.tenant_id,
      conversation_id: conversation?.id || null,
      lead_id: lead.id,
      direction: 'inbound',
      channel: 'lead_form',
      message_type: 'facebook_lead_form',
      body_text: `Facebook Lead Ads form submitted${form.form_name ? `: ${form.form_name}` : ''}.`,
      provider_message_id: leadgenId,
      provider_status: 'received',
      status: 'received',
      metadata: { pageId, formId, leadgenId, fieldNames: Object.keys(fields), attribution: payload.meta_raw_attribution },
    });
    await patchProviderEvent(db, recorded.event.id, {
      lead_id: lead.id,
      conversation_id: conversation?.id || null,
      message_id: message?.id || null,
      status: 'processed',
      processed_at: new Date().toISOString(),
      metadata: { providerValue: value, createdLead: created, fieldNames: Object.keys(fields) },
    });
    const lifecycle = await callLifecycle(db, {
      tenantId: integration.tenant_id,
      leadId: lead.id,
      outcome: 'answered',
      sourceChannel: 'system',
      requestedChannel: lead.preferred_contact_channel || null,
      metadata: { source: 'phase28_lead_form', formId, leadgenId },
    });
    return { success: true, leadId: lead.id, createdLead: created, lifecycle };
  } catch (error) {
    await patchProviderEvent(db, recorded.event.id, { status: 'failed', error_message: safeError(error) });
    throw error;
  }
}

async function resolveMessengerChannel(db: any, data: Record<string, string>) {
  const to = String(firstValue(data.To, data.Recipient, '') || '');
  const channelMetadata = (() => {
    try { return JSON.parse(String(data.ChannelMetadata || '{}')); } catch { return {}; }
  })();
  const candidates = [
    to,
    to.replace(/^messenger:/i, ''),
    data.MessagingServiceSid,
    data.ToChannelAddress,
    channelMetadata?.page_id,
    channelMetadata?.recipient?.id,
    channelMetadata?.data?.page_id,
  ].filter(Boolean).map(String);

  for (const candidate of candidates) {
    const rows = await read(
      await db.database.from('tenant_messenger_channels').select('*')
        .or(`twilio_sender_id.eq.${candidate},twilio_channel_id.eq.${candidate},page_id.eq.${candidate}`)
        .in('status', ['active', 'needs_attention'])
        .limit(1),
      'Failed to resolve Messenger channel',
    );
    if (rows?.[0]) return rows[0];
  }
  return null;
}

async function findOrCreateMessengerLead(db: any, channel: any, data: Record<string, string>) {
  const sender = String(firstValue(data.From, data.Author, data.Sender, '') || '').trim();
  const messengerId = sender.replace(/^messenger:/i, '') || String(firstValue(data.WaId, data.ProfileName, '') || '').trim();
  if (!messengerId) throw new Error('Messenger sender is missing');
  const tenantId = channel.tenant_id;
  const rows = await read(
    await db.database.from('leads').select('*')
      .eq('tenant_id', tenantId)
      .eq('messenger_provider_id', messengerId)
      .limit(1),
    'Failed to load Messenger lead',
  );
  if (rows?.[0]) return { lead: rows[0], created: false };
  const profileName = String(firstValue(data.ProfileName, data.FromName, '') || '').trim();
  const created = await read(
    await db.database.from('leads').insert([{
      tenant_id: tenantId,
      email: null,
      phone: null,
      full_name: profileName || 'Messenger lead',
      lead_source: channel.source_label || 'Facebook Messenger',
      source: 'facebook_messenger',
      status: 'new',
      custom_fields: { facebookMessenger: { firstInboundAt: new Date().toISOString(), from: data.From || null, profileName: profileName || null } },
      assigned_tenant_agent_id: channel.assigned_agent_id || null,
      preferred_contact_channel: 'messenger',
      lead_stage: 'engaged',
      scheduling_state: 'not_started',
      messenger_provider_id: messengerId,
      meta_page_id: channel.page_id || null,
      meta_source_label: channel.source_label || 'Facebook Messenger',
      meta_raw_attribution: { source: 'facebook_messenger', twilio: { to: data.To || null, messagingServiceSid: data.MessagingServiceSid || null } },
    }]).select(),
    'Failed to create Messenger lead',
  );
  return { lead: created?.[0], created: true };
}

async function handleMessengerInbound(db: any, req: Request) {
  const { data } = await readBody(req);
  requireTwilioSignature(req, data as Record<string, string>);
  const form = data as Record<string, string>;
  const channel = await resolveMessengerChannel(db, form);
  if (!channel?.id) return { ignored: true, reason: 'messenger_channel_not_resolved' };
  const providerMessageId = String(firstValue(form.MessageSid, form.SmsMessageSid, form.Sid, crypto.randomUUID()) || '');
  const eventId = `messenger:${providerMessageId}`;
  const recorded = await recordProviderEvent(db, {
    tenant_id: channel.tenant_id,
    meta_integration_id: channel.meta_integration_id,
    source_channel: 'messenger',
    event_type: 'messenger_inbound',
    provider_event_id: eventId,
    page_id: channel.page_id,
    provider_message_id: providerMessageId,
    metadata: { twilio: { from: form.From || null, to: form.To || null, messagingServiceSid: form.MessagingServiceSid || null } },
  });
  if (recorded.duplicate) return { duplicate: true };

  try {
    const { lead, created } = await findOrCreateMessengerLead(db, channel, form);
    const conversation = await ensureConversation(db, channel.tenant_id, lead, 'messenger', {
      source: 'facebook_messenger',
      pageId: channel.page_id,
      twilioSenderId: channel.twilio_sender_id || null,
      twilioChannelId: channel.twilio_channel_id || null,
    });
    const body = String(form.Body || '').trim();
    const inbound = await insertMessage(db, {
      tenant_id: channel.tenant_id,
      conversation_id: conversation?.id || null,
      lead_id: lead.id,
      direction: 'inbound',
      channel: 'messenger',
      message_type: 'messenger_reply',
      body_text: body,
      provider_message_id: providerMessageId,
      provider_status: 'received',
      status: 'received',
      metadata: { twilio: { from: form.From || null, to: form.To || null }, source: 'facebook_messenger' },
    });
    const now = new Date().toISOString();
    const isStop = STOP_PATTERNS.some((pattern) => pattern.test(body));
    await db.database.from('lead_conversations').update({
      last_inbound_at: now,
      last_intent: isStop ? 'opt_out' : 'messenger_reply',
      last_intent_at: now,
      last_summary: isStop ? 'Lead opted out by Messenger reply.' : 'Lead replied through Facebook Messenger.',
      next_action: isStop ? 'do_not_contact' : 'openai_messenger_reply',
      conversation_status: isStop ? 'closed_opted_out' : 'lead_replied_messenger',
      updated_at: now,
    }).eq('tenant_id', channel.tenant_id).eq('id', conversation.id);

    if (isStop) {
      await db.database.from('leads').update({
        do_not_contact: true,
        opted_out_at: now,
        opt_out_channel: 'all',
        opt_out_reason: 'Inbound Messenger opt-out',
        automation_paused: true,
        lead_stage: 'do_not_contact',
        updated_at: now,
      }).eq('tenant_id', channel.tenant_id).eq('id', lead.id);
      await callLifecycle(db, {
        tenantId: channel.tenant_id,
        leadId: lead.id,
        outcome: 'opted_out',
        sourceChannel: 'messenger',
        requestedChannel: 'messenger',
        metadata: { source: 'phase29_messenger_reply', providerMessageId, inboundMessageId: inbound?.id || null, stopPattern: true },
      });
      await patchProviderEvent(db, recorded.event.id, { lead_id: lead.id, conversation_id: conversation.id, message_id: inbound?.id || null, status: 'processed', processed_at: now });
      return { success: true, optedOut: true };
    }

    let draft: any = null;
    try {
      draft = await messagingBrain({
        tenantId: channel.tenant_id,
        leadId: lead.id,
        tenantAgentId: channel.assigned_agent_id || lead.assigned_tenant_agent_id || null,
        channel: 'messenger',
        source: 'meta-lead-intake',
        inboundText: body,
        conversationId: conversation.id,
        messageId: inbound?.id || null,
      });
      const outcome = messengerLifecycleOutcome(draft);
      if (['opted_out', 'wrong_number', 'not_interested_final'].includes(outcome)) {
        await db.database.from('leads').update({
          do_not_contact: true,
          opted_out_at: new Date().toISOString(),
          opt_out_channel: 'all',
          opt_out_reason: `Inbound Messenger ${outcome}`,
          automation_paused: true,
          lead_stage: 'do_not_contact',
          updated_at: new Date().toISOString(),
        }).eq('tenant_id', channel.tenant_id).eq('id', lead.id);
        await db.database.from('lead_conversations').update({
          conversation_status: 'closed_opted_out',
          last_intent: draft.detectedIntent || 'opt_out',
          last_intent_at: new Date().toISOString(),
          last_summary: draft.reason || 'Lead requested no further Messenger outreach.',
          next_action: 'do_not_contact',
          human_review_required: false,
          updated_at: new Date().toISOString(),
        }).eq('tenant_id', channel.tenant_id).eq('id', conversation.id);
        await callLifecycle(db, {
          tenantId: channel.tenant_id,
          leadId: lead.id,
          outcome,
          sourceChannel: 'messenger',
          requestedChannel: 'messenger',
          metadata: { source: 'phase29_messenger_reply', detectedIntent: draft.detectedIntent || null, providerMessageId, inboundMessageId: inbound?.id || null },
        });
        await patchProviderEvent(db, recorded.event.id, {
          lead_id: lead.id,
          conversation_id: conversation.id,
          message_id: inbound?.id || null,
          status: 'processed',
          processed_at: new Date().toISOString(),
          metadata: { createdLead: created, detectedIntent: draft.detectedIntent || null, providerMessageId, stopped: true },
        });
        return { success: true, leadId: lead.id, stopped: true };
      }
      if (draft?.preferredChannel && ['call', 'sms', 'whatsapp', 'email', 'messenger'].includes(draft.preferredChannel)) {
        await db.database.from('leads').update({ preferred_contact_channel: draft.preferredChannel, updated_at: new Date().toISOString() })
          .eq('tenant_id', channel.tenant_id).eq('id', lead.id);
      }
      if (draft?.replyText) {
        const callback = new URL('/meta-lead-intake', (Deno.env.get('INSFORGE_FUNCTION_BASE_URL') || new URL(req.url).origin).replace(/\/$/, ''));
        callback.searchParams.set('mode', 'messenger-status');
        const provider = await sendMessengerReply({ from: String(form.To || ''), to: String(form.From || ''), body: draft.replyText, statusCallback: callback.toString() });
        const outbound = await insertMessage(db, {
          tenant_id: channel.tenant_id,
          conversation_id: conversation.id,
          lead_id: lead.id,
          direction: 'outbound',
          channel: 'messenger',
          message_type: 'messenger_reply',
          body_text: draft.replyText,
          provider_message_id: provider.sid || null,
          provider_status: provider.status || 'queued',
          status: provider.status || 'queued',
          sent_at: new Date().toISOString(),
          reply_to_message_id: inbound?.id || null,
          ai_model: draft.model || null,
          ai_response_id: draft.responseId || null,
          metadata: { source: 'openai_messenger_reply', messagingBrain: draft },
        });
        await db.database.from('lead_conversations').update({
          last_outbound_at: new Date().toISOString(),
          next_action: draft.lifecycleRecommendation?.nextActionType || 'evaluate_lifecycle',
          human_review_required: Boolean(draft.needsHumanReview),
          updated_at: new Date().toISOString(),
        }).eq('tenant_id', channel.tenant_id).eq('id', conversation.id);
        await patchProviderEvent(db, recorded.event.id, {
          lead_id: lead.id,
          conversation_id: conversation.id,
          message_id: outbound?.id || inbound?.id || null,
          status: 'processed',
          processed_at: new Date().toISOString(),
          metadata: { createdLead: created, detectedIntent: draft.detectedIntent || null, providerMessageId },
        });
      } else {
        await patchProviderEvent(db, recorded.event.id, {
          lead_id: lead.id,
          conversation_id: conversation.id,
          message_id: inbound?.id || null,
          status: 'processed',
          processed_at: new Date().toISOString(),
          metadata: { createdLead: created, detectedIntent: draft?.detectedIntent || null, providerMessageId, replySkipped: true },
        });
      }
    } catch (error) {
      await db.database.from('leads').update({ requires_human_review: true, escalation_reason: 'messenger_reply_failed', updated_at: new Date().toISOString() })
        .eq('tenant_id', channel.tenant_id).eq('id', lead.id);
      await insertMessage(db, {
        tenant_id: channel.tenant_id,
        conversation_id: conversation.id,
        lead_id: lead.id,
        direction: 'system',
        channel: 'messenger',
        message_type: 'messenger_reply_generation_failed',
        body_text: 'Automated Messenger reply could not be generated.',
        status: 'failed',
        error_message: safeError(error),
        reply_to_message_id: inbound?.id || null,
      });
      await patchProviderEvent(db, recorded.event.id, { lead_id: lead.id, conversation_id: conversation.id, message_id: inbound?.id || null, status: 'failed', error_message: safeError(error) });
      return { success: false, error: safeError(error) };
    }

    const lifecycle = await callLifecycle(db, {
      tenantId: channel.tenant_id,
      leadId: lead.id,
      outcome: messengerLifecycleOutcome(draft),
      sourceChannel: 'messenger',
      requestedChannel: draft?.preferredChannel || 'messenger',
      requestedCallbackAt: draft?.requestedCallbackAt || draft?.lifecycleRecommendation?.nextActionAt || null,
      bookingIntent: Boolean(draft?.bookingIntent),
      conversationId: conversation.id,
      metadata: { source: 'phase29_messenger_reply', detectedIntent: draft?.detectedIntent || null, providerMessageId, inboundMessageId: inbound?.id || null },
    });
    return { success: true, leadId: lead.id, createdLead: created, lifecycle };
  } catch (error) {
    await patchProviderEvent(db, recorded.event.id, { status: 'failed', error_message: safeError(error) });
    throw error;
  }
}

async function handleMessengerStatus(db: any, req: Request) {
  const { data } = await readBody(req);
  requireTwilioSignature(req, data as Record<string, string>);
  const sid = String(firstValue((data as any).MessageSid, (data as any).SmsSid, (data as any).Sid, '') || '');
  if (!sid) return { ignored: true };
  const status = lower(firstValue((data as any).MessageStatus, (data as any).SmsStatus, (data as any).Status, 'unknown'));
  await db.database.from('lead_conversation_messages').update({ status, provider_status: status } as any)
    .eq('provider_message_id', sid);
  return { success: true };
}

async function handleMetaWebhook(db: any, req: Request) {
  const { raw, data } = await readBody(req);
  await requireMetaSignature(req, raw);
  const results = [];
  for (const entry of Array.isArray(data.entry) ? data.entry : []) {
    for (const change of Array.isArray(entry.changes) ? entry.changes : []) {
      if (change?.field === 'leadgen') results.push(await processLeadgenChange(db, change));
    }
  }
  return { success: true, processed: results.length, results };
}

export default async function(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  const url = new URL(req.url);
  const mode = url.searchParams.get('mode') || url.searchParams.get('action') || 'meta';
  const db = adminClient();

  try {
    if (req.method === 'GET') {
      if (url.searchParams.get('hub.mode') === 'subscribe') {
        const verifyToken = Deno.env.get('META_WEBHOOK_VERIFY_TOKEN') || '';
        if (verifyToken && url.searchParams.get('hub.verify_token') === verifyToken) {
          return new Response(url.searchParams.get('hub.challenge') || '', { headers: corsHeaders });
        }
        return json({ success: false, error: 'Invalid Meta webhook verify token' }, 403);
      }
      return json({
        success: true,
        service: 'meta-lead-intake',
        actions: ['meta leadgen webhook', 'messenger inbound', 'messenger status'],
        configured: {
          metaVerifyToken: Boolean(Deno.env.get('META_WEBHOOK_VERIFY_TOKEN')),
          metaSignature: Boolean(Deno.env.get('META_APP_SECRET')),
          metaCredentials: Boolean(Deno.env.get('META_TOKEN_ENCRYPTION_KEY')),
          twilio: Boolean(Deno.env.get('TWILIO_ACCOUNT_SID') && Deno.env.get('TWILIO_AUTH_TOKEN')),
          messagingBrain: Boolean(Deno.env.get('INSFORGE_FUNCTION_BASE_URL') && (Deno.env.get('MESSAGE_ACTIONS_SECRET') || Deno.env.get('ELEVENLABS_TOOL_SECRET'))),
        },
      });
    }

    if (mode === 'messenger' || mode === 'messenger-inbound') {
      await handleMessengerInbound(db, req);
      return twilioXml();
    }
    if (mode === 'messenger-status') {
      await handleMessengerStatus(db, req);
      return json({ success: true });
    }
    const result = await handleMetaWebhook(db, req);
    return json(result);
  } catch (error) {
    const message = safeError(error);
    const status = /signature|verify token|unauthorized/i.test(message) ? 401 : 500;
    if (mode === 'messenger' || mode === 'messenger-inbound') return twilioXml();
    return json({ success: false, error: message }, status);
  }
}
