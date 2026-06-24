import { createClient } from 'npm:@insforge/sdk';
import twilio from 'npm:twilio';

const FAILURE_STATUSES = new Set(['failed', 'undelivered']);
const STOP_PATTERNS = [/\bstop\b/i, /unsubscribe/i, /do not contact/i, /don't text/i, /don't call/i, /not interested/i];
type JsonRecord = Record<string, any>;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Message-Actions-Secret,X-Twilio-Signature',
};

function createInsForgeClient() {
  return createClient({ baseUrl: Deno.env.get('INSFORGE_BASE_URL'), anonKey: Deno.env.get('ANON_KEY') });
}

function jsonResponse(data: unknown, status = 200) {
  return Response.json(data, { status, headers: corsHeaders });
}

function emptyTwilioXmlResponse() {
  return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
    headers: { ...corsHeaders, 'Content-Type': 'text/xml' },
  });
}

async function readRequestBody(req: Request) {
  const text = await req.text();
  if ((req.headers.get('content-type') || '').includes('application/json')) return JSON.parse(text || '{}');
  return Object.fromEntries(new URLSearchParams(text));
}

function firstValue(...values: unknown[]) {
  return values.find((value) => value !== undefined && value !== null && value !== '');
}

function requiredTenantId(input: any) {
  const tenantId = firstValue(input?.tenantId, input?.tenant_id);
  if (!tenantId) throw new Error('tenantId is required');
  return String(tenantId);
}

function normalizePhone(value: unknown) {
  const raw = String(value || '').trim().replace(/^whatsapp:/i, '');
  const digits = raw.replace(/\D/g, '');
  return digits ? `+${digits}` : '';
}

function whatsappAddress(value: unknown) {
  const phone = normalizePhone(value);
  return phone ? `whatsapp:${phone}` : '';
}

function safeError(error: unknown) {
  return error instanceof Error ? error.message : 'Message processing failed';
}

function compactText(value: unknown, maxLength = 1200) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

function functionBaseUrl() {
  return (Deno.env.get('INSFORGE_FUNCTION_BASE_URL') || '').replace(/\/$/, '');
}

function messageActionsSecret() {
  return Deno.env.get('MESSAGE_ACTIONS_SECRET') || Deno.env.get('ELEVENLABS_TOOL_SECRET') || '';
}

function requireMessageActionsSecret(req: Request) {
  const expected = messageActionsSecret();
  if (!expected) throw new Error('Message delivery authorization is not configured');
  const provided = req.headers.get('x-message-actions-secret') || req.headers.get('x-elevenlabs-tool-secret') || '';
  if (provided !== expected) throw new Error('Unauthorized message action');
}

function requestUrlForSignature(req: Request) {
  const configured = Deno.env.get('TWILIO_WEBHOOK_BASE_URL');
  if (configured) return `${configured.replace(/\/$/, '')}/twilio-sms-webhook${new URL(req.url).search}`;
  return req.url;
}

function requireTwilioSignature(req: Request, params: Record<string, string>) {
  const token = Deno.env.get('TWILIO_AUTH_TOKEN');
  const signature = req.headers.get('x-twilio-signature');
  if (!token || !signature || !twilio.validateRequest(token, signature, requestUrlForSignature(req), params)) {
    throw new Error('Invalid Twilio webhook signature');
  }
}

async function resolveTenantIdByPhone(db: any, phone: unknown) {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;
  const { data, error } = await db.database.rpc('resolve_tenant_by_phone_number', { p_phone_number: normalized });
  if (error) throw new Error(error.message || 'Failed to resolve tenant phone number');
  return data || null;
}

async function getTenantPrimaryPhoneNumber(db: any, tenantId: string) {
  const { data, error } = await db.database.rpc('get_tenant_primary_phone_number', { p_tenant_id: tenantId });
  if (error) throw new Error(error.message || 'Failed to load tenant phone number');
  return Array.isArray(data) ? data[0] || null : data || null;
}

