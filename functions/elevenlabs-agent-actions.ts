import { createAdminClient, createClient } from 'npm:@insforge/sdk';

const ELEVENLABS_API_BASE = 'https://api.elevenlabs.io/v1';
const DEFAULT_PROMPT_VERSION = 'v2-campaign-booking';
const DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM';
const ELEVENLABS_EXPRESSIVE_TTS_MODEL_ID = 'eleven_v3_conversational';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

type JsonRecord = Record<string, any>;

function optionsResponse() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

function jsonResponse(data: unknown, status = 200) {
  return Response.json(data, { status, headers: corsHeaders });
}

function safeError(error: any, fallback = 'ElevenLabs agent action failed') {
  const message = error?.message || fallback;
  if (/permission denied for function resolve_current_portal_user/i.test(message)) {
    return 'Authentication required';
  }
  return message.replace(/xi-api-key=[^\s&]+/gi, 'xi-api-key=[redacted]');
}

function bearerToken(req: Request) {
  const authorization = req.headers.get('authorization') || '';
  return authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
}

function createInsForgeClient(req: Request) {
  const token = bearerToken(req);
  return createClient({
    baseUrl: Deno.env.get('INSFORGE_BASE_URL'),
    anonKey: Deno.env.get('ANON_KEY'),
    ...(token ? { edgeFunctionToken: token } : {}),
  });
}

function createInsForgeAdminClient() {
  const apiKey = Deno.env.get('API_KEY');
  if (!apiKey) return null;
  return createAdminClient({
    baseUrl: Deno.env.get('INSFORGE_BASE_URL'),
    apiKey,
  });
}

async function unwrap(result: any, message: string) {
  if (result?.error) throw new Error(result.error.message || message);
  return result?.data;
}

async function resolvePortalUser(db: any) {
  const portalUser = await unwrap(
    await db.database.rpc('resolve_current_portal_user'),
    'Authentication required'
  );
  if (!portalUser?.tenantId) throw new Error('Tenant context is required');
  return portalUser;
}

async function resolvePlatformAdminProfile(db: any) {
  const profile = await unwrap(
    await db.database.rpc('current_platform_admin_profile'),
    'Failed to check platform admin profile'
  );
  return profile || { isPlatformAdmin: false };
}

function requireTenant(portalUser: JsonRecord, requestedTenantId?: string, platformProfile: JsonRecord = {}) {
  if (requestedTenantId && requestedTenantId !== portalUser.tenantId) {
    if (platformProfile?.isPlatformAdmin) return requestedTenantId;
    throw new Error('Requested tenant does not match signed-in tenant');
  }
  return portalUser.tenantId;
}

async function loadTenantContext(db: any, tenantId: string, agentId: string) {
  if (!agentId) throw new Error('agentId is required');

  const [tenantRows, agentRows, phoneRows, emailRows, bookingRows, tenantKnowledgeRows] = await Promise.all([
    unwrap(
      await db.database.from('tenants').select('*').eq('id', tenantId).limit(1),
      'Failed to load tenant'
    ),
    unwrap(
      await db.database.from('tenant_agents').select('*').eq('tenant_id', tenantId).eq('id', agentId).limit(1),
      'Failed to load tenant agent'
    ),
    unwrap(
      await db.database
        .from('tenant_phone_numbers')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('status', 'active')
        .order('is_primary', { ascending: false })
        .order('created_at', { ascending: true })
        .limit(5),
      'Failed to load tenant phone numbers'
    ),
    unwrap(
      await db.database
        .from('tenant_email_identities')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(5),
      'Failed to load tenant email identity'
    ),
    unwrap(
      await db.database
        .from('tenant_booking_integrations')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(5),
      'Failed to load tenant booking integration'
    ),
    unwrap(
      await db.database
        .from('tenant_knowledge_documents')
        .select('*')
        .eq('tenant_id', tenantId)
        .or(`tenant_agent_id.is.null,tenant_agent_id.eq.${agentId}`)
        .order('created_at', { ascending: true })
        .limit(100),
      'Failed to load tenant knowledge documents'
    ),
  ]);

  const agent = agentRows?.[0];
  if (!agent) throw new Error('Tenant agent was not found');
  if (agent.status === 'archived') throw new Error('Archived agents cannot be provisioned');
  const tenant = tenantRows?.[0] || null;
  const platformKnowledgeRows = await loadPlatformKnowledgeDocuments(db, tenant, tenantId, agentId);

  return {
    tenant,
    agent,
    phoneNumber: phoneRows?.find((row: JsonRecord) => row.is_primary) || phoneRows?.[0] || null,
    emailIdentity: emailRows?.[0] || null,
    bookingIntegration: bookingRows?.[0] || null,
    knowledgeDocuments: [
      ...platformKnowledgeRows,
      ...((tenantKnowledgeRows || []).map((document: JsonRecord) => ({
        ...document,
        __knowledge_table: 'tenant_knowledge_documents',
        __storage_bucket: 'tenant-knowledge',
      }))),
    ],
  };
}

function activeKnowledgeStatuses() {
  return ['uploaded', 'processing', 'ready', 'failed'];
}

