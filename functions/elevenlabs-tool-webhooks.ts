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

function twilioBasicAuth() {
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
  if (!accountSid || !authToken) throw new Error('Twilio SMS is not configured');
  return {
    accountSid,
    authorization: btoa(`${accountSid}:${authToken}`),
  };
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

async function updateLeadStatus(db: any, context: JsonRecord, input: JsonRecord) {
  const patch = sanitizeLeadPatch(input);
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
  if (booking.provider === 'manual') {
    return {
      success: true,
      available: true,
      mode: 'manual_link',
      bookingUrl: booking.booking_url,
      message: 'Use the tenant manual booking link to finish scheduling.',
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
  const start = startTime ? new Date(startTime) : null;
  if (!start || Number.isNaN(start.getTime())) throw new Error('A valid start_time is required to create a booking');
  const endTime = firstValue(input.endTime, input.end_time) || new Date(start.getTime() + durationMinutes * 60 * 1000).toISOString();
  const meetingUrl = firstValue(input.meetingUrl, input.meeting_url, booking.booking_url);
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
    metadata: { meetingId: meeting?.id, meetingUrl },
  });

  assertLeadAllowsChannel(context.lead, 'sms');
  const reminderRows = [24, 1]
    .map((hours) => ({
      tenant_id: context.tenantId,
      meeting_id: meeting?.id,
      reminder_type: `${hours}h`,
      delivery_method: 'sms',
      scheduled_for: new Date(start.getTime() - hours * 60 * 60 * 1000).toISOString(),
      status: new Date(start.getTime() - hours * 60 * 60 * 1000).getTime() > Date.now() ? 'pending' : 'skipped',
    }));
  await unwrap(
    await db.database.from('meeting_reminders').insert(reminderRows),
    'Failed to schedule booking reminders'
  );

  const formattedTime = start.toLocaleString('en-US', { timeZone: context.tenant.default_timezone || 'UTC', dateStyle: 'medium', timeStyle: 'short' });
  await sendSms(db, context, { message: `Your appointment is confirmed for ${formattedTime}.${meetingUrl ? ` Meeting details: ${meetingUrl}` : ''}` });

  return { success: true, booking: meeting, smsConfirmationSent: true, remindersScheduled: reminderRows.filter((row) => row.status === 'pending').length };
}

async function sendSms(db: any, context: JsonRecord, input: JsonRecord) {
  assertLeadAllowsChannel(context.lead, 'sms');
  const readiness = await loadTenantReadiness(db, context.tenantId, context.agentId);
  const from = String(firstValue(input.from, input.fromPhone, input.from_phone, readiness.phoneNumber?.phone_number, Deno.env.get('TWILIO_PHONE_NUMBER')) || '');
  const to = normalizePhone(firstValue(input.to, input.toPhone, input.to_phone, context.lead.phone) || '');
  const body = String(firstValue(input.message, input.body, input.text, '') || '').trim();
  if (!from) throw new Error('Tenant SMS sender is not configured');
  if (!to) throw new Error('Lead phone number is required');
  if (!body) throw new Error('SMS message body is required');

  const twilio = twilioBasicAuth();
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilio.accountSid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${twilio.authorization}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ From: from, To: to, Body: body }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result?.message || `Twilio SMS failed with ${response.status}`);

  await logTimelineMessage(db, {
    tenantId: context.tenantId,
    leadId: context.leadId,
    channel: 'sms',
    direction: 'outbound',
    messageType: 'sms',
    bodyText: body,
    providerMessageId: result.sid || null,
    status: 'sent',
    sentAt: nowIso(),
    metadata: { source: 'elevenlabs_tool', twilioStatus: result.status || null },
  });

  return { success: true, providerMessageId: result.sid || null, status: result.status || 'sent' };
}

async function sendWhatsapp(db: any, context: JsonRecord, input: JsonRecord) {
  assertLeadAllowsChannel(context.lead, 'whatsapp');
  const readiness = await loadTenantReadiness(db, context.tenantId, context.agentId);
  if (readiness.phoneNumber?.whatsapp_status !== 'active') {
    throw new Error('Tenant WhatsApp account is not active');
  }
  await logTimelineMessage(db, {
    tenantId: context.tenantId,
    leadId: context.leadId,
    channel: 'whatsapp',
    direction: 'outbound',
    messageType: 'whatsapp',
    bodyText: firstValue(input.message, input.body, input.text, ''),
    status: 'failed',
    errorMessage: 'WhatsApp provider send is not configured yet',
    metadata: { source: 'elevenlabs_tool' },
  });
  throw new Error('WhatsApp provider send is not configured yet');
}

async function sendEmail(db: any, context: JsonRecord, input: JsonRecord) {
  assertLeadAllowsChannel(context.lead, 'email');
  const toEmail = firstValue(input.to, input.toEmail, input.to_email, context.lead.email);
  if (!toEmail) throw new Error('Lead email is required');
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
