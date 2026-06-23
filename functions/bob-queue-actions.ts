import { createClient } from 'npm:@insforge/sdk';
import twilio from 'npm:twilio';

const CALL_CONTEXT_TTL_MS = 20 * 60 * 1000;

type JsonRecord = Record<string, any>;

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

function normalizePhone(phone: string) {
  const raw = String(phone || '').trim();
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  return digits ? `+${digits}` : raw;
}

function nowIso() {
  return new Date().toISOString();
}

function publicCall(call: any, session: any) {
  return {
    sid: call?.sid || null,
    status: call?.status || 'queued',
    from: call?.from || null,
    to: call?.to || null,
    voiceCallSessionId: session?.id || null,
    conversationId: session?.conversation_id || null,
    tenantAgentId: session?.tenant_agent_id || null,
    elevenlabsAgentId: session?.elevenlabs_agent_id || null,
  };
}

async function unwrap(result: any, message: string) {
  if (result?.error) throw new Error(result.error.message || message);
  return result?.data;
}

function requiredTenantId(input: any) {
  const tenantId = input?.tenantId || input?.tenant_id;
  if (!tenantId) throw new Error('tenantId is required');
  return String(tenantId);
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function randomContextToken() {
  return `${crypto.randomUUID()}.${crypto.randomUUID()}`;
}

async function resolveTenantIdByPhone(db: any, phone: string) {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;
  const { data } = await db.database.rpc('resolve_tenant_by_phone_number', {
    p_phone_number: normalized,
  });
  return data || null;
}

async function getTenantPrimaryPhoneNumber(db: any, tenantId: string) {
  if (!tenantId) return null;
  const { data } = await db.database.rpc('get_tenant_primary_phone_number', {
    p_tenant_id: tenantId,
  });
  return Array.isArray(data) ? data[0] || null : data || null;
}

async function getTenantPhoneNumberForChannel(db: any, tenantId: string, channel: 'voice' | 'sms' | 'whatsapp') {
  if (!tenantId) return null;
  let query = db.database.from('tenant_phone_numbers').select('*').eq('tenant_id', tenantId).eq('status', 'active');
  if (channel === 'voice') query = query.eq('voice_enabled', true);
  if (channel === 'sms') query = query.eq('sms_enabled', true);
  if (channel === 'whatsapp') query = query.eq('whatsapp_status', 'active');
  const rows = await unwrap(
    await query.order('is_primary', { ascending: false }).order('created_at', { ascending: true }).limit(1),
    `Failed to load tenant ${channel} phone number`
  );
  return rows?.[0] || null;
}

async function loadTenant(db: any, tenantId: string) {
  if (!tenantId) return null;
  const rows = await unwrap(
    await db.database.from('tenants').select('*').eq('id', tenantId).limit(1),
    'Failed to load tenant'
  );
  return rows?.[0] || null;
}

async function loadLead(db: any, tenantId: string, leadId: string) {
  if (!leadId) return null;
  const rows = await unwrap(
    await db.database.from('leads').select('*').eq('tenant_id', tenantId).eq('id', leadId).limit(1),
    'Failed to load lead'
  );
  return rows?.[0] || null;
}

async function ensureLeadConversation(db: any, tenantId: string, lead: any, channel: string) {
  if (!lead?.id) return null;
  const existing = await unwrap(
    await db.database
      .from('lead_conversations')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('lead_id', lead.id)
      .eq('channel', channel)
      .limit(1),
    'Failed to load lead conversation'
  );
  if (existing?.[0]) return existing[0];

  const created = await unwrap(
    await db.database
      .from('lead_conversations')
      .insert([{ tenant_id: tenantId, lead_id: lead.id, channel, status: 'active', conversation_status: 'active_voice_call' }])
      .select(),
    'Failed to create lead conversation'
  );
  return created?.[0] || null;
}

async function loadTenantAgent(db: any, tenantId: string, agentId?: string | null) {
  if (!tenantId || !agentId) return null;
  const rows = await unwrap(
    await db.database.from('tenant_agents').select('*').eq('tenant_id', tenantId).eq('id', agentId).limit(1),
    'Failed to load tenant agent'
  );
  return rows?.[0] || null;
}

function isEmailCapableTenantAgent(agent: any) {
  return Boolean(agent?.id && ['live', 'testing', 'active'].includes(String(agent.status || '').toLowerCase()));
}

async function resolveEmailTenantAgent(db: any, tenantId: string, lead?: any, requestedAgentId?: string | null) {
  const requested = requestedAgentId ? await loadTenantAgent(db, tenantId, requestedAgentId) : null;
  if (isEmailCapableTenantAgent(requested)) return requested;

  const assigned = lead?.assigned_tenant_agent_id && lead.assigned_tenant_agent_id !== requestedAgentId
    ? await loadTenantAgent(db, tenantId, lead.assigned_tenant_agent_id)
    : null;
  if (isEmailCapableTenantAgent(assigned)) return assigned;

  const active = await unwrap(
    await db.database
      .from('tenant_agents')
      .select('*')
      .eq('tenant_id', tenantId)
      .in('status', ['live', 'testing', 'active'])
      .order('status', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(25),
    'Failed to load active tenant email agent'
  );
  return (active || []).find(isEmailCapableTenantAgent) || null;
}

function isCallableTenantAgent(agent: any) {
  return Boolean(agent?.id && ['live', 'testing'].includes(agent.status) && agent.elevenlabs_agent_id);
}

async function resolveTenantAgent(db: any, tenantId: string, lead: any, requestedAgentId?: string | null) {
  const requested = requestedAgentId ? await loadTenantAgent(db, tenantId, requestedAgentId) : null;
  if (isCallableTenantAgent(requested)) return requested;

  const assigned = lead?.assigned_tenant_agent_id && lead.assigned_tenant_agent_id !== requestedAgentId
    ? await loadTenantAgent(db, tenantId, lead.assigned_tenant_agent_id)
    : null;
  if (isCallableTenantAgent(assigned)) return assigned;

  if (lead?.id && (requestedAgentId || lead.assigned_tenant_agent_id)) {
    await db.database.from('leads').update({
      assigned_tenant_agent_id: null,
      updated_at: nowIso(),
    }).eq('tenant_id', tenantId).eq('id', lead.id);
  }

  const active = await unwrap(
    await db.database
      .from('tenant_agents')
      .select('*')
      .eq('tenant_id', tenantId)
      .in('status', ['live', 'testing'])
      .order('status', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(25),
    'Failed to load active tenant agent'
  );
  return (active || []).find(isCallableTenantAgent) || null;
}

function channelConsentColumn(channel: string) {
  if (channel === 'call' || channel === 'phone' || channel === 'voice') return 'call_consent';
  if (channel === 'sms') return 'sms_consent';
  if (channel === 'whatsapp') return 'whatsapp_consent';
  if (channel === 'email') return 'email_consent';
  return null;
}

function leadAllowsChannel(lead: any, channel: string) {
  const normalized = channel === 'phone' || channel === 'voice' ? 'call' : channel;
  const consentColumn = channelConsentColumn(normalized);
  if (!consentColumn) return { allowed: false, reason: 'Unsupported outreach channel' };
  if (lead?.do_not_contact) return { allowed: false, reason: 'Lead is marked do not contact' };
  if (lead?.opted_out_at && (!lead.opt_out_channel || lead.opt_out_channel === 'all' || lead.opt_out_channel === normalized)) {
    return { allowed: false, reason: 'Lead opted out of this channel' };
  }
  if (!lead?.[consentColumn]) return { allowed: false, reason: 'Missing channel consent' };
  return { allowed: true, reason: 'Consent is present' };
}

function normalizePreferredContactChannel(value: any) {
  const normalized = String(value || '').trim().toLowerCase().replace(/[\s_-]+/g, '_');
  if (['phone', 'voice', 'call', 'calls', 'phone_call'].includes(normalized)) return 'call';
  if (['email', 'e_mail'].includes(normalized)) return 'email';
  if (['sms', 'text', 'text_message'].includes(normalized)) return 'sms';
  if (['whatsapp', 'wa'].includes(normalized)) return 'whatsapp';
  return normalized || '';
}

function leadPrefersEmail(lead: any) {
  return normalizePreferredContactChannel(lead?.preferred_contact_channel) === 'email';
}

function getTwilioClient() {
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
  if (!accountSid || !authToken) {
    throw new Error('Twilio credentials are not configured for this function');
  }
  return twilio(accountSid, authToken);
}

function functionBaseUrl() {
  const configured = Deno.env.get('INSFORGE_FUNCTION_BASE_URL');
  if (!configured) throw new Error('INSFORGE_FUNCTION_BASE_URL is required for Twilio voice callbacks');
  return configured.replace(/\/$/, '');
}

function voiceWebhookUrl(params: JsonRecord) {
  const url = new URL('/twilio-voice-webhook', functionBaseUrl());
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value) !== '') url.searchParams.set(key, String(value));
  });
  return url.toString();
}