function annotatePlatformKnowledge(document: JsonRecord, source: string) {
  return {
    ...document,
    __knowledge_table: 'platform_knowledge_documents',
    __storage_bucket: 'platform-knowledge',
    __shared_source: source,
  };
}

async function loadPlatformKnowledgeDocuments(db: any, tenant: JsonRecord | null, tenantId: string, agentId: string) {
  const activeStatuses = activeKnowledgeStatuses();
  const queries = [
    unwrap(
      await db.database
        .from('platform_knowledge_documents')
        .select('*')
        .eq('scope', 'global')
        .in('status', activeStatuses)
        .order('created_at', { ascending: true })
        .limit(100),
      'Failed to load global knowledge documents'
    ),
  ];

  if (tenant?.business_niche) {
    queries.push(unwrap(
      await db.database
        .from('platform_knowledge_documents')
        .select('*')
        .eq('scope', 'niche')
        .eq('niche_key', tenant.business_niche)
        .in('status', activeStatuses)
        .order('created_at', { ascending: true })
        .limit(100),
      'Failed to load niche knowledge documents'
    ));
  } else {
    queries.push(Promise.resolve([]));
  }

  const assignments = await unwrap(
    await db.database
      .from('tenant_knowledge_assignments')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .or(`tenant_agent_id.is.null,tenant_agent_id.eq.${agentId}`)
      .order('created_at', { ascending: true })
      .limit(200),
    'Failed to load shared knowledge assignments'
  );

  const assignedIds = [...new Set((assignments || []).map((assignment: JsonRecord) => assignment.platform_knowledge_document_id).filter(Boolean))];
  const assignedRows = assignedIds.length
    ? await unwrap(
      await db.database
        .from('platform_knowledge_documents')
        .select('*')
        .in('id', assignedIds)
        .in('status', activeStatuses)
        .order('created_at', { ascending: true })
        .limit(200),
      'Failed to load assigned platform knowledge documents'
    )
    : [];

  const [globalRows, nicheRows] = await Promise.all(queries);
  const merged = new Map<string, JsonRecord>();
  for (const document of globalRows || []) {
    merged.set(document.id, annotatePlatformKnowledge(document, 'global_default'));
  }
  for (const document of nicheRows || []) {
    merged.set(document.id, annotatePlatformKnowledge(document, 'niche_default'));
  }
  for (const document of assignedRows || []) {
    merged.set(document.id, annotatePlatformKnowledge(document, 'super_admin_override'));
  }
  return [...merged.values()];
}

function elevenLabsApiKey() {
  const apiKey = Deno.env.get('ELEVENLABS_API_KEY');
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY is not configured in InsForge secrets');
  return apiKey;
}

async function elevenLabsRequest(path: string, options: RequestInit = {}) {
  const endpoint = path.startsWith('http') ? path : `${ELEVENLABS_API_BASE}${path}`;
  const response = await fetch(endpoint, {
    ...options,
    headers: {
      'xi-api-key': elevenLabsApiKey(),
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(options.headers || {}),
    },
  });

  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('json') ? await response.json().catch(() => ({})) : await response.text();
  if (!response.ok) {
    const message = typeof data === 'string' ? data : data?.detail?.[0]?.msg || data?.message || data?.error;
    throw new Error(message || `ElevenLabs request failed: ${response.status}`);
  }
  return data;
}

function safeName(value: string, fallback: string) {
  return String(value || fallback).trim().slice(0, 120) || fallback;
}

function emailDomain(value: unknown) {
  const match = String(value || '').match(/@([A-Z0-9.-]+\.[A-Z]{2,})$/i);
  return (match?.[1] || '').toLowerCase();
}

function platformEmailDomain() {
  return String(Deno.env.get('RESEND_INBOUND_DOMAIN') || emailDomain(Deno.env.get('EMAIL_FROM')) || '').trim().toLowerCase();
}

function agentEmailLocalPartFromName(value: unknown) {
  const local = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 48);
  return local || 'bob';
}

async function agentEmailExists(db: any, agent: JsonRecord, emailAddress: string) {
  const rows = await unwrap(
    await db.database
      .from('tenant_agents')
      .select('id')
      .eq('email_address', emailAddress)
      .limit(2),
    'Failed to check tenant agent email address'
  );
  return (rows || []).some((row: JsonRecord) => row.id !== agent.id);
}

async function resolveAgentEmailAddress(db: any, context: JsonRecord) {
  const agent = context.agent || {};
  const domain = platformEmailDomain();
  if (!domain) return null;

  const baseLocal = agentEmailLocalPartFromName(agent.display_name);
  const tenantSlug = String(context.tenant?.slug || context.tenant?.name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 32);
  const shortId = String(agent.id || crypto.randomUUID()).split('-')[0];
  const localCandidates = [
    baseLocal,
    tenantSlug ? `${baseLocal}.${tenantSlug}`.slice(0, 64) : '',
    `${baseLocal}.${shortId}`.slice(0, 64),
  ].filter(Boolean);

  for (const localPart of localCandidates) {
    const emailAddress = `${localPart}@${domain}`;
    if (!(await agentEmailExists(db, agent, emailAddress))) {
      return { emailAddress, emailLocalPart: localPart, emailDomain: domain };
    }
  }

  const emailLocalPart = `${baseLocal}.${crypto.randomUUID().slice(0, 8)}`.slice(0, 64);
  return { emailAddress: `${emailLocalPart}@${domain}`, emailLocalPart, emailDomain: domain };
}

