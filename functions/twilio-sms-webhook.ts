import { createClient } from 'npm:@insforge/sdk';


const DEFAULT_TENANT_ID = '00000000-0000-4000-8000-000000000001';

function createInsForgeClient() {
  return createClient({
    baseUrl: Deno.env.get('INSFORGE_BASE_URL'),
    anonKey: Deno.env.get('ANON_KEY'),
  });
}


const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

function optionsResponse() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

function jsonResponse(data: unknown, status = 200) {
  return Response.json(data, { status, headers: corsHeaders });
}

async function readRequestBody(req: Request) {
  const text = await req.text();
  const type = req.headers.get('content-type') || '';
  if (type.includes('application/json')) return JSON.parse(text || '{}');
  return Object.fromEntries(new URLSearchParams(text));
}

function emptyTwilioXmlResponse() {
  return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
    headers: { ...corsHeaders, 'Content-Type': 'text/xml' },
  });
}

function twimlResponse(message: string, gatherUrl?: string) {
  const body = gatherUrl
    ? `<Response><Gather input="speech dtmf" action="${gatherUrl}" method="POST" speechTimeout="auto" timeout="6"><Say>${message}</Say></Gather><Say>I did not hear a response. A team member will follow up. Goodbye.</Say><Hangup/></Response>`
    : `<Response><Say>${message}</Say><Hangup/></Response>`;
  return new Response(body, { headers: { ...corsHeaders, 'Content-Type': 'text/xml' } });
}



function normalizePhone(phone: string) {
  const raw = String(phone || '').trim();
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  return digits ? `+${digits}` : raw;
}

async function resolveTenantIdByPhone(db: any, phone: string) {
  const normalized = normalizePhone(phone);
  if (!normalized) return DEFAULT_TENANT_ID;
  const { data } = await db.database.rpc('resolve_tenant_by_phone_number', {
    p_phone_number: normalized,
  });
  return data || DEFAULT_TENANT_ID;
}

async function getTenantPrimaryPhoneNumber(db: any, tenantId: string) {
  if (!tenantId) return null;
  const { data } = await db.database.rpc('get_tenant_primary_phone_number', {
    p_tenant_id: tenantId,
  });
  return Array.isArray(data) ? data[0] || null : data || null;
}

async function findLeadByPhone(db: any, tenantId: string, phone: string) {
  if (!phone) return null;
  const normalized = normalizePhone(phone);
  const { data } = await db.database
    .from('leads')
    .select('*')
    .eq('tenant_id', tenantId)
    .or(`phone.eq.${normalized},phone.eq.${normalized.replace(/^\+/, '')}`)
    .limit(1);
  return data?.[0] || null;
}

async function ensureLeadConversation(db: any, tenantId: string, lead: any, channel: string) {
  const { data: existing } = await db.database
    .from('lead_conversations')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('lead_id', lead.id)
    .eq('channel', channel)
    .limit(1);
  if (existing?.[0]) return existing[0];

  const { data } = await db.database
    .from('lead_conversations')
    .insert([{ tenant_id: tenantId, lead_id: lead.id, channel, status: 'active' }])
    .select();
  return data?.[0] || null;
}

async function loadVoiceContext(db: any, actionId: string, leadId: string, providerData: Record<string, string>) {
  if (actionId) {
    const { data: actions } = await db.database.from('bob_actions').select('*').eq('id', actionId).limit(1);
    if (actions?.[0]?.tenant_id) return { tenantId: actions[0].tenant_id, action: actions[0], lead: null };
  }

  if (leadId) {
    const { data: leads } = await db.database.from('leads').select('*').eq('id', leadId).limit(1);
    if (leads?.[0]?.tenant_id) return { tenantId: leads[0].tenant_id, action: null, lead: leads[0] };
  }

  const tenantId = await resolveTenantIdByPhone(db, providerData.To || providerData.From || '');
  return { tenantId, action: null, lead: null };
}



const stopPatterns = [/\bstop\b/i, /unsubscribe/i, /do not contact/i, /don't text/i, /don't call/i, /not interested/i];

export default async function(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return optionsResponse();

  const db = createInsForgeClient();
  const url = new URL(req.url);
  const mode = url.searchParams.get('mode') || 'inbound';
  const data = await readRequestBody(req);
  const tenantId = await resolveTenantIdByPhone(db, mode === 'status' ? data.From : data.To);
  const lead = await findLeadByPhone(db, tenantId, mode === 'status' ? data.To : data.From);
  if (!lead) return mode === 'status' ? jsonResponse({ success: true, ignored: true }) : emptyTwilioXmlResponse();

  const conversation = await ensureLeadConversation(db, tenantId, lead, 'sms');
  const isStop = stopPatterns.some((pattern) => pattern.test(String(data.Body || '')));

  if (mode === 'status') {
    await db.database.from('lead_conversation_messages').insert([{
      tenant_id: tenantId,
      conversation_id: conversation?.id,
      lead_id: lead.id,
      direction: 'system',
      channel: 'sms',
      message_type: 'sms_delivery_status',
      body_text: `SMS status: ${data.MessageStatus || data.SmsStatus || 'unknown'}`,
      provider_message_id: data.MessageSid || data.SmsSid || null,
      status: 'logged',
      metadata: data,
    }]);
    return jsonResponse({ success: true });
  }

  await db.database.from('lead_conversation_messages').insert([{
    tenant_id: tenantId,
    conversation_id: conversation?.id,
    lead_id: lead.id,
    direction: 'inbound',
    channel: 'sms',
    message_type: 'sms_reply',
    body_text: data.Body || '',
    provider_message_id: data.MessageSid || data.SmsMessageSid || null,
    status: 'received',
    metadata: data,
  }]);
  await db.database.from('lead_conversations').update({
    conversation_status: isStop ? 'closed_opted_out' : 'lead_replied_sms',
    next_action: isStop ? 'do_not_contact' : 'review_sms_reply',
    human_review_required: !isStop,
    last_inbound_at: new Date().toISOString(),
    last_intent: 'sms_reply',
    last_intent_at: new Date().toISOString(),
    last_summary: isStop ? 'Lead opted out by SMS reply.' : `Lead replied by SMS: ${data.Body || ''}`,
    updated_at: new Date().toISOString(),
  }).eq('id', conversation.id).eq('tenant_id', tenantId);
  await db.database.from('leads').update(isStop
    ? {
      sms_consent: false,
      opted_out_at: new Date().toISOString(),
      opt_out_channel: 'sms',
      opt_out_reason: 'Inbound SMS opt-out',
      automation_paused: true,
      requires_human_review: false,
      updated_at: new Date().toISOString(),
    }
    : { last_contacted_at: new Date().toISOString(), requires_human_review: true, escalation_reason: 'sms_reply_needs_review', updated_at: new Date().toISOString() })
    .eq('id', lead.id)
    .eq('tenant_id', tenantId);
  return emptyTwilioXmlResponse();
}
