import { createClient } from 'npm:@insforge/sdk';

const TOOL_ACTIONS = [
  'get_lead_context',
  'update_lead_status',
  'check_availability',
  'create_booking',
  'send_sms',
  'send_whatsapp',
  'send_email',
  'record_call_outcome',
  'escalate_to_human',
  'mark_opt_out',
];

type JsonRecord = Record<string, any>;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-ElevenLabs-Tool-Secret,X-Request-Id',
};

function createInsForgeClient() {
  return createClient({
    baseUrl: Deno.env.get('INSFORGE_BASE_URL'),
    anonKey: Deno.env.get('ANON_KEY'),
  });
}

function optionsResponse() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

function jsonResponse(data: unknown, status = 200) {
  return Response.json(data, { status, headers: corsHeaders });
}

function safeError(error: any, fallback = 'ElevenLabs tool failed') {
  return String(error?.message || fallback)
    .replace(/(authorization|bearer|token|secret|api[_-]?key|xi-api-key)(=|:)?\s*[^\s,}]+/gi, '$1=[redacted]')
    .slice(0, 500);
}

function nowIso() {
  return new Date().toISOString();
}

function bookingTimeGuard(start: Date, tenantTimezone = 'UTC') {
  const now = new Date();
  if (start.getTime() < now.getTime() + 5 * 60 * 1000) {
    return {
      success: false,
      code: 'BOOKING_TIME_IN_PAST',
      error: `The requested booking time ${start.toISOString()} is in the past or too soon. Current time is ${now.toISOString()} (${tenantTimezone}). Ask the lead to confirm a future date and time before booking.`,
      requestedStartTime: start.toISOString(),
      currentTime: now.toISOString(),
      currentTimezone: tenantTimezone,
      askLeadToConfirmTime: true,
    };
  }
  return null;
}

function bookingHorizonGuard(start: Date, tenantTimezone = 'UTC') {
  const now = new Date();
  const maxAdvanceDays = Number(Deno.env.get('BOOKING_MAX_ADVANCE_DAYS') || 120);
  const maxAdvanceMs = Math.max(14, maxAdvanceDays) * 24 * 60 * 60 * 1000;
  if (start.getTime() > now.getTime() + maxAdvanceMs) {
    return {
      success: false,
      code: 'BOOKING_TIME_TOO_FAR',
      error: `The requested booking time ${start.toISOString()} is too far in the future. Current time is ${now.toISOString()} (${tenantTimezone}). Ask the lead to confirm the exact month, day, year, and time before booking.`,
      requestedStartTime: start.toISOString(),
      currentTime: now.toISOString(),
      currentTimezone: tenantTimezone,
      maxAdvanceDays,
      askLeadToConfirmTime: true,
    };
  }
  return null;
}

function normalizeFutureBookingStart(raw: any) {
  if (!raw) {
    return { start: null, originalStartTime: null, normalized: false, strategy: 'empty' };
  }

  const originalStartTime = String(raw);
  const start = new Date(originalStartTime);
  if (Number.isNaN(start.getTime())) {
    return { start: null, originalStartTime, normalized: false, strategy: 'invalid' };
  }

  const minimumFutureMs = Date.now() + 5 * 60 * 1000;
  if (start.getTime() >= minimumFutureMs) {
    return { start, originalStartTime, normalized: false, strategy: 'already_future' };
  }

  const adjusted = new Date(start.getTime());
  const pastByMs = minimumFutureMs - adjusted.getTime();

  if (pastByMs <= 36 * 60 * 60 * 1000) {
    do {
      adjusted.setUTCDate(adjusted.getUTCDate() + 1);
    } while (adjusted.getTime() < minimumFutureMs);
    return { start: adjusted, originalStartTime, normalized: true, strategy: 'next_future_day' };
  }

  return {
    start,
    originalStartTime,
    normalized: false,
    strategy: 'stale_date_requires_confirmation',
    needsConfirmation: true,
  };
}

function firstValue(...values: any[]) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return null;
}

function nestedBody(body: JsonRecord) {
  return body?.payload || body?.data || body?.parameters || body?.arguments || body || {};
}

function dynamicVariables(body: JsonRecord) {
  return body?.dynamic_variables || body?.dynamicVariables || body?.conversation_initiation_client_data?.dynamic_variables || {};
}

function toolInput(body: JsonRecord) {
  return { ...dynamicVariables(body), ...nestedBody(body), ...body };
}

function normalizeAction(action: string | null, body: JsonRecord) {
  return String(
    action
      || body.action
      || body.tool_name
      || body.toolName
      || body.name
      || body.tool
      || 'get_lead_context'
  ).trim();
}

function redactSecrets(value: any): any {
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => {
      if (/secret|token|key|authorization|signature/i.test(key)) return [key, '[redacted]'];
      return [key, redactSecrets(entry)];
    })
  );
}

function publicLead(lead: JsonRecord) {
  return {
    id: lead.id,
    tenantId: lead.tenant_id,
    name: lead.full_name || [lead.first_name, lead.last_name].filter(Boolean).join(' ') || null,
    firstName: lead.first_name || null,
    lastName: lead.last_name || null,
    email: lead.email || null,
    phone: lead.phone || null,
    company: lead.company || null,
    status: lead.status || null,
    priority: lead.priority || null,
    qualificationStatus: lead.qualification_status || null,
    qualificationScore: lead.qualification_score || 0,
    leadStage: lead.lead_stage || null,
    schedulingState: lead.scheduling_state || null,
    preferredContactChannel: lead.preferred_contact_channel || null,
    preferredLanguage: lead.preferred_language || null,
    preferredMeetingWindow: lead.preferred_meeting_window || null,
    serviceInterest: lead.service_interest || null,
    locationSummary: lead.location_summary || null,
    budgetRange: lead.budget_range || null,
    qualificationNotes: lead.qualification_notes || null,
    customFields: lead.custom_fields || {},
    consent: {
      call: Boolean(lead.call_consent),
      sms: Boolean(lead.sms_consent),
      whatsapp: Boolean(lead.whatsapp_consent),
      email: Boolean(lead.email_consent),
      doNotContact: Boolean(lead.do_not_contact),
      optedOutAt: lead.opted_out_at || null,
      optOutChannel: lead.opt_out_channel || null,
    },
  };
}