function buildAgentPrompt(context: JsonRecord) {
  const tenantName = context.tenant?.name || 'the company';
  const agentName = context.agent?.display_name || 'the AI assistant';
  const bookingProvider = context.bookingIntegration?.provider || 'manual';
  const bookingUrl = context.bookingIntegration?.booking_url || 'not configured';
  const senderEmail = context.agent?.email_address || context.emailIdentity?.from_email || 'not configured';
  const phoneNumber = context.phoneNumber?.phone_number || 'not configured';
  const toolWebhookUrl = elevenLabsToolWebhookUrl();
  const personality = context.agent?.metadata?.personality || {};
  const voiceProfile = context.agent?.metadata?.voiceProfile || {};
  const personalityLabel = personality.label || 'professional and warm';
  const personalityInstruction = personality.prompt || 'Sound professional, warm, concise, helpful, and trustworthy.';
  const customPersonalityNotes = context.agent?.metadata?.customPersonalityNotes || '';

  return [
    `You are ${agentName}, an AI outreach and booking assistant for ${tenantName}.`,
    `Personality: ${personalityLabel}. ${personalityInstruction}`,
    customPersonalityNotes ? `Additional personality notes: ${customPersonalityNotes}.` : '',
    voiceProfile.label ? `Selected voice style: ${voiceProfile.label}.` : '',
    'Use expressive speech naturally. Match your tone to the lead: calm and reassuring when they sound worried, warm when they are positive, and clear and measured when explaining details. Keep delivery professional and never overact.',
    'You qualify leads, answer questions from the tenant knowledge base, and help book consultations.',
    'Start outbound calls with a clear introduction: say your name, the company name, and the specific reason for the call using the lead/service context. Default to English. Do not ask the lead to choose a language. If preferred_language is already set in lead data, use that language from the start. Do not open with "is now a good time" or similar permission-only language.',
    'If the lead asks to switch language mid-call, never end the call and never restart the introduction. Respond within one short sentence in the requested language, then continue all subsequent responses in that language from the current point in the conversation. Save preferredLanguage with update_lead_status after the spoken acknowledgement, but do not let the save delay the language switch. Do not save English as a default unless the lead explicitly asks for English.',
    'Never end the call because of background noise, cross-talk, multiple interruptions, silence, or a language change. Treat interruptions as normal conversation. If the lead is silent, patiently prompt again instead of ending.',
    'If the lead sounds busy after the introduction, offer a quick SMS follow-up or a better time. Do not pressure them.',
    'Early in the conversation, use get_lead_context when you need lead, company, campaign, or setup context. Use tenant knowledge before answering company-specific service, policy, pricing, or process questions.',
    'The core purpose of the call is booking. Treat service_interest, imported coverage_type_needed, imported service/interest, lead_form_summary, qualification notes, and location as enough reason/context to proceed. Do not ask why the lead is interested when those fields exist. Only ask a service-interest clarifier when all lead/form interest fields are missing.',
    'Some leads already filled out a form or import fields before the call. When lead context, custom_fields.importedLeadData, qualification notes, or qualification answers already contain useful answers, do not ask those questions again. Use a booking-first flow: introduce yourself, give one short summary of what the lead already provided, then ask "Can we book a quick consultation now?"',
    'Adapt to preferred_contact_channel. If the lead prefers call or phone, prioritize booking directly on the call. If the lead prefers email, keep the call brief, acknowledge their preference, offer to send details or a booking link by email when email consent/address exist, and only continue booking by phone if the lead is comfortable doing it now. If the lead changes their preference during the conversation, save it with update_lead_status and follow the new preference immediately.',
    'Before booking, qualify the lead with a short dynamic question set based on their service interest and tenant knowledge only when the lead has not already provided useful form/import context. Ask only relevant questions, one at a time, normally 3 to 7 questions for non-prefilled leads. For insurance-like services, examples include marital/common-law status, children, home ownership, what they want to protect, free review interest, age range, and current insurance status. For other services, infer comparable qualification questions from the service and knowledge base.',
    'For pre-qualified or form-qualified leads, do not run the normal qualification flow. Summarize what is already known in one short sentence, then ask "Can we book a quick consultation now?" If they say yes, okay, sure, sounds good, or otherwise agrees but does not give a time, do not go silent and do not call a tool yet. Immediately ask one short scheduling question: "Great — what day and time works best for you?" or offer the date in two days using suggested_booking_date, then ask what time works.',
    'After collecting or confirming qualification answers, call update_lead_status with qualificationQuestions, qualificationAnswers, qualificationSummary, qualificationStatus, qualificationScore when useful, and leadStage or schedulingState. Do not book until the lead has answered enough necessary questions, refuses, clearly asks to skip qualification, or the existing form/lead context already provides enough information to proceed.',
    'During an active call, treat every booking date the lead mentions as a near-future date by default, not next year. Use current_date, current_time, and current_timezone to resolve relative dates like today, tomorrow, Monday, next week, or later today to the next near-future occurrence. If the lead gives a weekday or day number without a clear month, ask one short confirmation question for the exact month, day, year, and time before calling create_booking. Never use old example dates, training-data dates, or a far-future year to fill missing date parts.',
    'After the introduction for a form-filled lead, move immediately to confirming a booking. If the lead says yes, ask one scheduling question only: when they are available, or whether suggested_booking_date works and what time. If the lead gives both date and time, call create_booking immediately. Sending a booking link by SMS/email is only a fallback when the lead explicitly asks to choose a time later, asks for the link, refuses to pick a time on the call, or cannot decide.',
    'After a booking is created, SMS and email confirmation are handled by the booking tool when consent and provider configuration exist. If a confirmation channel fails, tell the lead which channel failed and provide the link verbally.',
    'Do not read, pronounce, or spell long URLs by default. Say that the meeting link will be sent by SMS/email. If the lead explicitly asks you to read a link aloud, read it slowly in short chunks.',
    'If the lead asks for a text, follow-up, booking link, or recap, use send_sms only when SMS consent is present. If the lead asks for email, use send_email only when email consent and an email address are present. Respect STOP/opt-out immediately.',
    'Stay concise, warm, truthful, and operational. If tenant knowledge is missing, say you will have the team follow up instead of inventing facts.',
    'Respect channel consent, opt-outs, and tenant boundaries. Never contact a lead outside the allowed channels.',
    `Tenant phone number: ${phoneNumber}.`,
    `Tenant sender email: ${senderEmail}.`,
    `Booking provider: ${bookingProvider}. Booking URL or event reference: ${bookingUrl}.`,
    `Tool webhook URL: ${toolWebhookUrl || 'not configured'}.`,
    'Runtime dynamic variables may include tenant_id, tenant_name, tenant_agent_id, agent_name, lead_id, lead_name, service_interest, preferred_language, preferred_contact_channel, qualification_mode, lead_form_summary, suggested_booking_date, booking_provider, booking_url, tenant_phone_number, sender_email, tool_webhook_url, current_date, current_time, and current_timezone.',
    'Use the configured webhook tools for get_lead_context, update_lead_status, check_availability, create_booking, send_sms, send_whatsapp, send_email, record_call_outcome, escalate_to_human, and mark_opt_out.',
  ].filter(Boolean).join('\n\n');
}