async function startOutboundCall(input: { to: string; from: string; twimlUrl: string; statusCallbackUrl: string }) {
  if (!input.to) throw new Error('Call recipient phone number is required');
  if (!input.from) throw new Error('Caller phone number is required');
  const client = getTwilioClient();
  return client.calls.create({
    to: input.to,
    from: input.from,
    url: input.twimlUrl,
    method: 'POST',
    timeout: 60,
    statusCallback: input.statusCallbackUrl,
    statusCallbackMethod: 'POST',
    statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
  });
}

async function sendDashboardTestSms(db: any, body: JsonRecord) {
  const tenantId = requiredTenantId(body);
  const lead = await loadLead(db, tenantId, body.leadId || body.lead_id);
  if (!lead) throw new Error('Tenant lead was not found');
  const policy = leadAllowsChannel(lead, 'sms');
  if (!policy.allowed) throw new Error(policy.reason);

  const primaryPhone = await getTenantPhoneNumberForChannel(db, tenantId, 'sms');
  const fallbackFrom = normalizePhone(Deno.env.get('TWILIO_PHONE_NUMBER') || '');
  const tenantFrom = primaryPhone?.status === 'active' && primaryPhone?.sms_enabled ? normalizePhone(primaryPhone.phone_number) : '';
  const from = tenantFrom || fallbackFrom;
  const to = normalizePhone(lead.phone || '');
  const message = String(body.message || 'This is a tenant SMS test message. Reply STOP to opt out.').trim();
  if (!from) throw new Error('No tenant or fallback SMS sender is configured');
  if (!to) throw new Error('Lead phone number is required');
  if (!message) throw new Error('SMS message body is required');

  const callback = new URL('/twilio-sms-webhook', functionBaseUrl());
  callback.searchParams.set('mode', 'status');
  const sms = await getTwilioClient().messages.create({
    from,
    to,
    body: message,
    statusCallback: callback.toString(),
  });
  const conversation = await ensureLeadConversation(db, tenantId, lead, 'sms');
  const rows = await unwrap(
    await db.database.from('lead_conversation_messages').insert([{
      tenant_id: tenantId,
      conversation_id: conversation?.id || null,
      lead_id: lead.id,
      direction: 'outbound',
      channel: 'sms',
      message_type: 'sms',
      body_text: message,
      provider_message_id: sms.sid || null,
      provider_status: sms.status || 'queued',
      status: sms.status || 'queued',
      sent_at: nowIso(),
      metadata: { source: 'admin_dashboard_test_sms', senderResolution: tenantFrom ? 'tenant_primary' : 'fallback_secret' },
    }]).select(),
    'Failed to record SMS test message'
  );
  return { providerMessageId: sms.sid || null, status: sms.status || 'queued', message: rows?.[0] || null };
}

function whatsappAddress(phone: string) {
  const normalized = normalizePhone(phone || '');
  return normalized ? `whatsapp:${normalized}` : '';
}

function whatsappTemplateVariables(lead: any) {
  return JSON.stringify({
    '1': leadName(lead),
    '2': 'the AI assistant',
    '3': 'the team',
    '4': lead?.service_interest || 'your request',
  });
}

async function sendDashboardTestWhatsapp(db: any, body: JsonRecord) {
  const tenantId = requiredTenantId(body);
  const lead = await loadLead(db, tenantId, body.leadId || body.lead_id);
  if (!lead) throw new Error('Tenant lead was not found');
  const policy = leadAllowsChannel(lead, 'whatsapp');
  if (!policy.allowed) throw new Error(policy.reason);

  const primaryPhone = await getTenantPhoneNumberForChannel(db, tenantId, 'whatsapp');
  if (!primaryPhone?.phone_number || primaryPhone.status !== 'active') throw new Error('Tenant primary phone number is not active');
  if (primaryPhone.whatsapp_status !== 'active') throw new Error('Tenant WhatsApp account is not active');
  const from = whatsappAddress(primaryPhone.phone_number);
  const to = whatsappAddress(lead.phone || '');
  const message = String(body.message || 'This is a tenant WhatsApp test message. Reply STOP to opt out.').trim();
  if (!from) throw new Error('Tenant WhatsApp sender is not configured');
  if (!to) throw new Error('Lead WhatsApp phone number is required');
  if (!message) throw new Error('WhatsApp message body is required');

  const callback = new URL('/twilio-sms-webhook', functionBaseUrl());
  callback.searchParams.set('mode', 'status');
  const contentSid = Deno.env.get('TWILIO_WHATSAPP_TEMPLATE_CONTENT_SID');
  const whatsappPayload: any = contentSid
    ? { from, to, contentSid, contentVariables: whatsappTemplateVariables(lead), statusCallback: callback.toString() }
    : { from, to, body: message, statusCallback: callback.toString() };
  const whatsapp = await getTwilioClient().messages.create(whatsappPayload);
  const conversation = await ensureLeadConversation(db, tenantId, lead, 'whatsapp');
  const rows = await unwrap(
    await db.database.from('lead_conversation_messages').insert([{
      tenant_id: tenantId,
      conversation_id: conversation?.id || null,
      lead_id: lead.id,
      direction: 'outbound',
      channel: 'whatsapp',
      message_type: 'whatsapp',
      body_text: contentSid ? `WhatsApp template sent: ${contentSid}` : message,
      provider_message_id: whatsapp.sid || null,
      provider_status: whatsapp.status || 'queued',
      status: whatsapp.status || 'queued',
      sent_at: nowIso(),
      metadata: { source: 'admin_dashboard_test_whatsapp', senderResolution: 'tenant_primary', contentSid: contentSid || null },
    }]).select(),
    'Failed to record WhatsApp test message'
  );
  return { providerMessageId: whatsapp.sid || null, status: whatsapp.status || 'queued', message: rows?.[0] || null };
}

function leadName(lead: any) {
  return lead?.full_name || [lead?.first_name, lead?.last_name].filter(Boolean).join(' ') || 'there';
}