function channelConsentColumn(channel: string) {
  if (channel === 'call' || channel === 'voice' || channel === 'phone') return 'call_consent';
  if (channel === 'sms') return 'sms_consent';
  if (channel === 'whatsapp') return 'whatsapp_consent';
  if (channel === 'email') return 'email_consent';
  return null;
}

function assertLeadAllowsChannel(lead: JsonRecord, channel: string) {
  const normalized = channel === 'voice' || channel === 'phone' ? 'call' : channel;
  const consentColumn = channelConsentColumn(normalized);
  if (!consentColumn) throw new Error('Unsupported outreach channel');
  if (lead.do_not_contact) throw new Error('Lead is marked do not contact');
  if (lead.opted_out_at && (!lead.opt_out_channel || lead.opt_out_channel === 'all' || lead.opt_out_channel === normalized)) {
    throw new Error(`Lead opted out of ${normalized}`);
  }
  if (!lead[consentColumn]) throw new Error(`Missing ${normalized} consent`);
}

function normalizePhone(phone: string) {
  const raw = String(phone || '').trim();
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  return digits ? `+${digits}` : raw;
}

function whatsappAddress(phone: string) {
  const normalized = normalizePhone(phone);
  return normalized ? `whatsapp:${normalized}` : '';
}

function escapeHtml(value: any) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function unwrap(result: any, message: string) {
  if (result?.error) throw new Error(result.error.message || message);
  return result?.data;
}

async function loadRows(db: any, table: string, tenantId: string, limit = 20) {
  return unwrap(
    await db.database.from(table).select('*').eq('tenant_id', tenantId).limit(limit),
    `Failed to load ${table}`
  );
}

async function loadToolContext(db: any, input: JsonRecord) {
  const tenantId = firstValue(input.tenantId, input.tenant_id, input.tenant);
  const leadId = firstValue(input.leadId, input.lead_id);
  const agentId = firstValue(input.agentId, input.agent_id, input.tenantAgentId, input.tenant_agent_id);

  if (!tenantId) throw new Error('tenant_id is required');
  if (!leadId) throw new Error('lead_id is required');

  const [tenants, leads, agents] = await Promise.all([
    unwrap(await db.database.from('tenants').select('*').eq('id', tenantId).limit(1), 'Failed to load tenant'),
    unwrap(await db.database.from('leads').select('*').eq('tenant_id', tenantId).eq('id', leadId).limit(1), 'Failed to load lead'),
    agentId
      ? unwrap(await db.database.from('tenant_agents').select('*').eq('tenant_id', tenantId).eq('id', agentId).limit(1), 'Failed to load tenant agent')
      : Promise.resolve([]),
  ]);

  const tenant = tenants?.[0] || null;
  const lead = leads?.[0] || null;
  const agent = agents?.[0] || null;
  if (!tenant) throw new Error('Tenant was not found');
  if (!lead) throw new Error('Lead was not found for tenant');
  if (agentId && !agent) throw new Error('Tenant agent was not found for tenant');

  return { tenantId, leadId, agentId: agent?.id || null, tenant, lead, agent };
}

async function loadTenantReadiness(db: any, tenantId: string, agentId?: string | null) {
  const [phones, emails, bookings, documents] = await Promise.all([
    loadRows(db, 'tenant_phone_numbers', tenantId),
    loadRows(db, 'tenant_email_identities', tenantId),
    loadRows(db, 'tenant_booking_integrations', tenantId),
    unwrap(
      await db.database
        .from('tenant_knowledge_documents')
        .select('*')
        .eq('tenant_id', tenantId)
        .or(agentId ? `tenant_agent_id.is.null,tenant_agent_id.eq.${agentId}` : 'tenant_agent_id.is.null')
        .limit(100),
      'Failed to load knowledge documents'
    ),
  ]);

  return {
    phoneNumber: phones?.find((row: JsonRecord) => row.status === 'active' && row.is_primary) || phones?.find((row: JsonRecord) => row.status === 'active') || null,
    emailIdentity: emails?.find((row: JsonRecord) => row.status === 'active') || null,
    bookingIntegration: bookings?.find((row: JsonRecord) => row.status === 'connected') || bookings?.[0] || null,
    readyKnowledgeDocuments: (documents || []).filter((row: JsonRecord) => row.status === 'ready'),
  };
}

async function ensureConversation(db: any, tenantId: string, leadId: string, channel = 'voice') {
  const existing = await unwrap(
    await db.database
      .from('lead_conversations')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('lead_id', leadId)
      .eq('channel', channel)
      .limit(1),
    'Failed to load lead conversation'
  );
  if (existing?.[0]) return existing[0];

  const created = await unwrap(
    await db.database.from('lead_conversations').insert([{
      tenant_id: tenantId,
      lead_id: leadId,
      channel,
      status: 'active',
      conversation_status: 'active_nurture',
    }]).select(),
    'Failed to create lead conversation'
  );
  return created?.[0] || null;
}

async function logTimelineMessage(db: any, input: JsonRecord) {
  const conversation = await ensureConversation(db, input.tenantId, input.leadId, input.channel || 'voice');
  const inserted = await unwrap(
    await db.database.from('lead_conversation_messages').insert([{
      tenant_id: input.tenantId,
      lead_id: input.leadId,
      conversation_id: conversation?.id || null,
      direction: input.direction || 'system',
      channel: input.channel || 'voice',
      message_type: input.messageType || input.message_type || 'tool_event',
      subject: input.subject || null,
      body_text: input.bodyText || input.body_text || null,
      body_html: input.bodyHtml || input.body_html || null,
      provider_message_id: input.providerMessageId || input.provider_message_id || null,
      status: input.status || 'logged',
      sent_at: input.sentAt || input.sent_at || null,
      delivered_at: input.deliveredAt || input.delivered_at || null,
      error_message: input.errorMessage || input.error_message || null,
      metadata: input.metadata || {},
    }]).select(),
    'Failed to log timeline message'
  );
  return inserted?.[0] || null;
}