function knowledgeRefs(documents: JsonRecord[]) {
  return documents
    .filter((document) => document.elevenlabs_document_id && document.status === 'ready')
    .map((document) => ({
      id: document.elevenlabs_document_id,
      name: document.title,
      type: document.source_type,
    }));
}

function buildConversationConfig(context: JsonRecord, documents: JsonRecord[], toolIds: string[] = []) {
  const agentName = context.agent?.display_name || 'the assistant';
  const tenantName = context.tenant?.name || 'the company';
  const voiceId = context.agent?.voice_id || DEFAULT_VOICE_ID;

  return {
    agent: {
      first_message: `Hi, this is ${agentName} from ${tenantName}. I’m calling about your recent request and wanted to help book the next step. Can we book a quick consultation now?`,
      prompt: {
        prompt: buildAgentPrompt(context),
        knowledge_base: knowledgeRefs(documents),
        tool_ids: toolIds,
      },
    },
    tts: {
      voice_id: voiceId,
      model_id: ELEVENLABS_EXPRESSIVE_TTS_MODEL_ID,
    },
  };
}

function dynamicVariableDefaults(context: JsonRecord) {
  return {
    tenant_id: context.tenant?.id || context.agent?.tenant_id || '',
    tenant_name: context.tenant?.name || '',
    tenant_agent_id: context.agent?.id || '',
    agent_name: context.agent?.display_name || '',
    lead_id: 'test-lead-id',
    lead_name: 'Test Lead',
    service_interest: 'consultation',
    preferred_language: 'English',
    preferred_contact_channel: 'call',
    qualification_mode: 'ask_only_missing_then_book',
    lead_form_summary: '',
    suggested_booking_date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    booking_provider: context.bookingIntegration?.provider || 'manual',
    booking_url: context.bookingIntegration?.booking_url || '',
    tenant_phone_number: context.phoneNumber?.phone_number || '',
    sender_email: context.agent?.email_address || context.emailIdentity?.from_email || '',
    tool_webhook_url: elevenLabsToolWebhookUrl(),
    current_date: new Date().toISOString().slice(0, 10),
    current_time: new Date().toISOString(),
    current_timezone: context.tenant?.default_timezone || 'UTC',
  };
}

function elevenLabsToolWebhookUrl() {
  const baseUrl = Deno.env.get('INSFORGE_FUNCTION_BASE_URL');
  return baseUrl ? `${baseUrl.replace(/\/$/, '')}/elevenlabs-tool-webhooks` : '';
}

function elevenLabsToolSecret() {
  const secret = Deno.env.get('ELEVENLABS_TOOL_SECRET');
  if (!secret) throw new Error('ELEVENLABS_TOOL_SECRET is not configured in InsForge secrets');
  return secret;
}

function literal(type: 'string' | 'boolean' | 'integer' | 'number', description: string, extra: JsonRecord = {}) {
  return { type, description, ...extra };
}

