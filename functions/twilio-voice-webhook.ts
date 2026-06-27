import { createClient } from 'npm:@insforge/sdk';

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
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Voice-Bridge-Secret',
};

const ELEVENLABS_API_BASE = 'https://api.elevenlabs.io/v1';

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

function xmlResponse(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'text/xml' },
  });
}

function xmlEscape(value: any) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function nowIso() {
  return new Date().toISOString();
}

async function unwrap(result: any, message: string) {
  if (result?.error) throw new Error(result.error.message || message);
  return result?.data;
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function firstValue(...values: any[]) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return null;
}

function dynamicString(value: any) {
  if (value === undefined || value === null) return '';
  return String(value);
}

function safeError(error: any, fallback = 'Twilio voice webhook failed') {
  return String(error?.message || fallback)
    .replace(/(authorization|bearer|token|secret|api[_-]?key|xi-api-key)(=|:)?\s*[^\s,}]+/gi, '$1=[redacted]')
    .slice(0, 500);
}

function statusFromTwilio(callStatus: string) {
  const status = String(callStatus || '').toLowerCase();
  if (status === 'completed') return 'completed';
  if (status === 'busy') return 'busy';
  if (status === 'no-answer' || status === 'no_answer') return 'no_answer';
  if (status === 'canceled') return 'canceled';
  if (status === 'failed') return 'failed';
  if (status === 'in-progress' || status === 'answered') return 'in_progress';
  if (status === 'ringing' || status === 'queued' || status === 'initiated') return 'ringing';
  return status || 'in_progress';
}

function canonicalLifecycleOutcome(value: any) {
  const normalized = String(value || '').trim().toLowerCase().replace(/-/g, '_');
  const aliases: Record<string, string> = {
    completed: 'answered',
    canceled: 'failed',
    no_answer: 'no_answer',
  };
  const canonical = [
    'answered',
    'no_answer',
    'busy',
    'voicemail_left',
    'callback_requested',
    'not_available',
    'channel_switch_requested',
    'not_interested_now',
    'not_interested_final',
    'wrong_number',
    'opted_out',
    'booked',
    'failed',
    'interrupted',
    'needs_human_review',
  ];
  const mapped = aliases[normalized] || normalized;
  return canonical.includes(mapped) ? mapped : 'failed';
}

async function recordLifecycleEvent(db: any, event: JsonRecord) {
  if (!event.tenantId || !event.leadId) return null;
  const { error } = await db.database.from('lead_lifecycle_events').insert([{
    tenant_id: event.tenantId,
    lead_id: event.leadId,
    source_action_id: event.sourceActionId || null,
    source_channel: event.sourceChannel || 'call',
    previous_stage: event.previousStage || null,
    next_stage: event.nextStage || null,
    previous_scheduling_state: event.previousSchedulingState || null,
    next_scheduling_state: event.nextSchedulingState || null,
    outcome: event.outcome ? canonicalLifecycleOutcome(event.outcome) : null,
    next_action_type: event.nextActionType || null,
    next_action_channel: event.nextActionChannel || null,
    next_action_at: event.nextActionAt || null,
    reason: event.reason || null,
    blocked_reason: event.blockedReason || null,
    metadata: event.metadata || {},
  }]);
  if (error) console.warn('Failed to record lifecycle event', error.message || error);
  return !error;
}

function functionBaseUrl(reqUrl: URL) {
  return (Deno.env.get('INSFORGE_FUNCTION_BASE_URL') || reqUrl.origin).replace(/\/$/, '');
}

async function loadSession(db: any, sessionId: string) {
  if (!sessionId) throw new Error('voice call session id is required');
  const rows = await unwrap(
    await db.database.from('voice_call_sessions').select('*').eq('id', sessionId).limit(1),
    'Failed to load voice call session'
  );
  const session = rows?.[0] || null;
  if (!session) throw new Error('Voice call session was not found');
  return session;
}

function isCallableTenantAgent(agent: JsonRecord | null) {
  return Boolean(agent?.id && ['live', 'testing'].includes(agent.status) && agent.elevenlabs_agent_id);
}

async function assertCallableSessionAgent(db: any, session: JsonRecord) {
  if (!session.tenant_agent_id) {
    throw new Error('Voice call session is missing active tenant AI agent context');
  }
  const rows = await unwrap(
    await db.database
      .from('tenant_agents')
      .select('*')
      .eq('tenant_id', session.tenant_id)
      .eq('id', session.tenant_agent_id)
      .limit(1),
    'Failed to load voice call tenant agent'
  );
  const agent = rows?.[0] || null;
  if (!isCallableTenantAgent(agent)) {
    throw new Error('Voice call tenant AI agent is not live/testing and synced to ElevenLabs');
  }
  if (session.elevenlabs_agent_id !== agent.elevenlabs_agent_id) {
    await db.database.from('voice_call_sessions').update({
      elevenlabs_agent_id: agent.elevenlabs_agent_id,
      updated_at: nowIso(),
      metadata: {
        ...(session.metadata || {}),
        correctedElevenLabsAgentId: true,
        previousElevenLabsAgentId: session.elevenlabs_agent_id || null,
      },
    }).eq('id', session.id).eq('tenant_id', session.tenant_id);
    session.elevenlabs_agent_id = agent.elevenlabs_agent_id;
  }
  return agent;
}

async function verifySessionToken(session: JsonRecord, token: string) {
  if (!token) throw new Error('Call context token is required');
  if (new Date(session.context_expires_at).getTime() < Date.now()) {
    throw new Error('Call context token expired');
  }
  const tokenHash = await sha256Hex(token);
  if (tokenHash !== session.context_token_hash) throw new Error('Invalid call context token');
}

async function loadContextRows(db: any, session: JsonRecord) {
  const [tenants, leads, agents, bookingRows, knowledgeRows, actionRows] = await Promise.all([
    unwrap(await db.database.from('tenants').select('*').eq('id', session.tenant_id).limit(1), 'Failed to load tenant'),
    session.lead_id
      ? unwrap(await db.database.from('leads').select('*').eq('tenant_id', session.tenant_id).eq('id', session.lead_id).limit(1), 'Failed to load lead')
      : Promise.resolve([]),
    session.tenant_agent_id
      ? unwrap(await db.database.from('tenant_agents').select('*').eq('tenant_id', session.tenant_id).eq('id', session.tenant_agent_id).limit(1), 'Failed to load tenant agent')
      : Promise.resolve([]),
    unwrap(
      await db.database
        .from('tenant_booking_integrations')
        .select('*')
        .eq('tenant_id', session.tenant_id)
        .eq('status', 'connected')
        .order('created_at', { ascending: false })
        .limit(1),
      'Failed to load tenant booking integration'
    ),
    unwrap(
      await db.database
        .from('tenant_knowledge_documents')
        .select('*')
        .eq('tenant_id', session.tenant_id)
        .eq('status', 'ready')
        .order('created_at', { ascending: true })
        .limit(50),
      'Failed to load tenant knowledge documents'
    ),
    session.bob_action_id
      ? unwrap(await db.database.from('bob_actions').select('*').eq('tenant_id', session.tenant_id).eq('id', session.bob_action_id).limit(1), 'Failed to load Bob action')
      : Promise.resolve([]),
  ]);
  return {
    session,
    tenant: tenants?.[0] || null,
    lead: leads?.[0] || null,
    agent: agents?.[0] || null,
    bookingIntegration: bookingRows?.[0] || null,
    knowledgeDocuments: knowledgeRows || [],
    bobAction: actionRows?.[0] || null,
  };
}