function reboundOpening(input: JsonRecord, lead: any, tenantAgent: any) {
  const agentName = tenantAgent?.display_name || 'the AI assistant';
  const generated = `Hi ${leadName(lead)}, this is ${agentName}. Sorry for the interruption, I am calling back to continue helping with your request.`;
  const requested = String(input.reboundOpening || input.rebound_opening || '').trim();
  if (!requested) return generated;
  return requested.replace(/\b(Bob|James)\b/g, agentName);
}

function defaultCampaignSmsBody(input: { tenant?: any; agent?: any; lead: any }) {
  const tenantName = input.tenant?.name || 'our team';
  const agentName = input.agent?.display_name || 'the AI assistant';
  const service = input.lead?.service_interest ? ` about ${input.lead.service_interest}` : '';
  return `Hi ${leadName(input.lead)}, this is ${agentName} from ${tenantName}. We’re following up${service}. Reply here and we can help book the best time. Reply STOP to opt out.`;
}

function defaultCampaignEmailMessage(input: { tenant?: any; agent?: any; lead: any }) {
  const tenantName = input.tenant?.name || 'our team';
  const agentName = input.agent?.display_name || 'the AI assistant';
  const service = input.lead?.service_interest ? ` about ${input.lead.service_interest}` : '';
  return [
    `Write a concise follow-up email from ${agentName} at ${tenantName}.`,
    `The lead preferred email, so do not mention that we tried to call first.`,
    `Purpose: follow up${service} and help them book the next best appointment time.`,
    input.lead?.qualification_notes ? `Lead notes: ${input.lead.qualification_notes}.` : '',
    input.lead?.preferred_meeting_window ? `Preferred meeting window: ${input.lead.preferred_meeting_window}.` : '',
    'Use available tenant/agent/lead context. Keep it warm, specific, and action-oriented.',
  ].filter(Boolean).join(' ');
}

function escapeHtml(value: unknown) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function safeSenderName(value: unknown) {
  return String(value || '').trim().replace(/[<>]/g, '').slice(0, 80);
}

function normalizeEmail(value: unknown) {
  const text = typeof value === 'object' && value !== null
    ? String((value as JsonRecord).email || (value as JsonRecord).address || '')
    : String(value || '');
  const match = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return (match?.[0] || '').trim().toLowerCase();
}

function emailDomain(value: unknown) {
  const email = normalizeEmail(value);
  return email.includes('@') ? email.split('@').pop() || '' : '';
}

function agentEmailLocalPart(agent?: any) {
  const local = String(agent?.display_name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 48);
  return local || 'bob';
}

function savedAgentEmail(agent?: any) {
  const email = String(agent?.email_address || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

function platformEmailSender(agent?: any) {
  const fallbackEmail = Deno.env.get('EMAIL_FROM');
  if (!fallbackEmail) throw new Error('EMAIL_FROM is not configured');
  const domain = emailDomain(fallbackEmail);
  if (!domain) throw new Error('EMAIL_FROM must include a valid domain');
  const fromName = safeSenderName(agent?.display_name) || Deno.env.get('EMAIL_FROM_NAME') || 'Bob Automation';
  const fromEmail = savedAgentEmail(agent) || `${agentEmailLocalPart(agent)}@${domain}`;
  return {
    from: `${fromName} <${fromEmail}>`,
    fromName,
    fromEmail,
    replyTo: fromEmail,
    resolution: 'platform_fallback',
  };
}

function extractOutputText(response: any) {
  if (response?.output_text) return response.output_text;
  return (response?.output || []).flatMap((item: any) => item?.content || [])
    .filter((content: any) => content?.type === 'output_text')
    .map((content: any) => content.text)
    .join('');
}

async function draftQueuedEmail(input: { tenant?: any; agent?: any; lead: any; message: string }) {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  const fallbackSubject = input.lead?.service_interest ? `Following up about ${input.lead.service_interest}` : 'Following up';
  const fallbackText = [
    `Hi ${leadName(input.lead)},`,
    `${input.agent?.display_name || 'I'} from ${input.tenant?.name || 'our team'} here. I’m following up to help you book the best time for a quick call${input.lead?.service_interest ? ` about ${input.lead.service_interest}` : ''}.`,
    input.lead?.preferred_meeting_window
      ? `I saw your preferred time is ${input.lead.preferred_meeting_window}. Does that still work for you?`
      : 'What day and time works best for you?',
    'Thank you.',
  ].join('\n\n');
  const fallback = {
    subject: fallbackSubject,
    text: fallbackText,
    html: fallbackText.split('\n\n').map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join(''),
    model: 'deterministic-queued-email-fallback',
    responseId: null,
    generatedBy: 'template',
    generationError: apiKey ? null : 'OPENAI_API_KEY is not configured',
  };
  if (!apiKey) return fallback;

  const model = Deno.env.get('OPENAI_EMAIL_MODEL') || 'gpt-5.5';
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      instructions: [
        'You write concise, accurate automated business emails.',
        'Return only valid JSON with keys subject, text, and html.',
        'This is the AI agent starting the conversation by email first, so do not imply the lead emailed first.',
        'Primary goal: help the lead book a quick call as soon as possible.',
        'Do not ask long qualification questions when the lead already provided context.',
        'Never invent prices, promises, availability, policies, discounts, or booking links.',
        'Use only simple safe HTML tags: p, strong, em, ul, li, a, br.',
      ].join(' '),
      input: JSON.stringify({
        tenant: { name: input.tenant?.name || null, industry: input.tenant?.industry || null },
        agent: { name: input.agent?.display_name || 'the AI assistant', email: savedAgentEmail(input.agent) || null },
        lead: {
          name: leadName(input.lead),
          email: input.lead?.email || null,
          serviceInterest: input.lead?.service_interest || null,
          preferredMeetingWindow: input.lead?.preferred_meeting_window || null,
          qualificationNotes: input.lead?.qualification_notes || null,
          preferredContactChannel: input.lead?.preferred_contact_channel || null,
        },
        requestedMessage: input.message,
      }),
      text: {
        format: {
          type: 'json_schema',
          name: 'queued_first_email',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            required: ['subject', 'text', 'html'],
            properties: {
              subject: { type: 'string' },
              text: { type: 'string' },
              html: { type: 'string' },
            },
          },
        },
      },
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { ...fallback, generationError: data?.error?.message || `OpenAI email draft failed with ${response.status}` };
  try {
    const draft = JSON.parse(extractOutputText(data));
    if (draft?.subject && draft?.text && draft?.html) {
      return { ...draft, model, responseId: data.id || null, generatedBy: 'openai', generationError: null };
    }
  } catch {
    // Fall through to deterministic copy if OpenAI returns malformed JSON.
  }
  return { ...fallback, generationError: 'OpenAI returned an invalid queued email draft' };
}

async function sendResendEmail(input: { sender: ReturnType<typeof platformEmailSender>; to: string; draft: any }) {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) throw new Error('RESEND_API_KEY is not configured');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: input.sender.from,
      to: [input.to],
      subject: input.draft.subject,
      html: input.draft.html,
      text: input.draft.text,
      reply_to: input.sender.replyTo,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.message || data?.error || `Resend send failed with ${response.status}`);
  return data;
}