function dynamic(type: 'string' | 'boolean' | 'integer' | 'number', variable: string) {
  return { type, dynamic_variable: variable };
}

function toolBodySchema(properties: JsonRecord, required: string[] = []) {
  const baseProperties = {
    tenantId: dynamic('string', 'tenant_id'),
    leadId: dynamic('string', 'lead_id'),
    agentId: dynamic('string', 'tenant_agent_id'),
  };
  return {
    type: 'object',
    required: ['tenantId', 'leadId', 'agentId', ...required],
    properties: {
      ...baseProperties,
      ...properties,
    },
  };
}

function webhookToolConfig(name: string, description: string, properties: JsonRecord = {}, required: string[] = [], responseTimeoutSecs = 20) {
  const webhookUrl = elevenLabsToolWebhookUrl();
  if (!webhookUrl) throw new Error('INSFORGE_FUNCTION_BASE_URL is not configured in InsForge secrets');

  return {
    tool_config: {
      type: 'webhook',
      name,
      description,
      response_timeout_secs: responseTimeoutSecs,
      api_schema: {
        url: `${webhookUrl}?action=${encodeURIComponent(name)}`,
        method: 'POST',
        content_type: 'application/json',
        request_headers: {
          'x-elevenlabs-tool-secret': elevenLabsToolSecret(),
        },
        request_body_schema: toolBodySchema(properties, required),
      },
    },
  };
}

function elevenLabsToolDefinitions() {
  return [
    webhookToolConfig(
      'get_lead_context',
      'Load the current lead, tenant, campaign, consent, booking, and readiness context before answering company-specific questions or taking actions.'
    ),
    webhookToolConfig(
      'check_availability',
      'Check the tenant booking path. Use before booking. For Calendly or booking-link tenants, this returns the booking link Bob can offer or text to the lead.',
      {
        requestedTime: literal('string', 'Optional ISO date/time the lead requested. Resolve spoken call dates to the next future occurrence by default. Include timezone if the lead gave one.'),
        timezone: literal('string', 'Optional IANA timezone or spoken timezone for the requested time.'),
      },
      [],
      5
    ),
    webhookToolConfig(
      'create_booking',
      'Create a booking once the lead agrees to a time. If no time is agreed and a Calendly/booking link exists, use this to send the booking link by SMS when consent exists.',
      {
        startTime: literal('string', 'ISO start time agreed with the lead. Resolve spoken dates only after the month/day/time are clear. Do not guess a far-future year; ask for confirmation if month or year is uncertain. Omit only when sending the booking link instead.'),
        durationMinutes: literal('integer', 'Appointment duration in minutes. Default to 30 if unsure.'),
        timezone: literal('string', 'IANA timezone for the appointment, such as America/New_York.'),
        title: literal('string', 'Short meeting title based on the service interest.'),
        meetingType: literal('string', 'Meeting type, usually consultation.'),
        message: literal('string', 'Optional SMS text to send with the booking link if no time was agreed.'),
      }
    ),
    webhookToolConfig(
      'send_sms',
      'Send a concise SMS follow-up, recap, or booking link to the lead. Only use when the lead has SMS consent.',
      {
        message: literal('string', 'The SMS body to send to the lead. Keep it concise and include the booking link when relevant.'),
      },
      ['message']
    ),
    webhookToolConfig(
      'send_email',
      'Send a concise email follow-up, recap, or booking confirmation to the lead. Only use when the lead has email consent and an email address.',
      {
        emailType: literal('string', 'Email type, such as booking_confirmation, follow_up, recap, or booking_link.'),
        message: literal('string', 'The email intent or short message. OpenAI writes the final email copy server-side.'),
        startTime: literal('string', 'Optional booking start time when sending a booking confirmation.'),
        meetingUrl: literal('string', 'Optional meeting or booking link to include.'),
      }
    ),
    webhookToolConfig(
      'update_lead_status',
      'Fast state save for lead status, qualification, scheduling state, preferred language/channel, service interest, or notes after the lead gives new information. For language switches, speak in the requested language first, then use this tool. Do not save English as a default unless the lead explicitly asks for English.',
      {
        status: literal('string', 'Optional CRM status update.'),
        qualificationStatus: literal('string', 'Optional qualification status update.'),
        leadStage: literal('string', 'Optional lead stage update.'),
        schedulingState: literal('string', 'Optional scheduling state, such as interested, scheduled, or booking_link_sent.'),
        preferredLanguage: literal('string', 'The lead spoken language preference, such as English, Spanish, French, Yoruba, Igbo, Hausa, Arabic, or Portuguese. Save exactly what the lead asks for.'),
        preferredContactChannel: literal('string', 'Optional preferred contact channel the lead asks for, such as call, phone, email, sms, or whatsapp. Save it when the lead says they prefer a different follow-up channel.'),
        qualificationQuestions: literal('string', 'JSON or concise text list of the qualification questions asked in this conversation.'),
        qualificationAnswers: literal('string', 'JSON or concise text list of the lead answers to the qualification questions.'),
        qualificationSummary: literal('string', 'Short summary of the qualification result and why the lead is or is not ready to book.'),
        qualificationNotes: literal('string', 'Brief notes from the conversation.'),
        nextContactAt: literal('string', 'Optional ISO date/time for the next follow-up.'),
      },
      [],
      5
    ),
    webhookToolConfig(
      'record_call_outcome',
      'Record the final call outcome, summary, and transcript details at the end of the call.',
      {
        outcome: literal('string', 'Final call outcome, such as booked, interested, no_answer, not_interested, callback_requested, or completed.'),
        summary: literal('string', 'Short summary of what happened on the call.'),
        transcript: literal('string', 'Optional transcript or key call notes.'),
      },
      ['outcome']
    ),
  ];
}