function leadDisplayName(lead: JsonRecord) {
  return lead?.full_name || [lead?.first_name, lead?.last_name].filter(Boolean).join(' ') || 'there';
}

function serviceInterest(lead: JsonRecord) {
  const imported = lead?.custom_fields?.importedLeadData || {};
  return lead?.service_interest
    || lead?.service
    || lead?.interest
    || imported.service_interest
    || imported.service
    || imported.interest
    || imported.coverage_type_needed
    || '';
}

function normalizePreferredContactChannel(value: any) {
  const normalized = String(value || '').trim().toLowerCase().replace(/[\s_-]+/g, '_');
  if (['phone', 'voice', 'call', 'calls', 'phone_call', 'phonecall', 'telephone'].includes(normalized)) return 'call';
  if (['email', 'e_mail', 'mail'].includes(normalized)) return 'email';
  if (['sms', 'text', 'text_message'].includes(normalized)) return 'sms';
  if (['whatsapp', 'wa'].includes(normalized)) return 'whatsapp';
  return normalized || '';
}

function leadFormData(lead: JsonRecord) {
  const customFields = lead?.custom_fields || {};
  const imported = customFields.importedLeadData || customFields.formData || customFields.form_data || customFields.submission || {};
  return imported && typeof imported === 'object' && !Array.isArray(imported) ? imported : {};
}

function compactValue(value: any) {
  if (value === undefined || value === null) return '';
  if (Array.isArray(value)) return value.map(compactValue).filter(Boolean).join(', ');
  if (typeof value === 'object') return Object.entries(value)
    .map(([key, entry]) => `${String(key).replace(/_/g, ' ')}: ${compactValue(entry)}`)
    .filter((entry) => !entry.endsWith(': '))
    .join('; ');
  return String(value).trim();
}

function leadFormSummary(lead: JsonRecord) {
  const formData = leadFormData(lead);
  const entries = Object.entries(formData)
    .map(([key, value]) => [String(key).replace(/_/g, ' '), compactValue(value)] as [string, string])
    .filter(([, value]) => value && value.length <= 240)
    .slice(0, 8);
  const summaryParts = [
    lead?.qualification_notes ? `qualification notes: ${compactValue(lead.qualification_notes)}` : '',
    lead?.location_summary ? `location: ${compactValue(lead.location_summary)}` : '',
    lead?.budget_range ? `budget: ${compactValue(lead.budget_range)}` : '',
    ...entries.map(([key, value]) => `${key}: ${value}`),
  ].filter(Boolean);
  return summaryParts.join(' | ').slice(0, 1200);
}