async function sendTenantEmailDirect(db: any, input: {
  tenantId: string;
  lead: any;
  agent?: any;
  tenant?: any;
  message: string;
  source: string;
  conversationId?: string | null;
  metadata?: JsonRecord;
}) {
  const policy = leadAllowsChannel(input.lead, 'email');
  if (!policy.allowed) throw new Error(policy.reason);
  if (!input.lead?.email) throw new Error('Lead email address is required');
  const conversation = input.conversationId
    ? null
    : await ensureLeadConversation(db, input.tenantId, input.lead, 'email');
  const conversationId = input.conversationId || conversation?.id || null;
  const sender = platformEmailSender(input.agent);
  const draft = await draftQueuedEmail({ tenant: input.tenant, agent: input.agent, lead: input.lead, message: input.message });
  const resend = await sendResendEmail({ sender, to: input.lead.email, draft });
  const now = nowIso();

  const emailRows = await unwrap(
    await db.database.from('email_queue').insert([{
      tenant_id: input.tenantId,
      lead_id: input.lead.id,
      to_email: input.lead.email,
      from_email: sender.fromEmail,
      sender_display_name: sender.fromName,
      reply_to_email: sender.replyTo,
      sender_resolution: sender.resolution,
      delivery_provider: 'resend',
      provider_message_id: resend?.id || null,
      message_id: resend?.id || null,
      subject: draft.subject,
      html_content: draft.html,
      text_content: draft.text,
      email_type: 'follow_up',
      status: 'sent',
      sent_at: now,
      generated_by: draft.generatedBy || 'openai',
      generation_model: draft.model || null,
      generation_status: draft.generationError ? 'failed' : 'generated',
      generation_error: draft.generationError || null,
      generated_at: now,
      metadata: {
        source: input.source,
        conversationId,
        openaiResponseId: draft.responseId || null,
        resend,
        ...(input.metadata || {}),
      },
    }]).select(),
    'Failed to record queued email delivery'
  );
  const messageRows = await unwrap(
    await db.database.from('lead_conversation_messages').insert([{
      tenant_id: input.tenantId,
      conversation_id: conversationId,
      lead_id: input.lead.id,
      direction: 'outbound',
      channel: 'email',
      message_type: 'email_first_touch',
      subject: draft.subject,
      body_text: draft.text,
      body_html: draft.html,
      provider_message_id: resend?.id || null,
      provider_status: 'sent',
      status: 'sent',
      sent_at: now,
      ai_model: draft.model || null,
      ai_response_id: draft.responseId || null,
      metadata: {
        source: input.source,
        from: sender.fromEmail,
        emailQueueId: emailRows?.[0]?.id || null,
        ...(input.metadata || {}),
      },
    }]).select(),
    'Failed to record queued email timeline row'
  );
  await db.database.from('leads').update({ last_contacted_at: now, updated_at: now }).eq('tenant_id', input.tenantId).eq('id', input.lead.id);
  return {
    queued: emailRows?.[0] || null,
    message: messageRows?.[0] || null,
    resend,
    sender: { fromEmail: sender.fromEmail, resolution: sender.resolution },
    draft: { model: draft.model, subject: draft.subject, generatedBy: draft.generatedBy },
  };
}

async function sendTenantSms(db: any, input: { tenantId: string; lead: any; message: string; source: string; conversationId?: string | null; metadata?: JsonRecord }) {
  const policy = leadAllowsChannel(input.lead, 'sms');
  if (!policy.allowed) throw new Error(policy.reason);

  const primaryPhone = await getTenantPhoneNumberForChannel(db, input.tenantId, 'sms');
  const fallbackFrom = normalizePhone(Deno.env.get('TWILIO_PHONE_NUMBER') || '');
  const tenantFrom = primaryPhone?.status === 'active' && primaryPhone?.sms_enabled ? normalizePhone(primaryPhone.phone_number) : '';
  const from = tenantFrom || fallbackFrom;
  const to = normalizePhone(input.lead.phone || '');
  const message = String(input.message || '').trim();
  if (!from) throw new Error('No tenant or fallback SMS sender is configured');
  if (!to) throw new Error('Lead phone number is required');
  if (!message) throw new Error('SMS message body is required');

  const callback = new URL('/twilio-sms-webhook', functionBaseUrl());
  callback.searchParams.set('mode', 'status');
  const sms = await getTwilioClient().messages.create({
    from,
    to,
    body: message,
    statusCallback: callback.toString(),
  });
  const conversation = input.conversationId
    ? { id: input.conversationId }
    : await ensureLeadConversation(db, input.tenantId, input.lead, 'sms');
  const rows = await unwrap(
    await db.database.from('lead_conversation_messages').insert([{
      tenant_id: input.tenantId,
      conversation_id: conversation?.id || null,
      lead_id: input.lead.id,
      direction: 'outbound',
      channel: 'sms',
      message_type: 'sms',
      body_text: message,
      provider_message_id: sms.sid || null,
      provider_status: sms.status || 'queued',
      status: sms.status || 'queued',
      sent_at: nowIso(),
      metadata: {
        source: input.source,
        senderResolution: tenantFrom ? 'tenant_primary' : 'fallback_secret',
        ...(input.metadata || {}),
      },
    }]).select(),
    'Failed to record SMS message'
  );
  return { providerMessageId: sms.sid || null, status: sms.status || 'queued', message: rows?.[0] || null };
}

async function createVoiceCallSession(db: any, input: JsonRecord) {
  const tenantId = requiredTenantId(input);
  const leadId = input.leadId || input.lead_id || null;
  const lead = await loadLead(db, tenantId, leadId);

  if (leadId && !lead) throw new Error('Lead not found for voice call');
  if (lead) {
    if (leadPrefersEmail(lead)) {
      throw new Error('Lead prefers email; voice call is blocked and email follow-up should be sent instead');
    }
    const policy = leadAllowsChannel(lead, 'call');
    if (!policy.allowed) throw new Error(policy.reason);
  } else if (!input.callConsent) {
    throw new Error('Call consent is required for direct test calls');
  }

  const tenantAgent = await resolveTenantAgent(db, tenantId, lead, input.tenantAgentId || input.tenant_agent_id || input.agentId);
  if (!tenantAgent?.id) throw new Error('No tenant AI agent is configured for this call');
  if (!tenantAgent.elevenlabs_agent_id) throw new Error('Tenant AI agent is not synced to ElevenLabs yet');

  const primaryPhoneNumber = await getTenantPhoneNumberForChannel(db, tenantId, 'voice');
  const from = normalizePhone(input.from || primaryPhoneNumber?.phone_number || Deno.env.get('TWILIO_PHONE_NUMBER') || '');
  const to = normalizePhone(input.to || lead?.phone || '');
  if (!from) throw new Error('No tenant or fallback caller phone number is configured');
  if (!to) throw new Error('Lead/test recipient phone number is required');

  const bridgeUrl = Deno.env.get('VOICE_MEDIA_BRIDGE_WS_URL');
  if (!bridgeUrl) throw new Error('VOICE_MEDIA_BRIDGE_WS_URL is required for Phase 10 voice calls');
  if (!bridgeUrl.startsWith('wss://')) throw new Error('VOICE_MEDIA_BRIDGE_WS_URL must use wss://');

  const conversation = lead
    ? await ensureLeadConversation(db, tenantId, lead, 'voice')
    : null;
  const contextToken = randomContextToken();
  const contextTokenHash = await sha256Hex(contextToken);
  const expiresAt = new Date(Date.now() + CALL_CONTEXT_TTL_MS).toISOString();

  const sessions = await unwrap(
    await db.database.from('voice_call_sessions').insert([{
      tenant_id: tenantId,
      lead_id: lead?.id || null,
      conversation_id: conversation?.id || input.conversationId || input.conversation_id || null,
      bob_action_id: input.actionId || input.action_id || null,
      tenant_agent_id: tenantAgent.id,
      tenant_phone_number_id: primaryPhoneNumber?.id || null,
      direction: 'outbound',
      status: 'queued',
      context_token_hash: contextTokenHash,
      context_expires_at: expiresAt,
      media_bridge_url: bridgeUrl,
      elevenlabs_agent_id: tenantAgent.elevenlabs_agent_id,
      metadata: {
        source: input.source || 'bob_queue_actions',
        to,
        from,
        agentDisplayName: tenantAgent.display_name,
        ...(input.reboundCall || input.rebound_call
          ? {
          reboundCall: true,
          reboundOpening: reboundOpening(input, lead, tenantAgent),
        }
      : {}),
      },
    }]).select(),
    'Failed to create voice call session'
  );

  const session = sessions?.[0] || null;
  const twimlUrl = voiceWebhookUrl({
    mode: 'intro',
    sessionId: session.id,
    actionId: input.actionId || input.action_id || '',
    leadId: lead?.id || '',
    conversationId: conversation?.id || input.conversationId || input.conversation_id || '',
    token: contextToken,
  });
  const statusCallbackUrl = voiceWebhookUrl({
    mode: 'status',
    sessionId: session.id,
    actionId: input.actionId || input.action_id || '',
    leadId: lead?.id || '',
    conversationId: conversation?.id || input.conversationId || input.conversation_id || '',
  });

  return { session, contextToken, to, from, twimlUrl, statusCallbackUrl };
}