async function getTenantPhoneNumberForChannel(db: any, tenantId: string, channel: 'sms' | 'whatsapp') {
  let query = db.database.from('tenant_phone_numbers').select('*').eq('tenant_id', tenantId).eq('status', 'active');
  if (channel === 'sms') query = query.eq('sms_enabled', true);
  if (channel === 'whatsapp') query = query.eq('whatsapp_status', 'active');
  const rows = await unwrap(
    await query.order('is_primary', { ascending: false }).order('created_at', { ascending: true }).limit(1),
    `Failed to load tenant ${channel} phone number`
  );
  return rows?.[0] || null;
}

async function sendDirectTenantTextMessage(db: any, context: JsonRecord, channel: 'sms' | 'whatsapp', body: string) {
  const phoneNumber = await getTenantPhoneNumberForChannel(db, context.tenantId, channel);
  const fallbackSender = normalizePhone(Deno.env.get('TWILIO_PHONE_NUMBER') || '');
  const tenantSender = normalizePhone(phoneNumber?.phone_number || '');
  const fromPhone = tenantSender || fallbackSender;
  const toPhone = normalizePhone(context.lead.phone || '');
  if (!fromPhone) throw new Error('No tenant or fallback SMS sender is configured');
  if (!toPhone) throw new Error('Lead phone number is required');
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
  if (!accountSid || !authToken) throw new Error('Twilio credentials are not configured');

  const from = channel === 'whatsapp' ? whatsappAddress(fromPhone) : fromPhone;
  const to = channel === 'whatsapp' ? whatsappAddress(toPhone) : toPhone;
  const form = new URLSearchParams({ From: from, To: to, Body: body });
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result?.message || `Twilio ${channel} failed with ${response.status}`);

  await logTimelineMessage(db, {
    tenantId: context.tenantId,
    leadId: context.leadId,
    channel,
    direction: 'outbound',
    messageType: channel,
    bodyText: body,
    providerMessageId: result.sid || null,
    status: result.status || 'queued',
    sentAt: nowIso(),
    metadata: { source: 'elevenlabs_tool', providerStatus: result.status || null, senderResolution: tenantSender ? 'tenant_active' : 'fallback_secret' },
  });

  return { success: true, providerMessageId: result.sid || null, status: result.status || 'queued' };
}

function formatMeetingTime(input: JsonRecord, tenant: JsonRecord) {
  const raw = firstValue(input.time, input.startTime, input.start_time);
  if (!raw) return '';
  const date = new Date(String(raw));
  if (Number.isNaN(date.getTime())) return String(raw);
  return date.toLocaleString('en-US', {
    timeZone: input.timezone || tenant?.default_timezone || 'UTC',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function safeSenderName(value: any) {
  return String(value || '').trim().replace(/[<>]/g, '').slice(0, 80);
}

function savedAgentEmail(agent?: any) {
  const email = String(agent?.email_address || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

async function resolveEmailSender(db: any, tenantId: string, agent?: any) {
  const identities = await unwrap(
    await db.database
      .from('tenant_email_identities')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .eq('verified_status', 'verified')
      .order('created_at', { ascending: false })
      .limit(1),
    'Failed to resolve tenant email sender'
  );
  const identity = identities?.[0] || null;
  const fallbackEmail = Deno.env.get('EMAIL_FROM');
  const fallbackName = Deno.env.get('EMAIL_FROM_NAME') || 'Bob Automation';
  if (identity?.from_email) {
    return {
      from: `${identity.from_name || 'Support'} <${identity.from_email}>`,
      fromEmail: identity.from_email,
      fromName: identity.from_name || 'Support',
      replyTo: identity.reply_to_email || null,
      resolution: 'tenant_verified',
      identityId: identity.id,
    };
  }
  if (!fallbackEmail) throw new Error('Platform fallback sender is not configured');
  const agentEmail = savedAgentEmail(agent);
  const fallbackFromEmail = agentEmail || fallbackEmail;
  const fallbackFromName = agentEmail ? safeSenderName(agent?.display_name) || fallbackName : fallbackName;
  return {
    from: `${fallbackFromName} <${fallbackFromEmail}>`,
    fromEmail: fallbackFromEmail,
    fromName: fallbackFromName,
    replyTo: null,
    resolution: 'platform_fallback',
    identityId: null,
  };
}

function deterministicEmailDraft(context: JsonRecord, input: JsonRecord) {
  const emailType = String(firstValue(input.emailType, input.email_type, 'elevenlabs_follow_up'));
  const recipientName = context.lead.full_name || [context.lead.first_name, context.lead.last_name].filter(Boolean).join(' ') || 'there';
  const service = context.lead.service_interest || input.serviceInterest || input.service_interest || 'consultation';
  const meetingUrl = firstValue(input.meetingUrl, input.meeting_url, input.bookingUrl, input.booking_url) || null;
  const time = formatMeetingTime(input, context.tenant);
  const requestedMessage = firstValue(input.message, input.text, input.bodyText, input.body_text);
  const subject = emailType === 'booking_confirmation'
    ? `${service} appointment confirmed`
    : `${service} follow-up`;
  const text = emailType === 'booking_confirmation'
    ? [
      `Hi ${recipientName},`,
      `Your ${service} appointment is confirmed${time ? ' for ' + time : ''}.`,
      meetingUrl ? `Meeting link: ${meetingUrl}` : '',
      'Thank you.',
    ].filter(Boolean).join('\n\n')
    : [
      `Hi ${recipientName},`,
      String(requestedMessage || `Following up on your ${service} request.`),
      meetingUrl ? `Meeting link: ${meetingUrl}` : '',
    ].filter(Boolean).join('\n\n');
  const html = text.split('\n\n').map((line) => {
    const escaped = escapeHtml(line);
    return meetingUrl && line.includes(String(meetingUrl))
      ? `<p>Meeting link: <a href="${escapeHtml(meetingUrl)}">${escapeHtml(meetingUrl)}</a></p>`
      : `<p>${escaped}</p>`;
  }).join('');
  return { subject, text, html, emailType, model: 'deterministic-elevenlabs-tool-email' };
}

async function sendDirectTenantEmail(db: any, context: JsonRecord, input: JsonRecord) {
  const toEmail = firstValue(input.to, input.toEmail, input.to_email, context.lead.email);
  if (!toEmail) throw new Error('Lead email is required');
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) throw new Error('RESEND_API_KEY is not configured');
  const sender = await resolveEmailSender(db, context.tenantId, context.agent);
  const draft = deterministicEmailDraft(context, { ...input, to: toEmail });
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: sender.from,
      to: [toEmail],
      subject: draft.subject,
      html: draft.html,
      text: draft.text,
      reply_to: sender.replyTo || undefined,
    }),
  });
  const resend = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(resend?.message || resend?.error || `Resend failed with ${response.status}`);

  const queued = await unwrap(
    await db.database.from('email_queue').insert([{
      tenant_id: context.tenantId,
      lead_id: context.leadId,
      to_email: toEmail,
      from_email: sender.fromEmail,
      sender_identity_id: sender.identityId,
      sender_display_name: sender.fromName,
      reply_to_email: sender.replyTo,
      sender_resolution: sender.resolution,
      delivery_provider: 'resend',
      provider_message_id: resend?.id || null,
      subject: draft.subject,
      html_content: draft.html,
      text_content: draft.text,
      email_type: draft.emailType,
      status: 'sent',
      sent_at: nowIso(),
      generated_by: 'template',
      generation_model: draft.model,
      generation_status: 'generated',
      generated_at: nowIso(),
      metadata: { source: 'elevenlabs_tool', externalConversationId: context.externalConversationId || null },
    }]).select(),
    'Failed to record email delivery'
  );

  await logTimelineMessage(db, {
    tenantId: context.tenantId,
    leadId: context.leadId,
    channel: 'email',
    direction: 'outbound',
    messageType: 'email_sent',
    subject: draft.subject,
    bodyText: draft.text,
    providerMessageId: resend?.id || null,
    status: 'sent',
    sentAt: nowIso(),
    metadata: { emailQueueId: queued?.[0]?.id || null, senderResolution: sender.resolution, source: 'elevenlabs_tool' },
  });

  return { success: true, queued: queued?.[0] || null, providerMessageId: resend?.id || null, sender };
}