async function listElevenLabsToolsByName(name: string) {
  const response = await elevenLabsRequest(`/convai/tools?search=${encodeURIComponent(name)}&page_size=100`, {
    method: 'GET',
  });
  const tools = response?.tools || response?.data || [];
  return tools.filter((tool: JsonRecord) => tool?.tool_config?.name === name || tool?.name === name);
}

function toolId(tool: JsonRecord) {
  return tool?.id || tool?.tool_id || tool?.toolConfig?.id || null;
}

async function ensureElevenLabsWebhookTool(definition: JsonRecord) {
  const name = definition.tool_config.name;
  const existing = (await listElevenLabsToolsByName(name))?.[0] || null;
  if (existing) {
    const id = toolId(existing);
    if (!id) throw new Error(`ElevenLabs tool ${name} did not include an ID`);
    await elevenLabsRequest(`/convai/tools/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(definition),
    });
    return id;
  }

  const created = await elevenLabsRequest('/convai/tools', {
    method: 'POST',
    body: JSON.stringify(definition),
  });
  const id = toolId(created);
  if (!id) throw new Error(`ElevenLabs did not return a tool ID for ${name}`);
  return id;
}

async function syncElevenLabsWebhookTools() {
  const ids: string[] = [];
  for (const definition of elevenLabsToolDefinitions()) {
    ids.push(await ensureElevenLabsWebhookTool(definition));
  }
  return ids;
}

function agentProviderTags(context: JsonRecord) {
  const agent = context.agent || {};
  const tenantId = context.tenant?.id || agent.tenant_id;
  return [
    'bob-automation',
    tenantId ? `tenant:${tenantId}` : null,
    agent.id ? `tenant-agent:${agent.id}` : null,
    agent.template_key || 'custom-agent',
  ].filter(Boolean);
}

function providerAgentId(agent: JsonRecord) {
  return agent?.agent_id || agent?.id || null;
}

async function findReusableElevenLabsAgent(name: string, tags: string[]) {
  const response = await elevenLabsRequest(`/convai/agents?search=${encodeURIComponent(name)}&page_size=100&archived=false`, {
    method: 'GET',
  });
  const agents = response?.agents || response?.data || [];
  const tenantAgentTag = tags.find((tag) => String(tag).startsWith('tenant-agent:'));
  const tenantTag = tags.find((tag) => String(tag).startsWith('tenant:'));

  return agents.find((agent: JsonRecord) => {
    const agentTags = Array.isArray(agent.tags) ? agent.tags : [];
    if (tenantAgentTag && agentTags.includes(tenantAgentTag)) return true;
    return tenantTag && agentTags.includes(tenantTag) && agent.name === name;
  }) || null;
}

function simplifyVoice(voice: JsonRecord) {
  const labels = voice.labels || {};
  return {
    voiceId: voice.voice_id,
    name: voice.name,
    category: voice.category || null,
    description: voice.description || labels.description || '',
    previewUrl: voice.preview_url || null,
    labels,
    gender: labels.gender || '',
    accent: labels.accent || '',
    age: labels.age || '',
    useCase: labels.use_case || '',
  };
}

async function listElevenLabsVoices() {
  const voices: JsonRecord[] = [];
  let nextPageToken = '';

  for (let page = 0; page < 10; page += 1) {
    const url = new URL('https://api.elevenlabs.io/v2/voices');
    url.searchParams.set('page_size', '100');
    url.searchParams.set('sort', 'name');
    url.searchParams.set('sort_direction', 'asc');
    url.searchParams.set('include_total_count', 'true');
    if (nextPageToken) url.searchParams.set('next_page_token', nextPageToken);

    const response = await elevenLabsRequest(url.toString(), { method: 'GET' });
    voices.push(...((response?.voices || []).map(simplifyVoice).filter((voice: JsonRecord) => voice.voiceId)));
    if (!response?.has_more || !response?.next_page_token) break;
    nextPageToken = response.next_page_token;
  }

  const unique = new Map<string, JsonRecord>();
  for (const voice of voices) unique.set(voice.voiceId, voice);
  return [...unique.values()].sort((left, right) => String(left.name || '').localeCompare(String(right.name || '')));
}

async function updateKnowledgeDocument(db: any, document: JsonRecord, patch: JsonRecord) {
  const table = document.__knowledge_table || 'tenant_knowledge_documents';
  let query = db.database
    .from(table)
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', document.id);
  if (table === 'tenant_knowledge_documents') {
    query = query.eq('tenant_id', document.tenant_id);
  }
  const { data } = await query.select();
  const updated = data?.[0] || null;
  return updated ? {
    ...updated,
    __knowledge_table: table,
    __storage_bucket: document.__storage_bucket || (table === 'platform_knowledge_documents' ? 'platform-knowledge' : 'tenant-knowledge'),
    __shared_source: document.__shared_source || null,
  } : null;
}

async function createKnowledgeDocumentInElevenLabs(db: any, document: JsonRecord) {
  await updateKnowledgeDocument(db, document, { status: 'processing', error_message: null });
  try {
    let providerDocument: JsonRecord;
    const name = safeName(document.title, 'Tenant knowledge document');

    if (document.source_type === 'text') {
      providerDocument = await elevenLabsRequest('/convai/knowledge-base/text', {
        method: 'POST',
        body: JSON.stringify({ name, text: document.body_text || '' }),
      });
    } else if (document.source_type === 'url') {
      providerDocument = await elevenLabsRequest('/convai/knowledge-base/url', {
        method: 'POST',
        body: JSON.stringify({ name, url: document.source_url, enable_auto_sync: false }),
      });
    } else if (document.source_type === 'file') {
      if (!document.storage_key) throw new Error('Stored file key is missing');
      const storageBucket = document.__storage_bucket || 'tenant-knowledge';
      const { data: blob, error } = await db.storage.from(storageBucket).download(document.storage_key);
      if (error) throw new Error(error.message || 'Failed to download stored knowledge file');
      const formData = new FormData();
      formData.append('file', blob, document.metadata?.originalFileName || document.storage_key.split('/').pop() || name);
      formData.append('name', name);
      providerDocument = await elevenLabsRequest('/convai/knowledge-base/file', {
        method: 'POST',
        body: formData,
      });
    } else {
      throw new Error('Unsupported knowledge source type');
    }

    const elevenlabsDocumentId = providerDocument?.id;
    if (!elevenlabsDocumentId) throw new Error('ElevenLabs did not return a knowledge document ID');
    return updateKnowledgeDocument(db, document, {
      elevenlabs_document_id: elevenlabsDocumentId,
      status: 'ready',
      error_message: null,
      metadata: {
        ...(document.metadata || {}),
        elevenlabsName: providerDocument?.name || name,
        elevenlabsSyncedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    await updateKnowledgeDocument(db, document, {
      status: 'failed',
      error_message: safeError(error, 'Knowledge document sync failed'),
    });
    throw error;
  }
}

async function syncKnowledgeDocuments(db: any, documents: JsonRecord[]) {
  const synced: JsonRecord[] = [];
  const failed: JsonRecord[] = [];

  for (const document of documents) {
    if (document.elevenlabs_document_id && document.status === 'ready') {
      synced.push(document);
      continue;
    }
    try {
      synced.push(await createKnowledgeDocumentInElevenLabs(db, document));
    } catch (error) {
      failed.push({ id: document.id, title: document.title, error: safeError(error, 'Knowledge sync failed') });
    }
  }

  return { documents: synced.filter(Boolean), failed };
}

async function updateTenantAgent(db: any, agent: JsonRecord, patch: JsonRecord) {
  const { data, error } = await db.database
    .from('tenant_agents')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', agent.id)
    .eq('tenant_id', agent.tenant_id)
    .select();
  if (error) throw new Error(error.message || 'Failed to update tenant agent');
  return data?.[0] || null;
}

async function createOrUpdateAgent(db: any, context: JsonRecord, documents: JsonRecord[]) {
  const agent = context.agent;
  const name = safeName(`${context.tenant?.name || 'Tenant'} - ${agent.display_name || 'AI Agent'}`, 'Tenant agent');
  const agentEmail = await resolveAgentEmailAddress(db, context);
  const toolIds = await syncElevenLabsWebhookTools();
  const tags = agentProviderTags(context);
  const payload = {
    name,
    tags,
    conversation_config: buildConversationConfig(context, documents, toolIds),
    platform_settings: {
      evaluation: {
        criteria: [],
      },
    },
  };
  const reusableAgent = agent.elevenlabs_agent_id ? null : await findReusableElevenLabsAgent(name, tags);
  const targetAgentId = agent.elevenlabs_agent_id || providerAgentId(reusableAgent);

  const providerResult = targetAgentId
    ? await elevenLabsRequest(`/convai/agents/${targetAgentId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        ...payload,
        version_description: `Bob Automation sync ${new Date().toISOString()}`,
      }),
    })
    : await elevenLabsRequest('/convai/agents/create', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

  const elevenlabsAgentId = providerResult?.agent_id || targetAgentId;
  if (!elevenlabsAgentId) throw new Error('ElevenLabs did not return an agent ID');

  const metadata = {
    ...(agent.metadata || {}),
    emailAddress: agentEmail?.emailAddress || agent.email_address || null,
    elevenlabs: {
      ...((agent.metadata || {}).elevenlabs || {}),
      lastProvisionedAt: new Date().toISOString(),
      lastProvisionStatus: 'synced',
      name,
      promptVersion: DEFAULT_PROMPT_VERSION,
      ttsModelId: ELEVENLABS_EXPRESSIVE_TTS_MODEL_ID,
      expressiveMode: true,
      dynamicVariableDefaults: dynamicVariableDefaults(context),
      knowledgeDocumentCount: knowledgeRefs(documents).length,
      toolIds,
    },
  };

  return updateTenantAgent(db, agent, {
    elevenlabs_agent_id: elevenlabsAgentId,
    ...(agentEmail ? {
      email_address: agentEmail.emailAddress,
      email_local_part: agentEmail.emailLocalPart,
      email_domain: agentEmail.emailDomain,
      email_configured_at: agent.email_configured_at || new Date().toISOString(),
    } : {}),
    prompt_version: DEFAULT_PROMPT_VERSION,
    metadata,
  });
}