async function launchVoiceCall(db: any, input: JsonRecord) {
  const prepared = await createVoiceCallSession(db, input);
  const call = await startOutboundCall({
    to: prepared.to,
    from: prepared.from,
    twimlUrl: prepared.twimlUrl,
    statusCallbackUrl: prepared.statusCallbackUrl,
  });

  const sessions = await unwrap(
    await db.database.from('voice_call_sessions').update({
      twilio_call_sid: call.sid || null,
      status: call.status === 'queued' ? 'ringing' : (call.status || 'ringing'),
      call_started_at: nowIso(),
      metadata: {
        ...(prepared.session.metadata || {}),
        twilioStatus: call.status || null,
      },
    }).eq('id', prepared.session.id).eq('tenant_id', prepared.session.tenant_id).select(),
    'Failed to update voice call session'
  );
  const session = sessions?.[0] || prepared.session;

  if (input.actionId || input.action_id) {
    await db.database.from('bob_actions').update({
      status: 'calling',
      updated_at: nowIso(),
      result: {
        callSid: call.sid || null,
        voiceCallSessionId: session.id,
        providerStatus: call.status || 'queued',
        from: prepared.from,
        to: prepared.to,
      },
    }).eq('id', input.actionId || input.action_id).eq('tenant_id', session.tenant_id);
  }

  if (session.lead_id) {
    await db.database.from('lead_conversation_messages').insert([{
      tenant_id: session.tenant_id,
      lead_id: session.lead_id,
      conversation_id: session.conversation_id,
      direction: 'outbound',
      channel: 'voice',
      message_type: 'voice_call_started',
      body_text: 'Twilio voice call started and connected to the AI voice bridge.',
      provider_message_id: call.sid || null,
      status: 'sent',
      sent_at: nowIso(),
      metadata: { voiceCallSessionId: session.id, tenantAgentId: session.tenant_agent_id },
    }]);
  }

  return publicCall(call, session);
}

const bobQueueActions = ['status', 'tick', 'start-calls', 'skip', 'campaign-pause', 'campaign-resume', 'campaign-stop', 'test-lead', 'test-call', 'test-sms', 'test-whatsapp', 'live-start', 'live-status'];

async function getBobRunStatus(db: any, tenantId: string, leadId: string, conversationId?: string) {
  const { data: leads } = await db.database.from('leads').select('*').eq('tenant_id', tenantId).eq('id', leadId).limit(1);
  const lead = leads?.[0] || null;
  const { data: conversations } = conversationId
    ? await db.database.from('lead_conversations').select('*').eq('tenant_id', tenantId).eq('id', conversationId).limit(1)
    : await db.database.from('lead_conversations').select('*').eq('tenant_id', tenantId).eq('lead_id', leadId).limit(1);
  const conversation = conversations?.[0] || null;
  const { data: actions } = await db.database
    .from('bob_actions')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('lead_id', leadId)
    .order('scheduled_for', { ascending: true })
    .limit(100);
  const { data: voiceCalls } = await db.database
    .from('voice_call_sessions')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .limit(20);
  return { lead, conversation, actions: actions || [], voiceCalls: voiceCalls || [] };
}

async function createLiveLeadRun(db: any, body: any) {
  const tenantId = requiredTenantId(body);
  const tenantAgent = await resolveEmailTenantAgent(db, tenantId, null, body.tenantAgentId || body.tenant_agent_id || body.agentId || body.agent_id);
  const email = body.email || `live-test-${Date.now()}@example.com`;
  const fullName = [body.firstName || 'Live', body.lastName || 'Test'].filter(Boolean).join(' ');
  const { data: leads } = await db.database.from('leads').insert([{
    tenant_id: tenantId,
    email,
    first_name: body.firstName || 'Live',
    last_name: body.lastName || 'Test',
    full_name: fullName,
    phone: body.phone || null,
    source: body.source || 'function_live_test',
    priority: body.priority || 'medium',
    qualification_status: body.qualificationStatus || 'unqualified',
    qualification_score: Number(body.qualificationScore || 0),
    lead_stage: body.leadStage || 'new_inquiry',
    scheduling_state: body.schedulingState || 'not_started',
    preferred_contact_channel: body.preferredContactChannel || 'email',
    preferred_language: body.preferredLanguage || body.preferred_language || null,
    preferred_meeting_window: body.preferredMeetingWindow || null,
    service_interest: body.serviceInterest || null,
    timeline: body.timeline || null,
    budget_range: body.budgetRange || null,
    location_summary: body.locationSummary || null,
    qualification_notes: body.qualificationNotes || null,
    call_consent: Boolean(body.callConsent),
    sms_consent: Boolean(body.smsConsent),
    whatsapp_consent: Boolean(body.whatsappConsent),
    email_consent: Boolean(body.emailConsent || body.includeEmail !== false),
    do_not_contact: Boolean(body.doNotContact),
    assigned_tenant_agent_id: tenantAgent?.id || body.tenantAgentId || body.tenant_agent_id || null,
    status: 'new',
  }]).select();
  const lead = leads?.[0];
  const liveTestEndsAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const { data: conversations } = await db.database.from('lead_conversations').insert([{
    tenant_id: tenantId,
    lead_id: lead.id,
    channel: 'email',
    status: 'active',
    conversation_status: 'live_test',
    metadata: { liveTestEndsAt },
  }]).select();
  const conversation = conversations?.[0];
  const actionRows = [];
  const emailPolicy = leadAllowsChannel(lead, 'email');
  const smsPolicy = leadAllowsChannel(lead, 'sms');
  const callPolicy = leadAllowsChannel(lead, 'call');
  if (body.includeEmail !== false) actionRows.push({ tenant_id: tenantId, lead_id: lead.id, conversation_id: conversation.id, action_type: 'send_email', channel: 'email', status: emailPolicy.allowed ? 'pending' : 'awaiting_human', reason: emailPolicy.allowed ? 'Live test email action' : emailPolicy.reason, scheduled_for: nowIso(), payload: { source: 'function_live_test', contactPolicy: emailPolicy, tenantAgentId: tenantAgent?.id || null, firstTouch: true } });
  if (body.includeSms) actionRows.push({ tenant_id: tenantId, lead_id: lead.id, conversation_id: conversation.id, action_type: 'send_sms', channel: 'sms', status: smsPolicy.allowed ? 'pending' : 'awaiting_human', reason: smsPolicy.allowed ? 'Live test SMS action' : smsPolicy.reason, scheduled_for: nowIso(), payload: { source: 'function_live_test', contactPolicy: smsPolicy } });
  if (body.includeCall && !leadPrefersEmail(lead)) actionRows.push({ tenant_id: tenantId, lead_id: lead.id, conversation_id: conversation.id, action_type: 'queue_call_attempt', channel: 'phone', status: callPolicy.allowed ? 'awaiting_call' : 'awaiting_human', reason: callPolicy.allowed ? 'Live test call action' : callPolicy.reason, scheduled_for: nowIso(), payload: { source: 'function_live_test', contactPolicy: callPolicy, tenantAgentId: body.tenantAgentId || body.tenant_agent_id || null } });
  if (actionRows.length) await db.database.from('bob_actions').insert(actionRows);
  return { lead, conversation, status: await getBobRunStatus(db, tenantId, lead.id, conversation.id) };
}