async function writeAuditLog(
  db: any,
  context: JsonRecord,
  action: string,
  body: JsonRecord,
  status: string,
  response: JsonRecord,
  error: string | null,
  startedAt: number
) {
  const input = toolInput(body);
  await unwrap(
    await db.database.from('elevenlabs_tool_audit_logs').insert([{
      tenant_id: context.tenantId,
      lead_id: context.leadId,
      tenant_agent_id: context.agentId || null,
      tool_name: action,
      request_id: firstValue(body.request_id, body.requestId, input.request_id, input.requestId) || null,
      external_conversation_id: firstValue(body.conversation_id, body.conversationId, input.elevenlabs_conversation_id, input.conversationId) || null,
      status,
      request_payload: redactSecrets(body),
      response_payload: redactSecrets(response || {}),
      error_message: error || null,
      duration_ms: Math.max(0, Date.now() - startedAt),
    }]),
    'Failed to write tool audit log'
  );
}

function requireToolSecret(req: Request, body: JsonRecord) {
  const expected = Deno.env.get('ELEVENLABS_TOOL_SECRET');
  if (!expected) throw new Error('ELEVENLABS_TOOL_SECRET is not configured');
  const input = toolInput(body);
  const provided = firstValue(
    req.headers.get('x-elevenlabs-tool-secret'),
    req.headers.get('x-elevenlabs-signature'),
    body.tool_signature,
    body.toolSignature,
    body.signature,
    body.secret,
    input.tool_signature,
    input.toolSignature,
    input.signature,
    input.secret
  );
  if (provided !== expected) throw new Error('Invalid ElevenLabs tool signature');
}

function sanitizeLeadPatch(input: JsonRecord) {
  const allowed: Record<string, string> = {
    status: 'status',
    priority: 'priority',
    qualificationStatus: 'qualification_status',
    qualification_status: 'qualification_status',
    qualificationScore: 'qualification_score',
    qualification_score: 'qualification_score',
    leadStage: 'lead_stage',
    lead_stage: 'lead_stage',
    schedulingState: 'scheduling_state',
    scheduling_state: 'scheduling_state',
    preferredContactChannel: 'preferred_contact_channel',
    preferred_contact_channel: 'preferred_contact_channel',
    preferredLanguage: 'preferred_language',
    preferred_language: 'preferred_language',
    preferredMeetingWindow: 'preferred_meeting_window',
    preferred_meeting_window: 'preferred_meeting_window',
    serviceInterest: 'service_interest',
    service_interest: 'service_interest',
    locationSummary: 'location_summary',
    location_summary: 'location_summary',
    budgetRange: 'budget_range',
    budget_range: 'budget_range',
    qualificationNotes: 'qualification_notes',
    qualification_notes: 'qualification_notes',
    requiresHumanReview: 'requires_human_review',
    requires_human_review: 'requires_human_review',
    escalationReason: 'escalation_reason',
    escalation_reason: 'escalation_reason',
    nextContactAt: 'next_contact_at',
    next_contact_at: 'next_contact_at',
  };
  const patch: JsonRecord = {};
  for (const [key, column] of Object.entries(allowed)) {
    if (input[key] !== undefined) patch[column] = input[key];
  }
  if (Object.keys(patch).length) patch.updated_at = nowIso();
  return patch;
}

function qualificationUpdate(input: JsonRecord, context: JsonRecord) {
  const questions = firstValue(input.qualificationQuestions, input.qualification_questions, input.questions);
  const answers = firstValue(input.qualificationAnswers, input.qualification_answers, input.answers);
  if (!questions && !answers) return null;
  return {
    capturedAt: nowIso(),
    source: 'elevenlabs_tool',
    serviceInterest: firstValue(input.serviceInterest, input.service_interest, context.lead?.service_interest),
    preferredLanguage: firstValue(input.preferredLanguage, input.preferred_language, context.lead?.preferred_language),
    questions: questions || null,
    answers: answers || null,
    summary: firstValue(input.qualificationSummary, input.qualification_summary, input.qualificationNotes, input.qualification_notes, null),
  };
}