async function getTenantPhoneNumberForChannel(db: any, tenantId: string, channel: 'sms' | 'whatsapp') {
  let query = db.database.from('tenant_phone_numbers').select('*').eq('tenant_id', tenantId).eq('status', 'active');
  if (channel === 'sms') query = query.eq('sms_enabled', true);
  if (channel === 'whatsapp') query = query.eq('whatsapp_status', 'active');
  const { data, error } = await query.order('is_primary', { ascending: false }).order('created_at', { ascending: true }).limit(1);
  if (error) throw new Error(error.message || `Failed to load tenant ${channel} phone number`);
  return data?.[0] || null;
}

async function findLeadByPhone(db: any, tenantId: string, phone: unknown) {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;
  const { data, error } = await db.database.from('leads').select('*').eq('tenant_id', tenantId)
    .or(`phone.eq.${normalized},phone.eq.${normalized.slice(1)}`).limit(1);
  if (error) throw new Error(error.message || 'Failed to load lead');
  return data?.[0] || null;
}

async function ensureLeadConversation(db: any, tenantId: string, lead: any, channel: string) {
  const { data: existing, error: existingError } = await db.database.from('lead_conversations').select('*')
    .eq('tenant_id', tenantId).eq('lead_id', lead.id).eq('channel', channel).limit(1);
  if (existingError) throw new Error(existingError.message || 'Failed to load message conversation');
  if (existing?.[0]) return existing[0];
  const { data, error } = await db.database.from('lead_conversations').insert([{
    tenant_id: tenantId, lead_id: lead.id, channel, status: 'active', conversation_status: 'active_nurture',
  }]).select();
  if (error) throw new Error(error.message || 'Failed to create message conversation');
  return data?.[0] || null;
}

function channelAllowed(lead: any, channel: 'sms' | 'whatsapp') {
  if (lead?.do_not_contact) return { allowed: false, reason: 'Lead is marked do not contact' };
  if (lead?.opted_out_at && (!lead.opt_out_channel || lead.opt_out_channel === 'all' || lead.opt_out_channel === channel)) {
    return { allowed: false, reason: `Lead opted out of ${channel}` };
  }
  if (!lead?.[`${channel}_consent`]) return { allowed: false, reason: `Missing ${channel} consent` };
  return { allowed: true, reason: '' };
}

function knowledgeExcerpt(row: JsonRecord, scope: string) {
  const body = compactText(row.body_text || row.metadata?.extractedText || row.metadata?.extracted_text || '', 900);
  const reference = !body && row.source_url ? `Reference URL: ${row.source_url}` : '';
  const fileReference = !body && (row.metadata?.originalFileName || row.storage_key)
    ? `Uploaded document reference: ${row.metadata?.originalFileName || row.storage_key}`
    : '';
  const content = body || reference || fileReference;
  if (!content) return null;
  return {
    scope,
    title: row.title || 'Knowledge document',
    sourceType: row.source_type || null,
    content,
    hasExcerpt: Boolean(body),
  };
}

async function loadKnowledgeContext(db: any, tenant: any, agent: any) {
  if (!tenant?.id) return [];
  const excerpts: JsonRecord[] = [];
  const addRows = (rows: any[], scope: string) => {
    for (const row of rows || []) {
      const excerpt = knowledgeExcerpt(row, scope);
      if (excerpt) excerpts.push(excerpt);
      if (excerpts.length >= 8) break;
    }
  };

  try {
    const { data } = await db.database
      .from('tenant_knowledge_documents')
      .select('title,body_text,source_type,source_url,storage_key,status,tenant_agent_id,metadata,updated_at')
      .eq('tenant_id', tenant.id)
      .in('status', ['ready', 'uploaded'])
      .order('updated_at', { ascending: false })
      .limit(16);
    addRows((data || []).filter((row: any) => !row.tenant_agent_id || row.tenant_agent_id === agent?.id), 'tenant');
  } catch {
    // Knowledge context should not block inbound replies.
  }

  try {
    const assignmentResult = await db.database
      .from('tenant_knowledge_assignments')
      .select('platform_knowledge_document_id')
      .eq('tenant_id', tenant.id)
      .eq('status', 'active')
      .or(agent?.id ? `tenant_agent_id.is.null,tenant_agent_id.eq.${agent.id}` : 'tenant_agent_id.is.null')
      .limit(100);
    const assignedIds = [...new Set((assignmentResult.data || []).map((row: any) => row.platform_knowledge_document_id).filter(Boolean))];
    const platformResult = await db.database
      .from('platform_knowledge_documents')
      .select('id,title,scope,niche_key,body_text,source_type,source_url,storage_key,status,metadata,updated_at')
      .in('status', ['ready', 'uploaded'])
      .order('updated_at', { ascending: false })
      .limit(60);
    addRows((platformResult.data || []).filter((row: any) => (
      row.scope === 'global'
      || (tenant.business_niche && row.scope === 'niche' && row.niche_key === tenant.business_niche)
      || assignedIds.includes(row.id)
    )), 'platform');
  } catch {
    // Shared knowledge is optional for message generation.
  }

  return excerpts.slice(0, 8);
}