async function skipBobAction(db: any, tenantId: string, actionId: string) {
  const { data } = await db.database.from('bob_actions').update({
    status: 'skipped',
    executed_at: nowIso(),
    updated_at: nowIso(),
    result: { skippedBy: 'insforge_function' },
  }).eq('tenant_id', tenantId).eq('id', actionId).select();
  return data?.[0] || null;
}

async function updateCampaignExecution(db: any, body: JsonRecord, status: string) {
  const tenantId = requiredTenantId(body);
  const campaignId = body.campaignId || body.campaign_id;
  if (!campaignId) throw new Error('campaignId is required');
  const now = nowIso();
  const campaignPatch: JsonRecord = { status, updated_at: now };
  if (status === 'ACTIVE') campaignPatch.started_at = body.startedAt || body.started_at || now;
  if (status === 'ARCHIVED') campaignPatch.stopped_at = now;
  const campaigns = await unwrap(
    await db.database.from('campaigns').update(campaignPatch).eq('tenant_id', tenantId).eq('id', campaignId).select(),
    'Failed to update campaign'
  );
  if (!campaigns?.[0]) throw new Error('Campaign was not found');
  const leadStatus = status === 'ACTIVE' ? 'queued' : status === 'PAUSED' ? 'paused' : 'stopped';
  await db.database.from('campaign_leads').update({ status: leadStatus, updated_at: now }).eq('tenant_id', tenantId).eq('campaign_id', campaignId).in('status', ['queued', 'running', 'paused']);
  const actionPatch = status === 'ACTIVE'
    ? { status: 'awaiting_call', updated_at: now }
    : { status: status === 'PAUSED' ? 'paused' : 'skipped', updated_at: now, result: { campaignControl: status.toLowerCase(), updatedAt: now } };
  await db.database.from('bob_actions').update(actionPatch).eq('tenant_id', tenantId).eq('campaign_id', campaignId).in('status', ['pending', 'awaiting_call', 'paused']);
  return campaigns[0];
}

async function inspectQueuedBobActions(db: any) {
  const { data } = await db.database
    .from('bob_actions')
    .select('*')
    .in('status', ['pending', 'awaiting_call'])
    .order('scheduled_for', { ascending: true })
    .limit(25);
  return data || [];
}

async function ensureCampaignCallActions(db: any, body: JsonRecord) {
  const tenantId = body.tenantId || body.tenant_id || null;
  let query = db.database
    .from('campaign_leads')
    .select('*')
    .eq('status', 'queued')
    .lte('next_action_at', nowIso())
    .limit(Number(body.limit || 3));
  if (tenantId) query = query.eq('tenant_id', tenantId);
  if (body.campaignId || body.campaign_id) query = query.eq('campaign_id', body.campaignId || body.campaign_id);
  const campaignLeads = await unwrap(await query, 'Failed to load due campaign leads') || [];
  if (!campaignLeads.length) return [];
  const ids = campaignLeads.map((row: any) => row.id);
  let existingQuery = db.database.from('bob_actions').select('campaign_lead_id').in('campaign_lead_id', ids).in('status', ['pending', 'awaiting_call', 'calling']);
  if (tenantId) existingQuery = existingQuery.eq('tenant_id', tenantId);
  const existing = await unwrap(await existingQuery, 'Failed to inspect existing campaign actions') || [];
  const existingIds = new Set(existing.map((row: any) => row.campaign_lead_id));
  const rows = [];
  for (const campaignLead of campaignLeads) {
    if (existingIds.has(campaignLead.id)) continue;
    const rowTenantId = campaignLead.tenant_id;
    const lead = await loadLead(db, rowTenantId, campaignLead.lead_id);
    if (!lead) continue;
    const callPolicy = leadAllowsChannel(lead, 'call');
    const emailPolicy = leadAllowsChannel(lead, 'email');
    if (!lead.assigned_tenant_agent_id && campaignLead.agent_id) {
      await db.database.from('leads').update({ assigned_tenant_agent_id: campaignLead.agent_id, updated_at: nowIso() }).eq('tenant_id', rowTenantId).eq('id', lead.id);
    }
    const smsPolicy = leadAllowsChannel(lead, 'sms');
    const useEmail = leadPrefersEmail(lead) && emailPolicy.allowed;
    const useCall = !useEmail && callPolicy.allowed;
    const useSms = !useEmail && !useCall && smsPolicy.allowed;
    const selectedPolicy = useEmail ? emailPolicy : useCall ? callPolicy : smsPolicy;
    rows.push({
      tenant_id: rowTenantId,
      campaign_id: campaignLead.campaign_id,
      campaign_lead_id: campaignLead.id,
      lead_id: lead.id,
      action_type: useEmail ? 'send_email' : useCall ? 'queue_call_attempt' : 'send_sms',
      channel: useEmail ? 'email' : useCall ? 'phone' : 'sms',
      status: useCall ? 'awaiting_call' : ((useEmail || useSms) ? 'pending' : 'awaiting_human'),
      reason: useEmail ? 'Campaign first step: email preference' : useCall ? 'Campaign first step: call' : (useSms ? 'Campaign fallback: SMS' : callPolicy.reason),
      scheduled_for: nowIso(),
      payload: {
        source: 'campaign_tick',
        campaignLeadId: campaignLead.id,
        tenantAgentId: campaignLead.agent_id || lead.assigned_tenant_agent_id || null,
        contactPolicy: selectedPolicy,
        preferredContactChannel: normalizePreferredContactChannel(lead.preferred_contact_channel),
      },
    });
  }
  if (!rows.length) return [];
  return await unwrap(await db.database.from('bob_actions').insert(rows).select(), 'Failed to create campaign Bob actions') || [];
}