async function updateLeadStatus(db: any, context: JsonRecord, input: JsonRecord) {
  const patch = sanitizeLeadPatch(input);
  const qualification = qualificationUpdate(input, context);
  if (qualification) {
    const customFields = context.lead?.custom_fields || {};
    const existing = customFields.aiQualification || {};
    const existingHistory = Array.isArray(existing.history)
      ? existing.history
      : existing.latest
        ? [existing.latest]
        : existing.questions || existing.answers
          ? [existing]
          : [];
    patch.custom_fields = {
      ...customFields,
      aiQualification: {
        latest: qualification,
        history: [...existingHistory, qualification].slice(-20),
      },
    };
    if (!patch.qualification_notes && qualification.summary) {
      patch.qualification_notes = qualification.summary;
    }
  }
  if (!Object.keys(patch).length) throw new Error('No supported lead status fields were provided');
  const data = await unwrap(
    await db.database.from('leads').update(patch).eq('tenant_id', context.tenantId).eq('id', context.leadId).select(),
    'Failed to update lead status'
  );
  await logTimelineMessage(db, {
    tenantId: context.tenantId,
    leadId: context.leadId,
    channel: 'voice',
    messageType: 'lead_status_update',
    bodyText: `ElevenLabs tool updated lead fields: ${Object.keys(patch).filter((key) => key !== 'updated_at').join(', ')}`,
    metadata: { patch },
  });
  return { success: true, lead: publicLead(data?.[0] || context.lead) };
}

async function getLeadContext(db: any, context: JsonRecord) {
  const readiness = await loadTenantReadiness(db, context.tenantId, context.agentId);
  return {
    success: true,
    tenant: {
      id: context.tenant.id,
      name: context.tenant.name,
      timezone: context.tenant.default_timezone,
      status: context.tenant.status,
    },
    agent: context.agent ? {
      id: context.agent.id,
      displayName: context.agent.display_name,
      status: context.agent.status,
      elevenlabsAgentId: context.agent.elevenlabs_agent_id || null,
    } : null,
    lead: publicLead(context.lead),
    readiness: {
      hasPhoneNumber: Boolean(readiness.phoneNumber?.phone_number),
      hasSms: Boolean(readiness.phoneNumber?.sms_enabled),
      hasWhatsapp: readiness.phoneNumber?.whatsapp_status === 'active',
      hasEmailIdentity: Boolean(readiness.emailIdentity?.from_email),
      bookingProvider: readiness.bookingIntegration?.provider || null,
      hasBookingPath: Boolean(readiness.bookingIntegration?.booking_url || readiness.bookingIntegration?.event_type_id),
      readyKnowledgeDocuments: readiness.readyKnowledgeDocuments.length,
    },
  };
}

async function checkAvailability(db: any, context: JsonRecord, input: JsonRecord) {
  const readiness = await loadTenantReadiness(db, context.tenantId, context.agentId);
  const booking = readiness.bookingIntegration;
  if (!booking || booking.status !== 'connected') {
    return { success: false, available: false, error: 'Booking integration is not connected', alternatives: [] };
  }
  if (booking.provider === 'manual' || booking.provider === 'calendly') {
    const mode = booking.provider === 'calendly' ? 'calendly_link' : 'manual_link';
    return {
      success: true,
      available: true,
      provider: booking.provider,
      mode,
      bookingUrl: booking.booking_url,
      eventTypeId: booking.event_type_id || null,
      requestedTime: firstValue(input.startTime, input.start_time, input.requestedTime, input.requested_time),
      message: booking.provider === 'calendly'
        ? 'Use the tenant Calendly booking link to finish scheduling. If the lead asks to book without a specific time, send this link by SMS when consent is present.'
        : 'Use the tenant manual booking link to finish scheduling.',
    };
  }
  return {
    success: false,
    available: false,
    provider: booking.provider,
    error: 'Direct provider availability is not configured yet',
    requestedTime: firstValue(input.startTime, input.start_time, input.requestedTime, input.requested_time),
    alternatives: [],
  };
}