async function loadTenantContext(db: any, tenantId: string, lead: any) {
  const [tenantResult, agentResult] = await Promise.all([
    db.database.from('tenants').select('id,name,industry,business_niche,default_timezone').eq('id', tenantId).limit(1),
    lead?.assigned_tenant_agent_id
      ? db.database.from('tenant_agents').select('id,display_name').eq('tenant_id', tenantId).eq('id', lead.assigned_tenant_agent_id).limit(1)
      : Promise.resolve({ data: [] }),
  ]);
  if (tenantResult.error) throw new Error(tenantResult.error.message || 'Failed to load tenant');
  const tenant = tenantResult.data?.[0] || null;
  const agent = agentResult.data?.[0] || null;
  const knowledgeContext = await loadKnowledgeContext(db, tenant, agent);
  return { tenant, agent, knowledgeContext };
}

function extractOutputText(response: any) {
  if (response?.output_text) return response.output_text;
  return (response?.output || []).flatMap((item: any) => item?.content || [])
    .filter((item: any) => item?.type === 'output_text').map((item: any) => item.text).join('');
}

async function draftTextReply(db: any, tenantId: string, lead: any, channel: 'sms' | 'whatsapp', inboundText: string) {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');
  const { tenant, agent, knowledgeContext } = await loadTenantContext(db, tenantId, lead);
  const model = Deno.env.get('OPENAI_TEXT_MODEL') || Deno.env.get('OPENAI_EMAIL_MODEL') || 'gpt-5.5';
  const preferredLanguage = lead?.preferred_language || null;
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      instructions: `Write one concise, helpful business text reply. Return only valid JSON. Use knowledgeContext as source-of-truth context for services, policies, objections, offers, qualification guidance, and booking rules. If a knowledge item is only a file or URL reference without an excerpt, do not claim details from its unseen contents. Never invent prices, availability, booking links, policies, or commitments. If human help is needed, say so briefly and set needs_human_review true. Do not mention internal systems or AI unless the tenant explicitly asked you to.${preferredLanguage ? ` Write the reply in ${preferredLanguage}.` : ''}`,
      input: JSON.stringify({
        channel,
        tenant: { name: tenant?.name || null, industry: tenant?.industry || null },
        agent: { name: agent?.display_name || 'the AI assistant' },
        lead: { name: lead?.full_name || [lead?.first_name, lead?.last_name].filter(Boolean).join(' ') || null, serviceInterest: lead?.service_interest || null, preferredLanguage },
        knowledgeContext,
        inboundMessage: inboundText,
      }),
      text: { format: { type: 'json_schema', name: 'automated_text_reply', strict: true, schema: {
        type: 'object', additionalProperties: false, required: ['reply', 'needs_human_review'],
        properties: { reply: { type: 'string' }, needs_human_review: { type: 'boolean' } },
      } } },
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || `OpenAI text draft failed with ${response.status}`);
  let draft: any;
  try { draft = JSON.parse(extractOutputText(data)); } catch { throw new Error('OpenAI returned an invalid text draft'); }
  const reply = String(draft?.reply || '').trim();
  if (!reply) throw new Error('OpenAI returned an empty text draft');
  return { reply: reply.slice(0, 1500), needsHumanReview: Boolean(draft.needs_human_review), model, responseId: data.id || null };
}

async function insertMessage(db: any, row: Record<string, unknown>) {
  const { data, error } = await db.database.from('lead_conversation_messages').insert([row]).select();
  if (error) throw new Error(error.message || 'Failed to record message');
  return data?.[0] || null;
}