async function sendQueuedSmsActions(db: any, body: JsonRecord) {
  let query = db.database
    .from('bob_actions')
    .select('*')
    .eq('action_type', 'send_sms')
    .eq('status', 'pending')
    .lte('scheduled_for', nowIso())
    .order('scheduled_for', { ascending: true })
    .limit(Number(body.smsLimit || body.limit || 3));
  if (body.tenantId || body.tenant_id) query = query.eq('tenant_id', body.tenantId || body.tenant_id);
  if (body.leadId || body.lead_id) query = query.eq('lead_id', body.leadId || body.lead_id);
  if (body.conversationId || body.conversation_id) query = query.eq('conversation_id', body.conversationId || body.conversation_id);
  if (body.campaignId || body.campaign_id) query = query.eq('campaign_id', body.campaignId || body.campaign_id);

  const actions = await unwrap(await query, 'Failed to load queued SMS actions');
  const results = [];
  for (const action of actions || []) {
    try {
      const tenantId = action.tenant_id;
      const lead = await loadLead(db, tenantId, action.lead_id);
      if (!lead) throw new Error('Lead not found for queued SMS');
      const tenant = await loadTenant(db, tenantId);
      const agent = await resolveEmailTenantAgent(db, tenantId, lead, action.payload?.tenantAgentId || action.payload?.tenant_agent_id || lead.assigned_tenant_agent_id);
      const message = String(action.payload?.message || action.payload?.body || '').trim() || defaultCampaignSmsBody({ tenant, agent, lead });
      const sms = await sendTenantSms(db, {
        tenantId,
        lead,
        conversationId: action.conversation_id || null,
        message,
        source: action.payload?.source || 'queued_bob_action',
        metadata: {
          bobActionId: action.id,
          campaignId: action.campaign_id || null,
          campaignLeadId: action.campaign_lead_id || null,
        },
      });

      await db.database.from('bob_actions').update({
        status: 'completed',
        executed_at: nowIso(),
        updated_at: nowIso(),
        result: {
          providerMessageId: sms.providerMessageId,
          providerStatus: sms.status,
          messageId: sms.message?.id || null,
        },
      }).eq('id', action.id).eq('tenant_id', tenantId);
      if (action.campaign_lead_id) {
        await db.database.from('campaign_leads').update({
          status: 'running',
          current_step: 'sms_sent',
          updated_at: nowIso(),
        }).eq('tenant_id', tenantId).eq('id', action.campaign_lead_id);
      }
      results.push({ actionId: action.id, success: true, sms });
    } catch (error) {
      await db.database.from('bob_actions').update({
        status: 'failed',
        executed_at: nowIso(),
        updated_at: nowIso(),
        result: { error: String(error?.message || 'Queued SMS failed') },
      }).eq('id', action.id).eq('tenant_id', action.tenant_id);
      if (action.campaign_lead_id) {
        await db.database.from('campaign_leads').update({
          status: 'failed',
          current_step: 'sms_failed',
          stop_reason: String(error?.message || 'Queued SMS failed'),
          updated_at: nowIso(),
        }).eq('tenant_id', action.tenant_id).eq('id', action.campaign_lead_id);
      }
      results.push({ actionId: action.id, success: false, error: String(error?.message || 'Queued SMS failed') });
    }
  }
  return results;
}

async function sendQueuedEmailActions(db: any, body: JsonRecord) {
  let query = db.database
    .from('bob_actions')
    .select('*')
    .eq('action_type', 'send_email')
    .eq('status', 'pending')
    .lte('scheduled_for', nowIso())
    .order('scheduled_for', { ascending: true })
    .limit(Number(body.emailLimit || body.limit || 3));
  if (body.tenantId || body.tenant_id) query = query.eq('tenant_id', body.tenantId || body.tenant_id);
  if (body.leadId || body.lead_id) query = query.eq('lead_id', body.leadId || body.lead_id);
  if (body.conversationId || body.conversation_id) query = query.eq('conversation_id', body.conversationId || body.conversation_id);
  if (body.campaignId || body.campaign_id) query = query.eq('campaign_id', body.campaignId || body.campaign_id);

  const actions = await unwrap(await query, 'Failed to load queued email actions');
  const results = [];
  for (const action of actions || []) {
    try {
      const tenantId = action.tenant_id;
      const lead = await loadLead(db, tenantId, action.lead_id);
      if (!lead) throw new Error('Lead not found for queued email');
      const tenant = await loadTenant(db, tenantId);
      const agent = await loadTenantAgent(db, tenantId, action.payload?.tenantAgentId || action.payload?.tenant_agent_id || lead.assigned_tenant_agent_id);
      const message = String(action.payload?.message || action.payload?.body || '').trim() || defaultCampaignEmailMessage({ tenant, agent, lead });
      const email = await sendTenantEmailDirect(db, {
        tenantId,
        lead,
        agent,
        tenant,
        conversationId: action.conversation_id || null,
        message,
        source: action.payload?.source || 'queued_bob_action',
        metadata: {
          bobActionId: action.id,
          campaignId: action.campaign_id || null,
          campaignLeadId: action.campaign_lead_id || null,
          preferredContactChannel: normalizePreferredContactChannel(lead.preferred_contact_channel),
        },
      });

      await db.database.from('bob_actions').update({
        status: 'completed',
        executed_at: nowIso(),
        updated_at: nowIso(),
        result: {
          emailQueueId: email.queued?.id || null,
          providerMessageId: email.resend?.id || null,
          fromEmail: email.sender?.fromEmail || null,
          subject: email.draft?.subject || null,
        },
      }).eq('id', action.id).eq('tenant_id', tenantId);
      if (action.campaign_lead_id) {
        await db.database.from('campaign_leads').update({
          status: 'running',
          current_step: 'email_sent',
          updated_at: nowIso(),
        }).eq('tenant_id', tenantId).eq('id', action.campaign_lead_id);
      }
      results.push({ actionId: action.id, success: true, email });
    } catch (error) {
      await db.database.from('bob_actions').update({
        status: 'failed',
        executed_at: nowIso(),
        updated_at: nowIso(),
        result: { error: String(error?.message || 'Queued email failed') },
      }).eq('id', action.id).eq('tenant_id', action.tenant_id);
      if (action.campaign_lead_id) {
        await db.database.from('campaign_leads').update({
          status: 'failed',
          current_step: 'email_failed',
          stop_reason: String(error?.message || 'Queued email failed'),
          updated_at: nowIso(),
        }).eq('tenant_id', action.tenant_id).eq('id', action.campaign_lead_id);
      }
      results.push({ actionId: action.id, success: false, error: String(error?.message || 'Queued email failed') });
    }
  }
  return results;
}