async function createBooking(db: any, context: JsonRecord, input: JsonRecord) {
  const readiness = await loadTenantReadiness(db, context.tenantId, context.agentId);
  const booking = readiness.bookingIntegration;
  if (!booking || booking.status !== 'connected') throw new Error('Booking integration is not connected');

  const startTime = firstValue(input.startTime, input.start_time, input.requestedTime, input.requested_time);
  const durationMinutes = Number(firstValue(input.durationMinutes, input.duration_minutes, 30));
  const futureStart = normalizeFutureBookingStart(startTime);
  const start = futureStart.start;

  if ((!start || Number.isNaN(start.getTime())) && booking.booking_url) {
    await db.database.from('leads').update({
      scheduling_state: 'booking_link_sent',
      updated_at: nowIso(),
    }).eq('tenant_id', context.tenantId).eq('id', context.leadId);

    await logTimelineMessage(db, {
      tenantId: context.tenantId,
      leadId: context.leadId,
      channel: 'voice',
      messageType: 'booking_link_offered',
      bodyText: `Booking link offered: ${booking.booking_url}`,
      metadata: { provider: booking.provider, bookingUrl: booking.booking_url, eventTypeId: booking.event_type_id || null },
    });

    let smsConfirmationSent = false;
    let smsError: string | null = null;
    let emailConfirmationSent = false;
    let emailError: string | null = null;
    try {
      assertLeadAllowsChannel(context.lead, 'sms');
      await sendSms(db, context, {
        message: firstValue(
          input.message,
          input.smsMessage,
          input.sms_message,
          `Here is the booking link to choose a time that works for you: ${booking.booking_url}`
        ),
      });
      smsConfirmationSent = true;
    } catch (error) {
      smsError = safeError(error, 'Booking link SMS was not sent');
    }

    try {
      await sendBookingEmail(db, context, {
        emailType: 'booking_link',
        meetingUrl: booking.booking_url,
        bookingUrl: booking.booking_url,
        message: firstValue(
          input.emailMessage,
          input.email_message,
          `Here is the booking link to choose a time that works for you: ${booking.booking_url}`
        ),
      });
      emailConfirmationSent = true;
    } catch (error) {
      emailError = safeError(error, 'Booking link email was not sent');
    }

    return {
      success: true,
      mode: booking.provider === 'calendly' ? 'calendly_link' : 'booking_link',
      booking: null,
      bookingUrl: booking.booking_url,
      eventTypeId: booking.event_type_id || null,
      requiresLeadSelfSchedule: true,
      smsConfirmationSent,
      smsError,
      emailConfirmationSent,
      emailError,
    };
  }

  if (!start || Number.isNaN(start.getTime())) throw new Error('A valid start_time is required to create a booking');
  const timeGuard = bookingTimeGuard(start, firstValue(input.timezone, context.tenant.default_timezone, 'UTC'));
  if (timeGuard) {
    await logTimelineMessage(db, {
      tenantId: context.tenantId,
      leadId: context.leadId,
      channel: 'voice',
      messageType: 'booking_rejected',
      bodyText: timeGuard.error,
      status: 'failed',
      metadata: { source: 'elevenlabs_tool', requestedStartTime: timeGuard.requestedStartTime, currentTime: timeGuard.currentTime },
    });
    return timeGuard;
  }
  const horizonGuard = bookingHorizonGuard(start, firstValue(input.timezone, context.tenant.default_timezone, 'UTC'));
  if (horizonGuard) {
    await logTimelineMessage(db, {
      tenantId: context.tenantId,
      leadId: context.leadId,
      channel: 'voice',
      messageType: 'booking_rejected',
      bodyText: horizonGuard.error,
      status: 'failed',
      metadata: {
        source: 'elevenlabs_tool',
        requestedStartTime: horizonGuard.requestedStartTime,
        currentTime: horizonGuard.currentTime,
        maxAdvanceDays: horizonGuard.maxAdvanceDays,
        dateNormalizationStrategy: futureStart.strategy,
      },
    });
    return horizonGuard;
  }
  const endTime = firstValue(input.endTime, input.end_time) || new Date(start.getTime() + durationMinutes * 60 * 1000).toISOString();
  const configuredMeetingLink = firstValue(
    input.meetingLink,
    input.meeting_link,
    input.meetingUrl,
    input.meeting_url,
    booking.metadata?.meetingLink,
    booking.metadata?.meeting_link
  );
  const meetingUrl = configuredMeetingLink || null;
  const title = firstValue(input.title, `Consultation with ${publicLead(context.lead).name || 'lead'}`);

  const rows = await unwrap(
    await db.database.from('meetings').insert([{
      tenant_id: context.tenantId,
      lead_id: context.leadId,
      meeting_type: firstValue(input.meetingType, input.meeting_type, 'consultation'),
      title,
      description: input.description || null,
      start_time: start.toISOString(),
      end_time: endTime,
      timezone: firstValue(input.timezone, context.tenant.default_timezone, 'UTC'),
      status: 'scheduled',
      meeting_url: meetingUrl,
      location: firstValue(input.location, meetingUrl),
      attendee_email: firstValue(input.attendeeEmail, input.attendee_email, context.lead.email),
      attendee_name: firstValue(input.attendeeName, input.attendee_name, publicLead(context.lead).name),
      attendee_phone: firstValue(input.attendeePhone, input.attendee_phone, context.lead.phone),
      metadata: {
        source: 'elevenlabs_tool',
        provider: booking.provider,
        tenantAgentId: context.agentId,
        bookingUrl: booking.booking_url || null,
        configuredMeetingLink: meetingUrl,
        dateDefault: 'future_occurrence',
        originalStartTime: futureStart.originalStartTime,
        normalizedStartTime: futureStart.normalized ? start.toISOString() : null,
        dateNormalizationStrategy: futureStart.strategy,
      },
    }]).select(),
    'Failed to create booking'
  );
  const meeting = rows?.[0] || null;

  await db.database.from('leads').update({
    status: 'booked',
    meeting_scheduled: true,
    scheduling_state: 'scheduled',
    scheduled_at: start.toISOString(),
    meeting_end_time: endTime,
    meeting_location: meetingUrl,
    updated_at: nowIso(),
  }).eq('tenant_id', context.tenantId).eq('id', context.leadId);

  await logTimelineMessage(db, {
    tenantId: context.tenantId,
    leadId: context.leadId,
    channel: 'voice',
    messageType: 'booking_created',
    bodyText: `Booking confirmed for ${start.toISOString()}.`,
    metadata: {
      meetingId: meeting?.id,
      meetingUrl,
      dateDefault: 'future_occurrence',
      originalStartTime: futureStart.originalStartTime,
      normalizedStartTime: futureStart.normalized ? start.toISOString() : null,
      dateNormalizationStrategy: futureStart.strategy,
    },
  });

  const formattedTime = start.toLocaleString('en-US', { timeZone: context.tenant.default_timezone || 'UTC', dateStyle: 'medium', timeStyle: 'short' });
  const reminderRows: JsonRecord[] = [];
  const reminderDefinitions = [
    { hours: 24, method: 'email' },
    { hours: 24, method: 'sms' },
    { hours: 1, method: 'sms' },
  ];
  for (const reminder of reminderDefinitions) {
    const scheduledFor = new Date(start.getTime() - reminder.hours * 60 * 60 * 1000);
    const hasConsent = reminder.method === 'email'
      ? Boolean(context.lead.email && context.lead.email_consent && !context.lead.do_not_contact)
      : Boolean(context.lead.phone && context.lead.sms_consent && !context.lead.do_not_contact);
    reminderRows.push({
      tenant_id: context.tenantId,
      meeting_id: meeting?.id,
      reminder_type: `${reminder.hours}h`,
      delivery_method: reminder.method,
      scheduled_for: scheduledFor.toISOString(),
      status: scheduledFor.getTime() > Date.now() && hasConsent ? 'pending' : 'skipped',
      error_message: hasConsent ? null : `Missing ${reminder.method} consent or contact details`,
    });
  }
  await unwrap(
    await db.database.from('meeting_reminders').insert(reminderRows),
    'Failed to schedule booking reminders'
  );

  const [smsResult, emailResult] = await Promise.all([
    (async () => {
      try {
        assertLeadAllowsChannel(context.lead, 'sms');
        await sendSms(db, context, { message: `Your appointment is confirmed for ${formattedTime}.${meetingUrl ? ` Meeting link: ${meetingUrl}` : ''}` });
        return { sent: true, error: null };
      } catch (error) {
        return { sent: false, error: safeError(error, 'Booking SMS confirmation was not sent') };
      }
    })(),
    (async () => {
      try {
        await sendBookingEmail(db, context, {
          ...input,
          emailType: 'booking_confirmation',
          startTime: start.toISOString(),
          endTime,
          meetingUrl,
          title,
          message: firstValue(
            input.emailMessage,
            input.email_message,
            `Your ${title} is confirmed.${meetingUrl ? ` Meeting link: ${meetingUrl}` : ''}`
          ),
        });
        return { sent: true, error: null };
      } catch (error) {
        return { sent: false, error: safeError(error, 'Booking email confirmation was not sent') };
      }
    })(),
  ]);

  const smsConfirmationSent = smsResult.sent;
  const smsError = smsResult.error;
  const emailConfirmationSent = emailResult.sent;
  const emailError = emailResult.error;

  return {
    success: true,
    booking: meeting,
    smsConfirmationSent,
    smsError,
    emailConfirmationSent,
    emailError,
    remindersScheduled: reminderRows.filter((row) => row.status === 'pending').length,
  };
}