async function sendTwilioMessage(db: any, input: { tenantId: string; lead: any; channel: 'sms' | 'whatsapp'; body: string; replyToMessageId?: string | null; source: string; ai?: any }) {
  const policy = channelAllowed(input.lead, input.channel);
  if (!policy.allowed) throw new Error(policy.reason);
  const phoneNumber = await getTenantPhoneNumberForChannel(db, input.tenantId, input.channel);
  const fallbackSender = normalizePhone(Deno.env.get('TWILIO_PHONE_NUMBER'));
  const tenantSenderActive = Boolean(phoneNumber?.phone_number && phoneNumber.status === 'active');
  if (input.channel === 'sms' && !tenantSenderActive && !fallbackSender) throw new Error('No tenant or fallback SMS sender is configured');
  if (input.channel === 'sms' && tenantSenderActive && !phoneNumber.sms_enabled) throw new Error('Tenant SMS is not enabled');
  if (input.channel === 'whatsapp' && !tenantSenderActive) throw new Error('Tenant primary phone number is not active');
  if (input.channel === 'whatsapp' && phoneNumber.whatsapp_status !== 'active') throw new Error('Tenant WhatsApp account is not active');
  const to = normalizePhone(input.lead.phone);
  if (!to) throw new Error('Lead phone number is required');
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
  if (!accountSid || !authToken) throw new Error('Twilio credentials are not configured');
  const senderPhone = tenantSenderActive ? normalizePhone(phoneNumber.phone_number) : fallbackSender;
  const from = input.channel === 'whatsapp' ? whatsappAddress(senderPhone) : senderPhone;
  const recipient = input.channel === 'whatsapp' ? whatsappAddress(to) : to;
  const callback = new URL('/twilio-sms-webhook', functionBaseUrl());
  callback.searchParams.set('mode', 'status');
  const contentSid = input.channel === 'whatsapp' && !input.replyToMessageId
    ? Deno.env.get('TWILIO_WHATSAPP_TEMPLATE_CONTENT_SID')
    : '';
  const form = new URLSearchParams({ From: from, To: recipient, StatusCallback: callback.toString() });
  if (contentSid) {
    const leadName = input.lead?.full_name || [input.lead?.first_name, input.lead?.last_name].filter(Boolean).join(' ') || 'there';
    form.set('ContentSid', contentSid);
    form.set('ContentVariables', JSON.stringify({
      '1': leadName,
      '2': 'Bob',
      '3': 'Bob Automation',
      '4': input.lead?.service_interest || 'your request',
    }));
  } else {
    form.set('Body', input.body);
  }
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result?.message || `Twilio ${input.channel} failed with ${response.status}`);
  const conversation = await ensureLeadConversation(db, input.tenantId, input.lead, input.channel);
  const message = await insertMessage(db, {
    tenant_id: input.tenantId, conversation_id: conversation?.id || null, lead_id: input.lead.id,
    direction: 'outbound', channel: input.channel, message_type: input.channel, body_text: input.body,
    provider_message_id: result.sid || null, provider_status: result.status || 'queued', status: result.status || 'queued',
    sent_at: new Date().toISOString(), reply_to_message_id: input.replyToMessageId || null,
    ai_model: input.ai?.model || null, ai_response_id: input.ai?.responseId || null,
    metadata: { source: input.source, twilioStatus: result.status || null, contentSid: contentSid || null },
  });
  await db.database.from('lead_conversations').update({ last_outbound_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('tenant_id', input.tenantId).eq('id', conversation.id);
  return { message, providerMessageId: result.sid || null, status: result.status || 'queued' };
}

async function applyInboundOptOut(db: any, tenantId: string, lead: any, channel: 'sms' | 'whatsapp') {
  const now = new Date().toISOString();
  await db.database.from('leads').update({
    [channel === 'sms' ? 'sms_consent' : 'whatsapp_consent']: false,
    opted_out_at: now, opt_out_channel: channel, opt_out_reason: `Inbound ${channel.toUpperCase()} opt-out`, automation_paused: true,
    requires_human_review: false, updated_at: now,
  }).eq('tenant_id', tenantId).eq('id', lead.id);
}

async function handleInbound(db: any, tenantId: string, lead: any, channel: 'sms' | 'whatsapp', data: Record<string, string>) {
  const providerMessageId = firstValue(data.MessageSid, data.SmsMessageSid, data.Sid) as string | undefined;
  const { data: duplicate } = providerMessageId ? await db.database.from('lead_conversation_messages').select('id')
    .eq('tenant_id', tenantId).eq('provider_message_id', providerMessageId).limit(1) : { data: [] };
  if (duplicate?.[0]) return;
  const body = String(data.Body || '').trim();
  const isStop = STOP_PATTERNS.some((pattern) => pattern.test(body));
  const conversation = await ensureLeadConversation(db, tenantId, lead, channel);
  const inbound = await insertMessage(db, {
    tenant_id: tenantId, conversation_id: conversation?.id || null, lead_id: lead.id, direction: 'inbound', channel,
    message_type: `${channel}_reply`, body_text: body, provider_message_id: providerMessageId || null,
    provider_status: 'received', status: 'received', metadata: { twilio: { from: data.From || null, to: data.To || null } },
  });
  const now = new Date().toISOString();
  await db.database.from('lead_conversations').update({
    conversation_status: isStop ? 'closed_opted_out' : `lead_replied_${channel}`,
    next_action: isStop ? 'do_not_contact' : 'openai_text_reply', human_review_required: false,
    last_inbound_at: now, last_intent: `${channel}_reply`, last_intent_at: now,
    last_summary: isStop ? `Lead opted out by ${channel} reply.` : `Lead replied by ${channel}.`, updated_at: now,
  }).eq('tenant_id', tenantId).eq('id', conversation.id);
  if (isStop) return applyInboundOptOut(db, tenantId, lead, channel);
  const policy = channelAllowed(lead, channel);
  if (!policy.allowed) {
    await db.database.from('leads').update({ requires_human_review: true, escalation_reason: `${channel}_reply_requires_review`, updated_at: now })
      .eq('tenant_id', tenantId).eq('id', lead.id);
    return;
  }
  try {
    const draft = await draftTextReply(db, tenantId, lead, channel, body);
    await sendTwilioMessage(db, { tenantId, lead, channel, body: draft.reply, replyToMessageId: inbound?.id || null, source: 'openai_inbound_reply', ai: draft });
    if (draft.needsHumanReview) {
      await db.database.from('leads').update({ requires_human_review: true, escalation_reason: 'openai_text_reply_requested_review', updated_at: new Date().toISOString() })
        .eq('tenant_id', tenantId).eq('id', lead.id);
    }
  } catch (error) {
    await db.database.from('lead_conversations').update({ human_review_required: true, next_action: 'review_text_reply_failure', updated_at: new Date().toISOString() })
      .eq('tenant_id', tenantId).eq('id', conversation.id);
    await db.database.from('leads').update({ requires_human_review: true, escalation_reason: 'openai_text_reply_failed', updated_at: new Date().toISOString() })
      .eq('tenant_id', tenantId).eq('id', lead.id);
    await insertMessage(db, {
      tenant_id: tenantId, conversation_id: conversation?.id || null, lead_id: lead.id, direction: 'system', channel,
      message_type: 'text_reply_generation_failed', body_text: 'Automated reply could not be generated.', status: 'failed', error_message: safeError(error),
      reply_to_message_id: inbound?.id || null,
    });
  }
}

async function handleStatus(db: any, tenantId: string, lead: any, data: Record<string, string>) {
  const sid = String(firstValue(data.MessageSid, data.SmsSid, data.Sid) || '');
  if (!sid) return;
  const providerStatus = String(firstValue(data.MessageStatus, data.SmsStatus, data.Status, 'unknown')).toLowerCase();
  const patch: Record<string, unknown> = { status: providerStatus, provider_status: providerStatus };
  if (providerStatus === 'delivered') patch.delivered_at = new Date().toISOString();
  if (data.ErrorCode) patch.provider_error_code = data.ErrorCode;
  if (data.ErrorMessage) patch.error_message = data.ErrorMessage;
  const { data: rows, error } = await db.database.from('lead_conversation_messages').update(patch)
    .eq('tenant_id', tenantId).eq('provider_message_id', sid).select();
  if (error) throw new Error(error.message || 'Failed to record message status');
  const smsMessage = rows?.[0];
  if (!smsMessage || smsMessage.channel !== 'sms' || !FAILURE_STATUSES.has(providerStatus) || smsMessage.fallback_channel || !lead) return;
  if (!channelAllowed(lead, 'whatsapp').allowed) return;
  const phoneNumber = await getTenantPhoneNumberForChannel(db, tenantId, 'whatsapp');
  if (phoneNumber?.whatsapp_status !== 'active') return;
  try {
    const fallback = await sendTwilioMessage(db, {
      tenantId, lead, channel: 'whatsapp', body: smsMessage.body_text || '', replyToMessageId: smsMessage.reply_to_message_id || null, source: 'sms_failure_whatsapp_fallback',
    });
    await db.database.from('lead_conversation_messages').update({ fallback_channel: 'whatsapp', fallback_message_id: fallback.message?.id || null })
      .eq('tenant_id', tenantId).eq('id', smsMessage.id);
  } catch (fallbackError) {
    await db.database.from('lead_conversation_messages').update({ error_message: `${smsMessage.error_message || ''} WhatsApp fallback: ${safeError(fallbackError)}`.trim() })
      .eq('tenant_id', tenantId).eq('id', smsMessage.id);
  }
}

export default async function(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method === 'GET') return jsonResponse({
    success: true, service: 'twilio-sms-webhook', actions: ['inbound', 'status', 'send'], writer: 'openai',
    configured: { twilio: Boolean(Deno.env.get('TWILIO_ACCOUNT_SID') && Deno.env.get('TWILIO_AUTH_TOKEN')), openai: Boolean(Deno.env.get('OPENAI_API_KEY')), messageAuthorization: Boolean(messageActionsSecret()) },
  });
  const db = createInsForgeClient();
  const url = new URL(req.url);
  const mode = url.searchParams.get('mode') || url.searchParams.get('action') || 'inbound';
  try {
    if (mode === 'send') {
      requireMessageActionsSecret(req);
      const input = await req.json().catch(() => ({}));
      const tenantId = requiredTenantId(input);
      const channel = String(firstValue(input.channel, 'sms')).toLowerCase();
      if (channel !== 'sms' && channel !== 'whatsapp') throw new Error('Unsupported message channel');
      const leadId = String(firstValue(input.leadId, input.lead_id, ''));
      const { data: leads, error } = await db.database.from('leads').select('*').eq('tenant_id', tenantId).eq('id', leadId).limit(1);
      if (error || !leads?.[0]) throw new Error('Tenant lead was not found');
      const sent = await sendTwilioMessage(db, { tenantId, lead: leads[0], channel, body: String(firstValue(input.message, input.body, input.text, '')).trim(), source: String(firstValue(input.source, 'function_action')) });
      return jsonResponse({ success: true, channel, providerMessageId: sent.providerMessageId, status: sent.status });
    }

    const data = await readRequestBody(req) as Record<string, string>;
    requireTwilioSignature(req, data);
    const isStatus = mode === 'status';
    const isWhatsapp = /^whatsapp:/i.test(String(isStatus ? data.From : data.To || '')) || /^whatsapp:/i.test(String(isStatus ? data.To : data.From || ''));
    const channel: 'sms' | 'whatsapp' = isWhatsapp ? 'whatsapp' : 'sms';
    const tenantId = await resolveTenantIdByPhone(db, isStatus ? data.From : data.To);
    if (!tenantId) return isStatus ? jsonResponse({ success: true, ignored: true, reason: 'tenant_not_resolved' }) : emptyTwilioXmlResponse();
    const lead = await findLeadByPhone(db, tenantId, isStatus ? data.To : data.From);
    if (!lead) return isStatus ? jsonResponse({ success: true, ignored: true }) : emptyTwilioXmlResponse();
    if (isStatus) await handleStatus(db, tenantId, lead, data);
    else await handleInbound(db, tenantId, lead, channel, data);
    return isStatus ? jsonResponse({ success: true }) : emptyTwilioXmlResponse();
  } catch (error) {
    const message = safeError(error);
    const status = /signature|unauthorized/i.test(message) ? 401 : 500;
    return mode === 'inbound' ? emptyTwilioXmlResponse() : jsonResponse({ success: false, error: message }, status);
  }
}