async function markAgentProvisionFailure(db: any, agent: JsonRecord, error: any) {
  return updateTenantAgent(db, agent, {
    metadata: {
      ...(agent.metadata || {}),
      elevenlabs: {
        ...((agent.metadata || {}).elevenlabs || {}),
        lastProvisionedAt: new Date().toISOString(),
        lastProvisionStatus: 'failed',
        lastProvisionError: safeError(error),
      },
    },
  });
}

async function provisionAgent(db: any, tenantId: string, agentId: string, syncKnowledge = true) {
  const context = await loadTenantContext(db, tenantId, agentId);
  try {
    const knowledge = syncKnowledge
      ? await syncKnowledgeDocuments(db, context.knowledgeDocuments)
      : { documents: context.knowledgeDocuments, failed: [] };
    const updatedAgent = await createOrUpdateAgent(db, context, knowledge.documents);
    return {
      agent: updatedAgent,
      elevenlabsAgentId: updatedAgent?.elevenlabs_agent_id,
      syncedKnowledgeCount: knowledge.documents.length,
      failedKnowledge: knowledge.failed,
      dynamicVariableDefaults: dynamicVariableDefaults({ ...context, agent: updatedAgent || context.agent }),
    };
  } catch (error) {
    await markAgentProvisionFailure(db, context.agent, error);
    throw error;
  }
}