async function sendSms(db: any, context: JsonRecord, input: JsonRecord) {
  assertLeadAllowsChannel(context.lead, 'sms');
  const body = String(firstValue(input.message, input.body, input.text, '') || '').trim();
  if (!body) throw new Error('SMS message body is required');
  return sendTenantTextMessage(db, context, 'sms', body);
}

async function sendWhatsapp(db: any, context: JsonRecord, input: JsonRecord) {
  assertLeadAllowsChannel(context.lead, 'whatsapp');
  const body = String(firstValue(input.message, input.body, input.text, '') || '').trim();
  if (!body) throw new Error('WhatsApp message body is required');
  return sendTenantTextMessage(db, context, 'whatsapp', body);
}

async function sendTenantTextMessage(db: any, context: JsonRecord, channel: 'sms' | 'whatsapp', body: string) {
  return sendDirectTenantTextMessage(db, context, channel, body);
}

async function sendTenantTextMessageViaFunction(context: JsonRecord, channel: 'sms' | 'whatsapp', body: string) {
  const functionBaseUrl = Deno.env.get('INSFORGE_FUNCTION_BASE_URL');
  const secret = Deno.env.get('MESSAGE_ACTIONS_SECRET') || Deno.env.get('ELEVENLABS_TOOL_SECRET');
  if (!functionBaseUrl) throw new Error('Tenant message delivery function is not configured');
  if (!secret) throw new Error('Tenant message delivery authorization is not configured');
  const response = await fetch(`${functionBaseUrl.replace(/\/$/, '')}/twilio-sms-webhook?action=send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-message-actions-secret': secret },
    body: JSON.stringify({
      tenantId: context.tenantId,
      leadId: context.leadId,
      channel,
      message: body,
      source: 'elevenlabs_tool',
    }),
  });
  const raw = await response.text().catch(() => '');
  let delivery: JsonRecord = {};
  try {
    delivery = raw ? JSON.parse(raw) : {};
  } catch {
    delivery = { raw };
  }
  if (!response.ok || !delivery?.success) {
    const message = firstValue(delivery?.error, delivery?.message, delivery?.raw, `Failed to send tenant ${channel}`);
    throw new Error(`${message} (status ${response.status})`);
  }
  return { success: true, providerMessageId: delivery.providerMessageId || null, status: delivery.status || 'queued' };
}

async function sendBookingEmail(db: any, context: JsonRecord, input: JsonRecord) {
  return sendEmail(db, context, {
    ...input,
    emailType: firstValue(input.emailType, input.email_type, 'booking_confirmation'),
  });
}

async function sendEmail(db: any, context: JsonRecord, input: JsonRecord) {
  assertLeadAllowsChannel(context.lead, 'email');
  const toEmail = firstValue(input.to, input.toEmail, input.to_email, context.lead.email);
  if (!toEmail) throw new Error('Lead email is required');
  return sendDirectTenantEmail(db, context, { ...input, to: toEmail });
  const functionBaseUrl = Deno.env.get('INSFORGE_FUNCTION_BASE_URL');
  if (!functionBaseUrl) throw new Error('Email delivery function is not configured');
  const emailActionsSecret = Deno.env.get('EMAIL_ACTIONS_SECRET') || Deno.env.get('ELEVENLABS_TOOL_SECRET');
  if (!emailActionsSecret) throw new Error('Email delivery authorization is not configured');

  // ElevenLabs supplies the intent and context only. OpenAI writes the email and
  // email-actions resolves the verified tenant sender or platform fallback.
  const response = await fetch(`${functionBaseUrl.replace(/\/$/, '')}/email-actions?action=send-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-email-actions-secret': emailActionsSecret },
    body: JSON.stringify({
      tenantId: context.tenantId,
      tenantAgentId: context.agentId,
      leadId: context.leadId,
      to: toEmail,
      emailType: firstValue(input.emailType, input.email_type, 'elevenlabs_follow_up'),
      message: firstValue(input.message, input.text, input.bodyText, input.body_text, null),
      meetingUrl: firstValue(input.meetingUrl, input.meeting_url, null),
      startTime: firstValue(input.startTime, input.start_time, null),
      endTime: firstValue(input.endTime, input.end_time, null),
      title: firstValue(input.title, null),
      serviceInterest: context.lead.service_interest || null,
      metadata: { source: 'elevenlabs_tool', externalConversationId: context.externalConversationId || null },
    }),
  });
  const delivery = await response.json().catch(() => ({}));
  if (!response.ok || !delivery?.success) throw new Error(delivery?.error || 'Failed to send automated email');
  const subject = delivery?.draft?.subject || 'Automated follow-up';

  await logTimelineMessage(db, {
    tenantId: context.tenantId,
    leadId: context.leadId,
    channel: 'email',
    direction: 'outbound',
    messageType: 'email_queued',
    subject,
    bodyText: subject,
    status: 'sent',
    metadata: { emailQueueId: delivery?.queued?.id || null, senderResolution: delivery?.sender?.resolution || null, writer: 'openai' },
  });

  return { success: true, queued: delivery?.queued || null, writer: 'openai', sender: delivery?.sender || null };
}