async function startQueuedCalls(db: any, body: JsonRecord) {
  await ensureCampaignCallActions(db, body);
  const emailResults = await sendQueuedEmailActions(db, body);
  const smsResults = await sendQueuedSmsActions(db, body);
  let query = db.database
    .from('bob_actions')
    .select('*')
    .eq('action_type', 'queue_call_attempt')
    .eq('status', 'awaiting_call')
    .lte('scheduled_for', nowIso())
    .order('scheduled_for', { ascending: true })
    .limit(Number(body.limit || 3));
  if (body.leadId || body.lead_id) query = query.eq('lead_id', body.leadId || body.lead_id);
  if (body.conversationId || body.conversation_id) query = query.eq('conversation_id', body.conversationId || body.conversation_id);
  if (body.campaignId || body.campaign_id) query = query.eq('campaign_id', body.campaignId || body.campaign_id);

  const actions = await unwrap(await query, 'Failed to load queued call actions');
  const results = [];
  for (const action of actions || []) {
    try {
      const lead = await loadLead(db, action.tenant_id, action.lead_id);
      if (leadPrefersEmail(lead)) {
        const emailPolicy = leadAllowsChannel(lead, 'email');
        await db.database.from('bob_actions').update({
          action_type: 'send_email',
          channel: 'email',
          status: emailPolicy.allowed ? 'pending' : 'awaiting_human',
          reason: emailPolicy.allowed ? 'Lead prefers email; call converted to email' : emailPolicy.reason,
          updated_at: nowIso(),
          payload: {
            ...(action.payload || {}),
            convertedFrom: 'queue_call_attempt',
            preferredContactChannel: 'email',
            contactPolicy: emailPolicy,
          },
        }).eq('id', action.id).eq('tenant_id', action.tenant_id);
        results.push({ actionId: action.id, success: true, convertedTo: 'send_email' });
        continue;
      }
      const call = await launchVoiceCall(db, {
        tenantId: action.tenant_id,
        leadId: action.lead_id,
        conversationId: action.conversation_id,
        actionId: action.id,
        tenantAgentId: action.payload?.tenantAgentId || action.payload?.tenant_agent_id || null,
        source: 'queued_call_action',
      });
      if (action.campaign_lead_id) {
        await db.database.from('campaign_leads').update({ status: 'running', current_step: 'call_started', attempt_count: Number(action.result?.attemptCount || 0) + 1, updated_at: nowIso() }).eq('tenant_id', action.tenant_id).eq('id', action.campaign_lead_id);
      }
      results.push({ actionId: action.id, success: true, call });
    } catch (error) {
      await db.database.from('bob_actions').update({
        status: 'failed',
        executed_at: nowIso(),
        updated_at: nowIso(),
        result: { error: String(error?.message || 'Queued call failed') },
      }).eq('id', action.id).eq('tenant_id', action.tenant_id);
      if (action.campaign_lead_id) {
        await db.database.from('campaign_leads').update({ status: 'failed', current_step: 'call_failed', stop_reason: String(error?.message || 'Queued call failed'), updated_at: nowIso() }).eq('tenant_id', action.tenant_id).eq('id', action.campaign_lead_id);
      }
      results.push({ actionId: action.id, success: false, error: String(error?.message || 'Queued call failed') });
    }
  }
  const convertedEmailResults = await sendQueuedEmailActions(db, body);
  return { voiceResults: results, smsResults, emailResults: [...emailResults, ...convertedEmailResults] };
}

async function createFunctionTestLead(db: any, body: any) {
  const tenantId = requiredTenantId(body);
  const tenantAgent = await resolveEmailTenantAgent(db, tenantId, null, body.tenantAgentId || body.tenant_agent_id || body.agentId || body.agent_id);
  const { data } = await db.database.from('leads').insert([{
    tenant_id: tenantId,
    email: body.email || `test-${Date.now()}@example.com`,
    full_name: body.fullName || body.name || 'Test Lead',
    phone: body.phone || null,
    source: 'function_test',
    service_interest: body.serviceInterest || body.service_interest || null,
    preferred_contact_channel: body.preferredContactChannel || body.preferred_contact_channel || 'email',
    location_summary: body.locationSummary || body.location_summary || null,
    preferred_meeting_window: body.preferredMeetingWindow || body.preferred_meeting_window || null,
    call_consent: Boolean(body.callConsent),
    sms_consent: Boolean(body.smsConsent),
    whatsapp_consent: Boolean(body.whatsappConsent),
    email_consent: Boolean(body.emailConsent),
    do_not_contact: Boolean(body.doNotContact),
    assigned_tenant_agent_id: tenantAgent?.id || body.tenantAgentId || body.tenant_agent_id || null,
    status: 'new',
  }]).select();
  return data?.[0] || null;
}

export default async function(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return optionsResponse();

  const db = createInsForgeClient();
  const url = new URL(req.url);
  const action = url.searchParams.get('action') || 'status';
  const body = await readRequestBody(req).catch(() => ({}));

  try {
    if (action === 'skip') {
      const tenantId = requiredTenantId(body);
      const id = body.actionId || url.searchParams.get('actionId');
      if (!id) return jsonResponse({ success: false, error: 'actionId is required' }, 400);
      return jsonResponse({ success: true, action: await skipBobAction(db, tenantId, id) });
    }

    if (action === 'campaign-pause') return jsonResponse({ success: true, campaign: await updateCampaignExecution(db, body, 'PAUSED') });
    if (action === 'campaign-resume') return jsonResponse({ success: true, campaign: await updateCampaignExecution(db, body, 'ACTIVE') });
    if (action === 'campaign-stop') return jsonResponse({ success: true, campaign: await updateCampaignExecution(db, body, 'ARCHIVED') });

    if (action === 'live-start') {
      return jsonResponse({ success: true, ...(await createLiveLeadRun(db, body)) });
    }

    if (action === 'live-status') {
      const tenantId = requiredTenantId(body);
      const leadId = body.leadId || url.searchParams.get('leadId');
      if (!leadId) return jsonResponse({ success: false, error: 'leadId is required' }, 400);
      return jsonResponse({
        success: true,
        status: await getBobRunStatus(db, tenantId, leadId, body.conversationId || url.searchParams.get('conversationId') || undefined),
      });
    }

    if (action === 'tick' || action === 'start-calls') {
      const { voiceResults, smsResults, emailResults } = await startQueuedCalls(db, body);
      if (body.leadId || body.lead_id) {
        const tenantId = requiredTenantId(body);
        const leadId = body.leadId || body.lead_id;
        return jsonResponse({
          success: true,
          tick: {
            processedAt: nowIso(),
            mode: 'function_tick',
            voice: { started: voiceResults.filter((row) => row.success).length, results: voiceResults },
            sms: { sent: smsResults.filter((row) => row.success).length, results: smsResults },
            email: { sent: emailResults.filter((row) => row.success && row.email).length, results: emailResults },
          },
          status: await getBobRunStatus(db, tenantId, leadId, body.conversationId || body.conversation_id),
        });
      }
      return jsonResponse({ success: true, queued: await inspectQueuedBobActions(db), voice: { results: voiceResults }, sms: { results: smsResults }, email: { results: emailResults }, mode: 'function_tick' });
    }

    if (action === 'test-lead') {
      return jsonResponse({ success: true, lead: await createFunctionTestLead(db, body) });
    }

    if (action === 'test-call') {
      return jsonResponse({ success: true, call: await launchVoiceCall(db, { ...body, source: 'direct_test_call' }) });
    }

    if (action === 'test-sms') {
      return jsonResponse({ success: true, message: await sendDashboardTestSms(db, body) });
    }

    if (action === 'test-whatsapp') {
      return jsonResponse({ success: true, message: await sendDashboardTestWhatsapp(db, body) });
    }

    return jsonResponse({
      success: true,
      service: 'bob-queue-actions',
      voiceCalling: {
        configured: Boolean(Deno.env.get('VOICE_MEDIA_BRIDGE_WS_URL') && Deno.env.get('INSFORGE_FUNCTION_BASE_URL')),
        bridgeUrlConfigured: Boolean(Deno.env.get('VOICE_MEDIA_BRIDGE_WS_URL')),
      },
      actions: bobQueueActions,
    });
  } catch (error) {
    return jsonResponse({ success: false, error: error?.message || 'AI queue action failed' }, 500);
  }
}