function friendlyLabel(value: string) {
  return String(value || '')
    .replace(/[?_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function friendlyValue(value: any) {
  return compactValue(value)
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function leadInterestPhrase(lead: JsonRecord) {
  const interest = friendlyValue(serviceInterest(lead));
  return interest || 'insurance coverage';
}

function insuranceFormOpening(rows: JsonRecord) {
  const agentName = rows.agent?.display_name || 'the AI assistant';
  return `Hi ${leadDisplayName(rows.lead)}, I’m ${agentName}. You filled our form on insurance, and I see you’re interested in ${leadInterestPhrase(rows.lead)}. Would you like to book a consultation with one of our experts?`;
}

function isEmailFirstFollowupCall(rows: JsonRecord) {
  const payload = rows.bobAction?.payload || rows.session?.metadata || {};
  return payload.lifecyclePath === 'email_first_call_after_no_reply'
    || payload.source === 'email_first_followup_call'
    || Boolean(payload.previousEmailActionId || payload.previous_email_action_id);
}

function leadOpeningSummary(lead: JsonRecord) {
  const formData = leadFormData(lead);
  const skipKeys = new Set([
    'platform',
    'lead_status',
    'preferred_contact_channel',
    'preferred_contact_method',
    'preferred_method',
    'contact_method',
    'email',
    'phone',
    'phone_number',
  ]);
  const preferredKeys = [
    'coverage_type_needed',
    'service_interest',
    'occupation',
    'do_you_have_existing_coverage?',
    'existing_coverage',
    'budget_range',
  ];
  const parts: string[] = [];

  if (lead?.location_summary) parts.push(`location: ${friendlyValue(lead.location_summary)}`);
  if (lead?.service_interest) parts.push(`interest: ${friendlyValue(lead.service_interest)}`);
  if (lead?.budget_range) parts.push(`budget: ${friendlyValue(lead.budget_range)}`);

  for (const key of preferredKeys) {
    if (parts.length >= 3) break;
    if (skipKeys.has(key)) continue;
    const value = formData[key];
    const text = friendlyValue(value);
    if (text) parts.push(`${friendlyLabel(key)}: ${text}`);
  }

  for (const [key, value] of Object.entries(formData)) {
    if (parts.length >= 3) break;
    if (skipKeys.has(key)) continue;
    if (preferredKeys.includes(key)) continue;
    const text = friendlyValue(value);
    if (text && text.length <= 80) parts.push(`${friendlyLabel(key)}: ${text}`);
  }

  return parts.slice(0, 3).join('; ');
}

function dateAfterDays(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function hasUsefulPreFilledLeadContext(lead: JsonRecord) {
  if (!lead) return false;
  const formData = leadFormData(lead);
  const formAnswerCount = Object.values(formData).filter((value) => compactValue(value)).length;
  const hasQualification = Boolean(
    lead.qualification_notes
    || (lead.qualification_status && !['unqualified', 'new', 'unknown'].includes(String(lead.qualification_status).toLowerCase()))
    || lead.custom_fields?.aiQualification?.latest
  );
  return formAnswerCount >= 2 || hasQualification || Boolean(lead.location_summary || lead.budget_range);
}

function qualificationMode(lead: JsonRecord) {
  if (hasUsefulPreFilledLeadContext(lead)) return 'form_prequalified_ask_only_missing_then_book';
  return 'standard_short_dynamic_qualification';
}

function contactPreferenceInstruction(lead: JsonRecord) {
  const preferred = normalizePreferredContactChannel(lead?.preferred_contact_channel);
  if (preferred === 'email') {
    return 'Lead preferred contact channel is email. Keep the call brief, acknowledge that preference, and offer to send the details or booking link by email if email consent/address exist. If they are willing to book now, continue by phone; otherwise send email and end politely.';
  }
  if (preferred === 'call') {
    return 'Lead preferred contact channel is call/phone. Prioritize booking directly on this call and avoid pushing them to email unless they ask.';
  }
  if (preferred === 'sms') {
    return 'Lead preferred contact channel is SMS/text. Keep the call brief and offer to send the booking link or recap by SMS if SMS consent exists. Continue booking by phone only if they want to do it now.';
  }
  if (preferred === 'whatsapp') {
    return 'Lead preferred contact channel is WhatsApp. Keep the call brief and offer WhatsApp follow-up only if WhatsApp consent and tenant capability exist. Continue booking by phone only if they want to do it now.';
  }
  return 'Lead preferred contact channel is not explicit. Use the current call to book if they are comfortable, and adapt immediately if they ask for email, SMS, WhatsApp, or a later call.';
}

function buildCallFirstMessage(rows: JsonRecord) {
  const agentName = rows.agent?.display_name || 'the AI assistant';
  const tenantName = rows.tenant?.name || 'the company';
  const service = serviceInterest(rows.lead);
  const reason = service ? `your recent request about ${friendlyValue(service)}` : 'your recent request';
  const preferredLanguage = rows.lead?.preferred_language;
  const preferredContactChannel = normalizePreferredContactChannel(rows.lead?.preferred_contact_channel);
  const prefilled = hasUsefulPreFilledLeadContext(rows.lead);
  const actionPayload = rows.bobAction?.payload || {};
  const sessionMetadata = rows.session?.metadata || {};
  if (isEmailFirstFollowupCall(rows)) {
    const variants = [
      `Hi ${leadDisplayName(rows.lead)}, my name is ${agentName}, assistant for ${tenantName}. We saw you filled one of our forms about ${leadInterestPhrase(rows.lead)}. The details are in the email I sent, and I’m calling to help schedule a meeting with one of our expert advisors. What day and time works for you?`,
      `Hello ${leadDisplayName(rows.lead)}, this is ${agentName}, assistant for ${tenantName}. I’m following up on your form for ${leadInterestPhrase(rows.lead)}. I sent the details by email, and I can help book a meeting with our expert advisor now if you have a minute.`,
      `Hi ${leadDisplayName(rows.lead)}, ${agentName} here, assistant for ${tenantName}. You recently asked about ${leadInterestPhrase(rows.lead)} through our form. I emailed the details and wanted to help schedule time with an expert advisor.`
    ];
    const seed = String(rows.bobAction?.id || rows.session?.id || rows.lead?.id || '').split('').reduce((total, char) => total + char.charCodeAt(0), 0);
    return variants[seed % variants.length];
  }
  if (actionPayload.reboundCall || actionPayload.rebound_call || sessionMetadata.reboundCall || sessionMetadata.rebound_call) {
    const summary = leadOpeningSummary(rows.lead);
    const summarySentence = summary ? ` I still have your details: ${summary}.` : '';
    return `Hi ${leadDisplayName(rows.lead)}, I’m ${agentName}. Sorry for the interruption — our call dropped. You filled our form on insurance, and I see you’re interested in ${leadInterestPhrase(rows.lead)}.${summarySentence} Would you like to book a consultation with one of our experts?`;
  }
  if (prefilled) {
    const languageNote = preferredLanguage ? ` I’ll continue in ${preferredLanguage}.` : '';
    if (preferredContactChannel === 'email') {
      return `${insuranceFormOpening(rows)}${languageNote} If you prefer email, I can also send the details by email.`;
    }
    return `${insuranceFormOpening(rows)}${languageNote}`;
  }
  if (preferredLanguage) {
    return `Hi ${leadDisplayName(rows.lead)}, I’m ${agentName}. You filled our form on insurance, and I see you’re interested in ${leadInterestPhrase(rows.lead)}. I’ll continue in ${preferredLanguage}. Would you like to book a consultation with one of our experts?`;
  }
  if (preferredContactChannel === 'email') {
    return `Hi ${leadDisplayName(rows.lead)}, I’m ${agentName}. You filled our form on insurance, and I see you’re interested in ${leadInterestPhrase(rows.lead)}. Would you like to book a consultation with one of our experts, or should I send the details by email?`;
  }
  return `Hi ${leadDisplayName(rows.lead)}, I’m ${agentName}. You filled our form on insurance, and I see you’re interested in ${leadInterestPhrase(rows.lead)}. Would you like to book a consultation with one of our experts?`;
}

function buildCallPrompt(rows: JsonRecord) {
  const agentName = rows.agent?.display_name || 'the AI assistant';
  const tenantName = rows.tenant?.name || 'the company';
  const service = serviceInterest(rows.lead) || 'the service they asked about';
  const booking = rows.bookingIntegration || {};
  const bookingProvider = booking.provider || 'manual';
  const bookingPath = booking.booking_url || booking.event_type_id || 'not configured';
  const tenantTimezone = rows.tenant?.default_timezone || 'UTC';
  const businessHoursStart = String(rows.tenant?.business_hours_start || '10:00').slice(0, 5);
  const businessHoursEnd = String(rows.tenant?.business_hours_end || '17:00').slice(0, 5);
  const tenantLocation = [rows.tenant?.city, rows.tenant?.country].filter(Boolean).join(', ') || 'not configured';
  const formSummary = leadFormSummary(rows.lead);
  const mode = qualificationMode(rows.lead);
  const suggestedDate = dateAfterDays(2);

  return [
    `You are ${agentName}, an AI outreach and booking assistant for ${tenantName}.`,
    `This is an outbound campaign call to ${leadDisplayName(rows.lead)} about ${service}.`,
    rows.bobAction?.payload?.reboundCall || rows.bobAction?.payload?.rebound_call || rows.session?.metadata?.reboundCall || rows.session?.metadata?.rebound_call
      ? 'This is a rebound call after an interrupted/drop event. Start by apologizing briefly for the interruption, then continue the same purpose without restarting awkwardly.'
      : '',
    isEmailFirstFollowupCall(rows)
      ? `This is a follow-up call after a first outreach email. Vary the wording naturally, but include the same meaning: "Hello, my name is ${agentName}, assistant for ${tenantName}. We saw you filled one of our forms about ${service}. The details are in the email, and we would like to schedule a meeting with you and our expert advisor." If the call reaches voicemail, leave this short reason for calling and mention the email details.`
      : 'Opening script for insurance/form leads: "Hi [lead name], I’m [agent name]. You filled our form on insurance, and I see you’re interested in [service_interest or coverage_type_needed]. Would you like to book a consultation with one of our experts?" Do not mention the company name in the opening.',
    'Use expressive speech naturally. Match your tone to the lead: calm and reassuring when they sound worried, warm when they are positive, and clear and measured when explaining details. Keep delivery professional and never overact.',
    'Default to English. Do not ask the lead to choose a language. If lead preferred_language is already set, use that language from the start. If the lead asks to switch language mid-call, never end the call and never restart the introduction. Respond within one short sentence in the requested language, then continue all subsequent responses in that language from the current point in the conversation. Save preferredLanguage with update_lead_status after the spoken acknowledgement, but do not let the save delay the language switch.',
    'Never end the call because of background noise, cross-talk, multiple interruptions, silence, or a language change. Treat interruptions as normal conversation. If the lead is silent, patiently prompt again instead of ending.',
    rows.lead?.preferred_language ? `Lead preferred language: ${rows.lead.preferred_language}. Continue in this language unless the lead changes it.` : 'Lead preferred language is not set. Use English by default and do not ask for language selection.',
    contactPreferenceInstruction(rows.lead),
    'After the lead responds, keep the conversation warm, concise, and useful. If they are busy, say it is not a good time, ask you to call later, or give a better day/time, do not pressure them and do not abandon the lead. Ask one short clarifying question for the best callback time if needed, then call update_lead_status with outcome callback_requested or not_available, nextContactAt when a time is known, and preferredContactChannel call unless they asked for another consented channel.',
    'Use the tenant knowledge base for company-specific services, process, pricing guidance, objections, and policies. If knowledge is missing, do not invent details; offer to have the team follow up.',
    'Use the runtime lead variables first. Only call get_lead_context when important lead, company, campaign, or setup context is missing or ambiguous. Do not call get_lead_context just because the lead said yes to booking or gave a day/time.',
    `Business-hours guardrail: this tenant allows outbound voice calls only from ${businessHoursStart} to ${businessHoursEnd} in tenant local time (${tenantTimezone}). Never request, schedule, or retry a voice call outside that tenant window. If outside that window, wait until the next allowed tenant window or use an allowed non-call channel only when consent permits it.`,
    `Booking provider: ${bookingProvider}. Booking path: ${bookingPath}.`,
    `Tenant location: ${tenantLocation}. Tenant timezone: ${tenantTimezone}.`,
    `Tenant calling hours: ${businessHoursStart} to ${businessHoursEnd} local tenant time.`,
    formSummary ? `Lead already provided this form/context data. Use it as answered information and do not ask it again: ${formSummary}.` : '',
    mode === 'form_prequalified_ask_only_missing_then_book'
      ? `This lead appears pre-qualified or form-qualified. Do not run the long question-and-answer flow. The required flow is: introduce yourself with the insurance form script, mention the known interest/coverage, then ask whether they want to book a consultation with one of our experts. If the lead says yes, okay, sure, sounds good, or otherwise agrees but does not give a time, do not go silent and do not call a tool yet. Immediately ask one scheduling question only: "Great — what day and time will you be available?" or offer ${suggestedDate} as a suggested date and ask what time works. When the lead gives a date and time, call create_booking immediately. Do not call check_availability first during a live call.`
      : 'This lead does not have enough pre-filled qualification context. Use a short dynamic qualification flow before booking.',
    'The core purpose of this outbound call is booking. Treat service_interest, imported coverage_type_needed, imported service/interest, lead_form_summary, and location as enough reason/context to proceed. Do not ask why the lead is interested when those fields exist. Only ask a service-interest clarifier when all lead/form interest fields are missing.',
    'Handle lifecycle intents explicitly. If the lead says "text me", "send info", "send details", "email me", "WhatsApp me", or asks to continue on another channel, call update_lead_status with outcome channel_switch_requested, preferredContactChannel/requestedChannel set to sms, email, or whatsapp, and nextContactAt if they gave a time. Then use send_sms, send_email, or send_whatsapp only when the matching consent/contact/setup exists. If the lead says "not now", "not interested right now", or "maybe later" but does not opt out, call update_lead_status with outcome not_interested_now, leadStage nurture, schedulingState needs_follow_up, and do not mark them do-not-contact. If the lead says stop, unsubscribe, wrong number, or never contact me again, use mark_opt_out instead.',
    'Before booking, qualify the lead with a short dynamic question set based on their service interest and tenant knowledge only when the form/context does not already answer the needed questions. Ask only relevant missing questions, one at a time. For pre-filled leads, skip repeated questions completely unless one must-have detail is truly missing; the main objective is immediate booking.',
    'After collecting qualification answers, call update_lead_status with qualificationQuestions, qualificationAnswers, qualificationSummary, qualificationStatus, qualificationScore when useful, and leadStage or schedulingState.',
    'During this active call, treat every booking date the lead mentions as a near-future date by default, not next year. Use current_date, current_time, and current_timezone to resolve relative dates like today, tomorrow, Monday, next week, or later today to the next near-future occurrence. If the lead gives a weekday or day number without a clear month, ask one short confirmation question for the exact month, day, year, and time before calling create_booking. Never use old example dates, training-data dates, or a far-future year to fill missing date parts.',
    'After the introduction for a form-filled lead, move immediately to confirming a booking. If they say yes, okay, sure, sounds good, or otherwise agrees but does not give a time, ask one scheduling question only: "Great — what day and time will you be available?" If the lead gives both date and time, call create_booking immediately. Do not call check_availability first during a live call.',
    'If a booking is created, say the consultation is confirmed and that meeting details/reminders will be sent by the allowed channels. Do not wait for delivery confirmation during the live call.',
    'Do not read, pronounce, or spell long URLs by default. Say that the meeting link will be sent by SMS/email. If the lead explicitly asks you to read a link aloud, read it slowly in short chunks.',
    'Use send_sms for requested texts, recaps, booking links, or follow-ups only when SMS consent exists. Use send_email only when email consent and an email address exist. Use send_whatsapp only when WhatsApp consent and tenant WhatsApp setup exist. Respect opt-outs immediately.',
    'Record outcomes with record_call_outcome before ending when practical.',
  ].filter(Boolean).join('\n\n');
}

function knowledgeRefs(documents: JsonRecord[]) {
  return (documents || [])
    .filter((document) => document.elevenlabs_document_id)
    .map((document) => ({
      id: document.elevenlabs_document_id,
      name: document.title,
      type: document.source_type,
    }));
}

function buildConversationConfigOverride(rows: JsonRecord) {
  const mode = String(Deno.env.get('ELEVENLABS_CONVERSATION_OVERRIDE_MODE') || 'first_message').toLowerCase();
  const toolIds = Array.isArray(rows.agent?.metadata?.elevenlabs?.toolIds)
    ? rows.agent.metadata.elevenlabs.toolIds.filter(Boolean)
    : [];
  if (mode !== 'full') {
    return {
      agent: {
        first_message: buildCallFirstMessage(rows),
      },
    };
  }
  return {
    agent: {
      first_message: buildCallFirstMessage(rows),
      prompt: {
        prompt: buildCallPrompt(rows),
        knowledge_base: knowledgeRefs(rows.knowledgeDocuments),
        ...(toolIds.length ? { tool_ids: toolIds } : {}),
      },
    },
  };
}

function buildCallDynamicVariables(session: JsonRecord, rows: JsonRecord) {
  const service = serviceInterest(rows.lead);
  const preferredContactChannel = normalizePreferredContactChannel(rows.lead?.preferred_contact_channel);
  const formSummary = leadFormSummary(rows.lead);
  return {
    tenant_id: dynamicString(session.tenant_id),
    tenant_name: dynamicString(rows.tenant?.name),
    lead_id: dynamicString(session.lead_id),
    tenant_agent_id: dynamicString(session.tenant_agent_id),
    agent_name: dynamicString(rows.agent?.display_name || 'the AI assistant'),
    company_name: dynamicString(rows.tenant?.name),
    tenant_city: dynamicString(rows.tenant?.city),
    tenant_country: dynamicString(rows.tenant?.country),
    tenant_location: dynamicString([rows.tenant?.city, rows.tenant?.country].filter(Boolean).join(', ')),
    business_hours_start: dynamicString(String(rows.tenant?.business_hours_start || '10:00').slice(0, 5)),
    business_hours_end: dynamicString(String(rows.tenant?.business_hours_end || '17:00').slice(0, 5)),
    lead_name: dynamicString(leadDisplayName(rows.lead)),
    service_interest: dynamicString(service),
    service_interest_status: dynamicString(service ? 'known' : 'missing_or_unclear'),
    preferred_language: dynamicString(rows.lead?.preferred_language || 'English'),
    preferred_contact_channel: dynamicString(preferredContactChannel),
    qualification_mode: dynamicString(qualificationMode(rows.lead)),
    lead_form_summary: dynamicString(formSummary),
    form_context_available: dynamicString(formSummary ? 'true' : 'false'),
    language_switch_mode: 'instant_spoken_ack_then_fast_save',
    booking_date_default: 'near_future_confirm_unclear_month_year',
    booking_context: dynamicString(rows.lead?.preferred_meeting_window),
    suggested_booking_date: dynamicString(dateAfterDays(2)),
    booking_provider: dynamicString(rows.bookingIntegration?.provider),
    booking_url: dynamicString(rows.bookingIntegration?.booking_url),
    call_reason: dynamicString(isEmailFirstFollowupCall(rows)
      ? (service ? 'Follow up after emailed details about ' + service : 'Follow up after emailed details')
      : (service ? 'Follow up about ' + service : 'Follow up on recent request')),
    email_first_followup_call: dynamicString(isEmailFirstFollowupCall(rows) ? 'true' : ''),
    ready_knowledge_documents: dynamicString(rows.knowledgeDocuments?.length || 0),
    current_date: dynamicString(new Date().toISOString().slice(0, 10)),
    current_time: dynamicString(new Date().toISOString()),
    current_timezone: dynamicString(rows.tenant?.default_timezone || 'UTC'),
    rebound_call: dynamicString(rows.bobAction?.payload?.reboundCall || rows.bobAction?.payload?.rebound_call || rows.session?.metadata?.reboundCall || rows.session?.metadata?.rebound_call ? 'true' : ''),
    previous_call_summary: dynamicString(rows.bobAction?.payload?.previousCallSummary || rows.bobAction?.payload?.previous_call_summary),
  };
}

function elevenLabsApiKey() {
  const apiKey = Deno.env.get('ELEVENLABS_API_KEY');
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY is not configured');
  return apiKey;
}

async function getElevenLabsSignedUrl(agentId: string) {
  const apiKey = Deno.env.get('ELEVENLABS_API_KEY');
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY is not configured');
  if (!agentId) throw new Error('ElevenLabs agent id is required');
  const url = new URL('https://api.elevenlabs.io/v1/convai/conversation/get-signed-url');
  url.searchParams.set('agent_id', agentId);
  const response = await fetch(url.toString(), {
    headers: { 'xi-api-key': apiKey },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body?.signed_url) {
    throw new Error(body?.detail?.message || body?.message || 'Failed to create ElevenLabs signed URL');
  }
  return body.signed_url;
}

function streamTwiml(reqUrl: URL, session: JsonRecord, token: string, preConnectSay = '') {
  const bridgeUrl = session.media_bridge_url || Deno.env.get('VOICE_MEDIA_BRIDGE_WS_URL');
  if (!bridgeUrl || !String(bridgeUrl).startsWith('wss://')) {
    return xmlResponse('<?xml version="1.0" encoding="UTF-8"?><Response><Say>Voice automation is not configured yet. A team member will follow up. Goodbye.</Say><Hangup/></Response>');
  }
  const statusCallback = new URL('/twilio-voice-webhook', functionBaseUrl(reqUrl));
  statusCallback.searchParams.set('mode', 'stream-status');
  statusCallback.searchParams.set('sessionId', session.id);

  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<Response>',
    preConnectSay ? `  <Say>${xmlEscape(preConnectSay)}</Say>` : '',
    '  <Connect>',
    `    <Stream url="${xmlEscape(bridgeUrl)}" name="${xmlEscape(`voice-${session.id}`)}" statusCallback="${xmlEscape(statusCallback.toString())}" statusCallbackMethod="POST">`,
    `      <Parameter name="VoiceCallSessionId" value="${xmlEscape(session.id)}" />`,
    `      <Parameter name="CallContextToken" value="${xmlEscape(token)}" />`,
    `      <Parameter name="TenantId" value="${xmlEscape(session.tenant_id)}" />`,
    `      <Parameter name="LeadId" value="${xmlEscape(session.lead_id || '')}" />`,
    `      <Parameter name="TenantAgentId" value="${xmlEscape(session.tenant_agent_id || '')}" />`,
    '    </Stream>',
    '  </Connect>',
    '</Response>',
  ].join('\n');

  return xmlResponse(body);
}

async function reboundPreConnectSay(db: any, session: JsonRecord) {
  if (session.metadata?.reboundCall || session.metadata?.rebound_call) {
    const message = session.metadata?.reboundOpening || 'Sorry for the interruption — our call dropped. I am calling back now.';
    return /book/i.test(String(message)) ? message : `${String(message).replace(/\s+$/, '')} Can we book a quick consultation now?`;
  }
  if (!session.bob_action_id) return '';
  const rows = await unwrap(
    await db.database.from('bob_actions').select('payload').eq('tenant_id', session.tenant_id).eq('id', session.bob_action_id).limit(1),
    'Failed to load Bob action for rebound intro'
  );
  const payload = rows?.[0]?.payload || {};
  if (!payload.reboundCall && !payload.rebound_call) return '';
  const message = payload.reboundOpening || 'Sorry for the interruption — our call dropped. I am calling back now.';
  return /book/i.test(String(message)) ? message : `${String(message).replace(/\s+$/, '')} Can we book a quick consultation now?`;
}

async function callPreConnectSay(db: any, session: JsonRecord) {
  const reboundMessage = await reboundPreConnectSay(db, session);
  if (reboundMessage) return reboundMessage;
  const rows = await loadContextRows(db, session);
  return buildCallFirstMessage(rows);
}

async function registerElevenLabsTwilioCall(db: any, session: JsonRecord, body: JsonRecord) {
  const rows = await loadContextRows(db, session);
  const fromNumber = firstValue(body.From, session.metadata?.from);
  const toNumber = firstValue(body.To, session.metadata?.to);
  if (!fromNumber || !toNumber) throw new Error('Twilio From and To numbers are required for ElevenLabs register call');

  const conversationInitiationClientData: JsonRecord = {
    dynamic_variables: buildCallDynamicVariables(session, rows),
  };

  if (Deno.env.get('ENABLE_ELEVENLABS_CONVERSATION_OVERRIDE') === 'true') {
    conversationInitiationClientData.conversation_config_override = buildConversationConfigOverride(rows);
  }

  const response = await fetch(ELEVENLABS_API_BASE + '/convai/twilio/register-call', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': elevenLabsApiKey(),
    },
    body: JSON.stringify({
      agent_id: session.elevenlabs_agent_id,
      from_number: fromNumber,
      to_number: toNumber,
      direction: session.direction || 'outbound',
      conversation_initiation_client_data: conversationInitiationClientData,
    }),
  });

  const twiml = await response.text();
  if (!response.ok) {
    throw new Error('ElevenLabs register call failed: ' + response.status + ' ' + twiml.slice(0, 300));
  }
  return xmlResponse(twiml);
}

async function handleIntro(db: any, reqUrl: URL, body: JsonRecord) {
  const sessionId = reqUrl.searchParams.get('sessionId') || body.VoiceCallSessionId || body.sessionId || '';
  const token = reqUrl.searchParams.get('token') || body.CallContextToken || body.token || '';
  const session = await loadSession(db, sessionId);
  await verifySessionToken(session, token);
  await assertCallableSessionAgent(db, session);

  await db.database.from('voice_call_sessions').update({
    twilio_call_sid: firstValue(body.CallSid, session.twilio_call_sid) || null,
    status: 'in_progress',
    answered_at: nowIso(),
    updated_at: nowIso(),
    metadata: {
      ...(session.metadata || {}),
      twilioRequest: {
        accountSid: body.AccountSid || null,
        from: body.From || null,
        to: body.To || null,
      },
    },
  }).eq('id', session.id).eq('tenant_id', session.tenant_id);

  if (session.bob_action_id) {
    await db.database.from('bob_actions').update({
      status: 'calling',
      updated_at: nowIso(),
      result: {
        ...(session.metadata?.bobActionResult || {}),
        callSid: firstValue(body.CallSid, session.twilio_call_sid) || null,
        voiceCallSessionId: session.id,
        providerStatus: 'answered',
      },
    }).eq('id', session.bob_action_id).eq('tenant_id', session.tenant_id);
  }

  if (Deno.env.get('ELEVENLABS_TWILIO_REGISTER_CALL_ENABLED') === 'true') {
    return await registerElevenLabsTwilioCall(db, session, body);
  }

  return streamTwiml(reqUrl, session, token, await callPreConnectSay(db, session));
}

async function handleStatus(db: any, reqUrl: URL, body: JsonRecord) {
  const sessionId = reqUrl.searchParams.get('sessionId') || body.VoiceCallSessionId || body.sessionId || '';
  const actionId = reqUrl.searchParams.get('actionId') || body.actionId || '';
  const session = sessionId ? await loadSession(db, sessionId) : null;
  const mappedStatus = statusFromTwilio(body.CallStatus || body.CallStatusCallbackEvent);
  const duration = body.CallDuration ? Number(body.CallDuration) : null;
  const ended = ['completed', 'failed', 'canceled', 'no_answer', 'busy'].includes(mappedStatus);

  if (session) {
    await db.database.from('voice_call_sessions').update({
      twilio_call_sid: firstValue(body.CallSid, session.twilio_call_sid) || null,
      status: mappedStatus,
      duration_seconds: Number.isFinite(duration) ? duration : session.duration_seconds,
      ended_at: ended ? nowIso() : session.ended_at,
      error_message: firstValue(body.ErrorMessage, body.SipResponseCode === '487' ? 'Call canceled before answer' : null, session.error_message),
      metadata: {
        ...(session.metadata || {}),
        twilioStatus: body.CallStatus || null,
        twilioCallbackEvent: body.CallStatusCallbackEvent || null,
      },
    }).eq('id', session.id).eq('tenant_id', session.tenant_id);
  }

  if (actionId || session?.bob_action_id) {
    await db.database.from('bob_actions').update({
      status: mappedStatus === 'completed' ? 'completed' : (ended ? 'failed' : 'calling'),
      executed_at: ended ? nowIso() : null,
      updated_at: nowIso(),
      result: {
        callSid: body.CallSid || session?.twilio_call_sid || null,
        voiceCallSessionId: session?.id || null,
        callStatus: body.CallStatus || null,
        callDuration: duration,
      },
    }).eq('id', actionId || session?.bob_action_id).eq('tenant_id', session?.tenant_id || body.tenantId);
  }

  if (session?.lead_id && ended && mappedStatus !== 'completed') {
    await recordLifecycleEvent(db, {
      tenantId: session.tenant_id,
      leadId: session.lead_id,
      sourceActionId: actionId || session.bob_action_id || null,
      sourceChannel: 'call',
      outcome: mappedStatus,
      reason: `Twilio call ended with status ${mappedStatus}.`,
      blockedReason: mappedStatus === 'no_answer' || mappedStatus === 'busy' ? null : 'voice_call_failed',
      metadata: {
        source: 'twilio_voice_status',
        voiceCallSessionId: session.id,
        twilioCallSid: firstValue(body.CallSid, session.twilio_call_sid) || null,
        durationSeconds: duration,
      },
    });
  }

  return jsonResponse({ success: true });
}

async function handleStreamStatus(db: any, reqUrl: URL, body: JsonRecord) {
  const sessionId = reqUrl.searchParams.get('sessionId') || body.VoiceCallSessionId || body.sessionId || '';
  const session = await loadSession(db, sessionId);
  const event = String(body.StreamEvent || '').toLowerCase();
  const patch: JsonRecord = {
    twilio_stream_sid: firstValue(body.StreamSid, session.twilio_stream_sid) || null,
    metadata: {
      ...(session.metadata || {}),
      streamStatus: body.StreamEvent || null,
      streamError: body.StreamError || null,
    },
  };
  if (event === 'stream-started') {
    patch.stream_started_at = nowIso();
    patch.status = 'in_progress';
  }
  if (event === 'stream-stopped') {
    patch.stream_stopped_at = nowIso();
  }
  if (event === 'stream-error') {
    patch.status = 'failed';
    patch.error_message = body.StreamError || 'Twilio stream error';
    patch.stream_stopped_at = nowIso();
  }

  await db.database.from('voice_call_sessions').update(patch).eq('id', session.id).eq('tenant_id', session.tenant_id);
  return jsonResponse({ success: true });
}

function requireBridgeSecret(req: Request) {
  const expected = Deno.env.get('VOICE_BRIDGE_CONTEXT_SECRET');
  if (!expected) return;
  const provided = req.headers.get('x-voice-bridge-secret') || '';
  if (provided !== expected) throw new Error('Invalid voice bridge secret');
}

async function handleBridgeContext(db: any, req: Request, body: JsonRecord) {
  requireBridgeSecret(req);
  const sessionId = body.voiceCallSessionId || body.sessionId || body.VoiceCallSessionId || '';
  const token = body.callContextToken || body.token || body.CallContextToken || '';
  const session = await loadSession(db, sessionId);
  await verifySessionToken(session, token);
  await assertCallableSessionAgent(db, session);
  const rows = await loadContextRows(db, session);
  const signedUrl = await getElevenLabsSignedUrl(session.elevenlabs_agent_id);

  return jsonResponse({
    success: true,
    voiceCallSession: {
      id: session.id,
      tenantId: session.tenant_id,
      leadId: session.lead_id,
      conversationId: session.conversation_id,
      tenantAgentId: session.tenant_agent_id,
      twilioCallSid: session.twilio_call_sid,
      elevenlabsAgentId: session.elevenlabs_agent_id,
    },
    elevenlabs: {
      signedUrl,
    },
    ...(Deno.env.get('ENABLE_ELEVENLABS_CONVERSATION_OVERRIDE') === 'true'
      ? { conversationConfigOverride: buildConversationConfigOverride(rows) }
      : {}),
    dynamicVariables: buildCallDynamicVariables(session, rows),
  });
}

async function logTimelineMessage(db: any, session: JsonRecord, input: JsonRecord) {
  if (!session.lead_id) return null;
  const rows = await unwrap(
    await db.database.from('lead_conversation_messages').insert([{
      tenant_id: session.tenant_id,
      lead_id: session.lead_id,
      conversation_id: session.conversation_id || null,
      direction: input.direction || 'system',
      channel: 'voice',
      message_type: input.messageType || 'voice_event',
      body_text: input.bodyText || null,
      provider_message_id: input.providerMessageId || session.twilio_call_sid || null,
      status: input.status || 'logged',
      sent_at: input.sentAt || null,
      metadata: { voiceCallSessionId: session.id, ...(input.metadata || {}) },
    }]).select(),
    'Failed to write voice timeline event'
  );
  return rows?.[0] || null;
}

function callObservedSeconds(session: JsonRecord, completedAt: string) {
  if (Number.isFinite(Number(session.duration_seconds)) && Number(session.duration_seconds) > 0) {
    return Number(session.duration_seconds);
  }
  const answeredAt = session.answered_at ? new Date(session.answered_at).getTime() : 0;
  const endedAt = completedAt ? new Date(completedAt).getTime() : Date.now();
  if (!answeredAt || Number.isNaN(answeredAt) || Number.isNaN(endedAt)) return null;
  return Math.max(0, Math.round((endedAt - answeredAt) / 1000));
}

function isMeaningfulTranscript(transcript: any) {
  return String(transcript || '').trim().length >= 12;
}

function isEmptyCallSummary(summary: any) {
  const normalized = String(summary || '').trim().toLowerCase();
  return !normalized || normalized === 'voice call ended.' || normalized === 'voice call ended';
}

function reboundAttemptFromPayload(payload: JsonRecord) {
  return Number(payload?.reboundAttempt || payload?.rebound_attempt || 0);
}

async function scheduleReboundCall(db: any, session: JsonRecord, input: JsonRecord) {
  if (!session.lead_id || !session.bob_action_id) return null;
  const actionRows = await unwrap(
    await db.database
      .from('bob_actions')
      .select('*')
      .eq('tenant_id', session.tenant_id)
      .eq('id', session.bob_action_id)
      .limit(1),
    'Failed to load action for rebound scheduling'
  );
  const action = actionRows?.[0] || null;
  const previousPayload = action?.payload || {};
  const nextAttempt = reboundAttemptFromPayload(previousPayload) + 1;
  if (nextAttempt > 1) return null;

  const scheduledFor = new Date(Date.now() + Number(input.reboundDelayMs || 45_000)).toISOString();
  const reboundPayload = {
    ...previousPayload,
    source: 'voice_rebound',
    reboundCall: true,
    reboundAttempt: nextAttempt,
    previousVoiceCallSessionId: session.id,
    previousBobActionId: session.bob_action_id,
    previousCallSummary: input.summary || 'Previous call was interrupted before the conversation could continue.',
    tenantAgentId: session.tenant_agent_id || previousPayload.tenantAgentId || previousPayload.tenant_agent_id || null,
  };

  const rows = await unwrap(
    await db.database.from('bob_actions').insert([{
      tenant_id: session.tenant_id,
      campaign_id: action?.campaign_id || null,
      campaign_lead_id: action?.campaign_lead_id || null,
      lead_id: session.lead_id,
      conversation_id: session.conversation_id || action?.conversation_id || null,
      action_type: 'queue_call_attempt',
      channel: 'phone',
      status: 'awaiting_call',
      reason: 'Rebound call after interrupted voice stream',
      scheduled_for: scheduledFor,
      payload: reboundPayload,
    }]).select(),
    'Failed to schedule rebound call'
  );
  return rows?.[0] || null;
}

async function finalizeCallState(db: any, session: JsonRecord, input: JsonRecord) {
  const completedAt = firstValue(input.timestamp, nowIso());
  const outcome = String(input.outcome || 'completed');
  const summary = input.summary || session.summary || `Voice call ended with outcome: ${outcome}`;
  const transcript = input.transcript || session.transcript || null;
  const observedSeconds = callObservedSeconds(session, completedAt);
  const interrupted = outcome !== 'failed'
    && !isMeaningfulTranscript(transcript)
    && isEmptyCallSummary(summary)
    && (observedSeconds === null || observedSeconds <= 90);
  const finalOutcome = interrupted ? 'interrupted' : outcome;
  const callSucceeded = finalOutcome !== 'failed' && finalOutcome !== 'interrupted';
  const reboundAction = interrupted ? await scheduleReboundCall(db, session, { timestamp: completedAt, summary }) : null;

  if (session.lead_id) {
    const leadRows = await unwrap(
      await db.database.from('leads').select('status').eq('tenant_id', session.tenant_id).eq('id', session.lead_id).limit(1),
      'Failed to load lead for call finalization'
    );
    const lead = leadRows?.[0] || null;
    const leadPatch: JsonRecord = {
      last_contacted_at: completedAt,
      updated_at: completedAt,
    };
    if (callSucceeded && lead?.status === 'new') leadPatch.status = 'contacted';
    await db.database.from('leads').update(leadPatch).eq('tenant_id', session.tenant_id).eq('id', session.lead_id);
  }

  if (session.conversation_id) {
    await db.database.from('lead_conversations').update({
      conversation_status: callSucceeded ? 'completed' : (interrupted ? 'interrupted' : 'failed'),
      last_summary: interrupted ? 'Call interrupted before conversation could continue. Rebound call queued.' : summary,
      last_intent: finalOutcome,
      last_intent_at: completedAt,
      updated_at: completedAt,
      metadata: {
        ...(session.metadata || {}),
        voiceCallSessionId: session.id,
        elevenlabsConversationId: input.elevenlabsConversationId || session.elevenlabs_conversation_id || null,
        transcript,
        interrupted,
        reboundActionId: reboundAction?.id || null,
      },
    }).eq('id', session.conversation_id).eq('tenant_id', session.tenant_id);
  }

  if (session.bob_action_id) {
    const actionRows = await unwrap(
      await db.database.from('bob_actions').select('result').eq('tenant_id', session.tenant_id).eq('id', session.bob_action_id).limit(1),
      'Failed to load action for call finalization'
    );
    await db.database.from('bob_actions').update({
      status: callSucceeded ? 'completed' : (interrupted && reboundAction ? 'skipped' : 'failed'),
      executed_at: completedAt,
      updated_at: completedAt,
      result: {
        ...(actionRows?.[0]?.result || {}),
        voiceCallSessionId: session.id,
        callOutcome: finalOutcome,
        callSummary: interrupted ? 'Call interrupted before conversation could continue. Rebound call queued.' : summary,
        elevenlabsConversationId: input.elevenlabsConversationId || session.elevenlabs_conversation_id || null,
        interrupted,
        observedSeconds,
        reboundActionId: reboundAction?.id || null,
      },
    }).eq('id', session.bob_action_id).eq('tenant_id', session.tenant_id);
  }

  if (session.lead_id) {
    const campaignRows = await unwrap(
      await db.database
        .from('campaign_leads')
        .select('id,metadata')
        .eq('tenant_id', session.tenant_id)
        .eq('lead_id', session.lead_id)
        .in('status', ['queued', 'running']),
      'Failed to load campaign lead state'
    );
    for (const campaignLead of campaignRows || []) {
      await db.database.from('campaign_leads').update({
        status: callSucceeded || reboundAction ? 'running' : 'failed',
        current_step: callSucceeded ? 'voice_call_completed' : (reboundAction ? 'rebound_call_queued' : 'voice_call_failed'),
        updated_at: completedAt,
        metadata: {
          ...(campaignLead.metadata || {}),
          lastVoiceCallSessionId: session.id,
          lastVoiceCallOutcome: finalOutcome,
          lastVoiceCallAt: completedAt,
          reboundActionId: reboundAction?.id || null,
        },
      }).eq('id', campaignLead.id).eq('tenant_id', session.tenant_id);
    }
  }

  if (session.lead_id) {
    await recordLifecycleEvent(db, {
      tenantId: session.tenant_id,
      leadId: session.lead_id,
      sourceActionId: session.bob_action_id || null,
      sourceChannel: 'call',
      outcome: finalOutcome,
      nextActionType: reboundAction ? reboundAction.action_type : null,
      nextActionChannel: reboundAction ? reboundAction.channel : null,
      nextActionAt: reboundAction ? reboundAction.scheduled_for : null,
      reason: interrupted
        ? 'Call was interrupted before the conversation could continue. Rebound call queued.'
        : summary,
      blockedReason: callSucceeded || reboundAction ? null : 'voice_call_failed',
      metadata: {
        source: 'twilio_voice_finalization',
        voiceCallSessionId: session.id,
        observedSeconds,
        interrupted,
        reboundActionId: reboundAction?.id || null,
      },
    });
  }

  return { interrupted, finalOutcome, observedSeconds, reboundAction };
}

async function handleBridgeEvent(db: any, req: Request, body: JsonRecord) {
  requireBridgeSecret(req);
  const sessionId = body.voiceCallSessionId || body.sessionId || '';
  const token = body.callContextToken || body.token || '';
  const session = await loadSession(db, sessionId);
  await verifySessionToken(session, token);

  const eventType = String(body.type || body.eventType || 'bridge_event');
  const patch: JsonRecord = { metadata: { ...(session.metadata || {}), lastBridgeEvent: eventType } };
  if (body.twilioStreamSid) patch.twilio_stream_sid = body.twilioStreamSid;
  if (body.elevenlabsConversationId) patch.elevenlabs_conversation_id = body.elevenlabsConversationId;
  if (eventType === 'call_started') {
    patch.status = 'in_progress';
    patch.stream_started_at = firstValue(body.timestamp, nowIso());
  }
  if (eventType === 'call_ended') {
    patch.status = body.outcome === 'failed' ? 'failed' : 'completed';
    patch.stream_stopped_at = firstValue(body.timestamp, nowIso());
    patch.ended_at = firstValue(body.timestamp, nowIso());
    patch.outcome = body.outcome || 'completed';
    patch.summary = body.summary || session.summary;
    patch.transcript = body.transcript || session.transcript;
  }
  if (body.error) {
    patch.status = 'failed';
    patch.error_message = safeError({ message: body.error }, 'Voice bridge error');
  }

  await db.database.from('voice_call_sessions').update(patch).eq('id', session.id).eq('tenant_id', session.tenant_id);

  if (eventType === 'user_transcript') {
    await logTimelineMessage(db, session, {
      direction: 'inbound',
      messageType: 'call_transcript',
      bodyText: body.text || body.transcript || '',
      metadata: { source: 'elevenlabs', eventType },
    });
  } else if (eventType === 'agent_response') {
    await logTimelineMessage(db, session, {
      direction: 'outbound',
      messageType: 'agent_voice_response',
      bodyText: body.text || body.response || '',
      metadata: { source: 'elevenlabs', eventType },
    });
  } else if (eventType === 'call_ended') {
    const finalization = await finalizeCallState(db, session, {
      timestamp: firstValue(body.timestamp, nowIso()),
      outcome: body.outcome || 'completed',
      summary: body.summary || null,
      transcript: body.transcript || null,
      elevenlabsConversationId: body.elevenlabsConversationId || session.elevenlabs_conversation_id || null,
    });
    if (finalization.interrupted) {
      await db.database.from('voice_call_sessions').update({
        status: 'failed',
        outcome: 'interrupted',
        summary: 'Call interrupted before conversation could continue. Rebound call queued.',
        metadata: {
          ...(session.metadata || {}),
          lastBridgeEvent: eventType,
          interrupted: true,
          observedSeconds: finalization.observedSeconds,
          reboundActionId: finalization.reboundAction?.id || null,
        },
      }).eq('id', session.id).eq('tenant_id', session.tenant_id);
    }
    await logTimelineMessage(db, session, {
      direction: 'system',
      messageType: 'call_outcome',
      bodyText: finalization.interrupted
        ? 'Call was interrupted before the conversation could continue. A rebound call was queued.'
        : (body.summary || `Voice call ended with outcome: ${body.outcome || 'completed'}`),
      metadata: {
        source: 'voice_bridge',
        outcome: finalization.finalOutcome,
        interrupted: finalization.interrupted,
        reboundActionId: finalization.reboundAction?.id || null,
      },
    });
  }

  return jsonResponse({ success: true });
}

export default async function(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return optionsResponse();

  const db = createInsForgeClient();
  const url = new URL(req.url);
  const mode = url.searchParams.get('mode') || 'intro';

  if (req.method === 'GET' && mode === 'health') {
    return jsonResponse({
      success: true,
      service: 'twilio-voice-webhook',
      streamConfigured: Boolean(Deno.env.get('VOICE_MEDIA_BRIDGE_WS_URL')),
      bridgeContextProtected: Boolean(Deno.env.get('VOICE_BRIDGE_CONTEXT_SECRET')),
      elevenlabsConfigured: Boolean(Deno.env.get('ELEVENLABS_API_KEY')),
      elevenlabsRegisterCallEnabled: Deno.env.get('ELEVENLABS_TWILIO_REGISTER_CALL_ENABLED') === 'true',
      activeVoicePath: Deno.env.get('ELEVENLABS_TWILIO_REGISTER_CALL_ENABLED') === 'true' ? 'elevenlabs_twilio_register_call' : 'voice_media_bridge',
      conversationOverrideEnabled: Deno.env.get('ENABLE_ELEVENLABS_CONVERSATION_OVERRIDE') === 'true',
      conversationOverrideMode: Deno.env.get('ELEVENLABS_CONVERSATION_OVERRIDE_MODE') || 'first_message',
    });
  }

  const body = await readRequestBody(req).catch(() => ({}));

  try {
    if (mode === 'status') return await handleStatus(db, url, body);
    if (mode === 'stream-status') return await handleStreamStatus(db, url, body);
    if (mode === 'bridge-context') return await handleBridgeContext(db, req, body);
    if (mode === 'bridge-event') return await handleBridgeEvent(db, req, body);
    return await handleIntro(db, url, body);
  } catch (error) {
    const message = safeError(error);
    if (mode === 'intro') {
      return xmlResponse(`<?xml version="1.0" encoding="UTF-8"?><Response><Say>${xmlEscape(message)}. A team member will follow up. Goodbye.</Say><Hangup/></Response>`, 200);
    }
    return jsonResponse({ success: false, error: message }, /secret|token|auth/i.test(message) ? 401 : 500);
  }
}