async function recordCallOutcome(db: any, context: JsonRecord, input: JsonRecord) {
  const outcome = String(firstValue(input.outcome, input.status, 'completed'));
  const summary = String(firstValue(input.summary, input.callSummary, input.call_summary, '') || '');
  const transcript = firstValue(input.transcript, input.transcriptText, input.transcript_text);
  const conversation = await ensureConversation(db, context.tenantId, context.leadId, 'voice');

  await db.database.from('lead_conversations').update({
    conversation_status: outcome,
    last_summary: summary || `Call outcome recorded: ${outcome}`,
    last_intent: outcome,
    last_intent_at: nowIso(),
    last_inbound_at: nowIso(),
    updated_at: nowIso(),
    metadata: {
      ...(conversation?.metadata || {}),
      elevenlabsOutcome: outcome,
      elevenlabsConversationId: firstValue(input.elevenlabsConversationId, input.elevenlabs_conversation_id, input.conversationId, input.conversation_id),
      transcript,
    },
  }).eq('id', conversation.id).eq('tenant_id', context.tenantId);

  await db.database.from('leads').update({
    status: outcome === 'booked' ? 'booked' : context.lead.status,
    last_contacted_at: nowIso(),
    updated_at: nowIso(),
  }).eq('tenant_id', context.tenantId).eq('id', context.leadId);

  await logTimelineMessage(db, {
    tenantId: context.tenantId,
    leadId: context.leadId,
    channel: 'voice',
    messageType: 'call_outcome',
    bodyText: summary || `Call outcome: ${outcome}`,
    status: 'logged',
    metadata: { outcome, transcript },
  });

  return { success: true, outcome, conversationId: conversation.id };
}

async function escalateToHuman(db: any, context: JsonRecord, input: JsonRecord) {
  const reason = String(firstValue(input.reason, input.escalationReason, input.escalation_reason, 'AI agent requested human review'));
  const rows = await unwrap(
    await db.database.from('leads').update({
      requires_human_review: true,
      automation_paused: true,
      escalation_reason: reason,
      updated_at: nowIso(),
    }).eq('tenant_id', context.tenantId).eq('id', context.leadId).select(),
    'Failed to escalate lead'
  );
  await logTimelineMessage(db, {
    tenantId: context.tenantId,
    leadId: context.leadId,
    channel: 'voice',
    messageType: 'human_escalation',
    bodyText: reason,
    metadata: { source: 'elevenlabs_tool' },
  });
  return { success: true, lead: publicLead(rows?.[0] || context.lead) };
}

async function markOptOut(db: any, context: JsonRecord, input: JsonRecord) {
  const channel = String(firstValue(input.channel, input.optOutChannel, input.opt_out_channel, 'all')).toLowerCase();
  if (!['call', 'sms', 'whatsapp', 'email', 'all'].includes(channel)) throw new Error('Unsupported opt-out channel');
  const patch: JsonRecord = {
    opted_out_at: nowIso(),
    opt_out_channel: channel,
    opt_out_reason: firstValue(input.reason, input.optOutReason, input.opt_out_reason, 'Opt-out captured by AI agent'),
    automation_paused: true,
    updated_at: nowIso(),
  };
  if (channel === 'all') {
    patch.do_not_contact = true;
    patch.call_consent = false;
    patch.sms_consent = false;
    patch.whatsapp_consent = false;
    patch.email_consent = false;
  } else {
    const column = channelConsentColumn(channel);
    if (column) patch[column] = false;
  }
  const rows = await unwrap(
    await db.database.from('leads').update(patch).eq('tenant_id', context.tenantId).eq('id', context.leadId).select(),
    'Failed to mark opt-out'
  );
  await logTimelineMessage(db, {
    tenantId: context.tenantId,
    leadId: context.leadId,
    channel,
    messageType: 'opt_out',
    bodyText: `Lead opted out of ${channel}.`,
    metadata: { reason: patch.opt_out_reason },
  });
  return { success: true, lead: publicLead(rows?.[0] || context.lead) };
}

async function runToolAction(db: any, action: string, context: JsonRecord, input: JsonRecord) {
  if (action === 'get_lead_context') return getLeadContext(db, context);
  if (action === 'update_lead_status') return updateLeadStatus(db, context, input);
  if (action === 'check_availability') return checkAvailability(db, context, input);
  if (action === 'create_booking') return createBooking(db, context, input);
  if (action === 'send_sms') return sendSms(db, context, input);
  if (action === 'send_whatsapp') return sendWhatsapp(db, context, input);
  if (action === 'send_email') return sendEmail(db, context, input);
  if (action === 'record_call_outcome') return recordCallOutcome(db, context, input);
  if (action === 'escalate_to_human') return escalateToHuman(db, context, input);
  if (action === 'mark_opt_out') return markOptOut(db, context, input);
  return { success: false, error: 'Unsupported ElevenLabs tool action' };
}

export default async function(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return optionsResponse();
  if (req.method === 'GET') {
    return jsonResponse({
      success: true,
      service: 'elevenlabs-tool-webhooks',
      configured: Boolean(Deno.env.get('ELEVENLABS_TOOL_SECRET')),
      actions: TOOL_ACTIONS,
    });
  }

  const startedAt = Date.now();
  const db = createInsForgeClient();
  const url = new URL(req.url);
  const body = await req.json().catch(() => ({}));
  const action = normalizeAction(url.searchParams.get('action'), body);
  let context: JsonRecord | null = null;

  try {
    if (!TOOL_ACTIONS.includes(action)) {
      return jsonResponse({ success: false, error: 'Unsupported ElevenLabs tool action' }, 404);
    }

    requireToolSecret(req, body);
    const input = toolInput(body);
    context = await loadToolContext(db, input);
    const result = await runToolAction(db, action, context, input);
    const status = result?.success === false ? 'blocked' : 'success';
    await writeAuditLog(db, context, action, body, status, result, result?.error || null, startedAt);
    return jsonResponse(result, 200);
  } catch (error) {
    const message = safeError(error);
    const response = { success: false, error: message };
    const status = /signature|secret|auth/i.test(message) ? 401 : 500;
    if (context) {
      await writeAuditLog(db, context, action, body, status === 401 ? 'blocked' : 'failed', response, message, startedAt).catch(() => null);
    }
    return jsonResponse(response, status);
  }
}