async function testAgentSetup(db: any, tenantId: string, agentId: string) {
  const context = await loadTenantContext(db, tenantId, agentId);
  const readyDocuments = knowledgeRefs(context.knowledgeDocuments);
  return {
    configured: Boolean(Deno.env.get('ELEVENLABS_API_KEY')),
    agent: {
      id: context.agent.id,
      displayName: context.agent.display_name,
      emailAddress: context.agent.email_address || null,
      status: context.agent.status,
      elevenlabsAgentId: context.agent.elevenlabs_agent_id || null,
      hasProviderAgent: Boolean(context.agent.elevenlabs_agent_id),
    },
    readiness: {
      hasTenant: Boolean(context.tenant?.id),
      hasAgentName: Boolean(context.agent.display_name),
      hasVoice: Boolean(context.agent.voice_id || DEFAULT_VOICE_ID),
      hasPhoneNumber: Boolean(context.phoneNumber?.phone_number),
      hasBookingPath: Boolean(context.bookingIntegration?.booking_url || context.bookingIntegration?.event_type_id),
      readyKnowledgeDocuments: readyDocuments.length,
      uploadedKnowledgeDocuments: context.knowledgeDocuments.length,
    },
    dynamicVariableDefaults: dynamicVariableDefaults(context),
  };
}

export default async function(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return optionsResponse();

  const db = createInsForgeClient(req);
  const adminDb = createInsForgeAdminClient();
  const url = new URL(req.url);
  const body = req.method === 'GET' ? {} : await req.json().catch(() => ({}));
  const action = url.searchParams.get('action') || body.action || 'status';

  try {
    if (action === 'status') {
      return jsonResponse({
        success: true,
        service: 'elevenlabs-agent-actions',
        configured: Boolean(Deno.env.get('ELEVENLABS_API_KEY')),
        actions: ['status', 'provision-agent', 'sync-knowledge', 'test-agent', 'list-voices'],
      });
    }

    const portalUser = await resolvePortalUser(db);

    if (action === 'list-voices') {
      return jsonResponse({
        success: true,
        voices: await listElevenLabsVoices(),
      });
    }

    const platformProfile = await resolvePlatformAdminProfile(db).catch(() => ({ isPlatformAdmin: false }));
    const tenantId = requireTenant(portalUser, body.tenantId || body.tenant_id, platformProfile);
    const agentId = body.agentId || body.agent_id;
    const workDb = adminDb || db;

    if (action === 'provision-agent') {
      return jsonResponse({
        success: true,
        ...(await provisionAgent(workDb, tenantId, agentId, body.syncKnowledge !== false)),
      });
    }

    if (action === 'sync-knowledge') {
      const context = await loadTenantContext(workDb, tenantId, agentId);
      return jsonResponse({
        success: true,
        ...(await syncKnowledgeDocuments(workDb, context.knowledgeDocuments)),
      });
    }

    if (action === 'test-agent') {
      return jsonResponse({
        success: true,
        setup: await testAgentSetup(workDb, tenantId, agentId),
      });
    }

    return jsonResponse({ success: false, error: 'Unsupported ElevenLabs agent action' }, 404);
  } catch (error) {
    const status = safeError(error).toLowerCase().includes('auth') ? 401 : 500;
    return jsonResponse({ success: false, error: safeError(error) }, status);
  }
}
