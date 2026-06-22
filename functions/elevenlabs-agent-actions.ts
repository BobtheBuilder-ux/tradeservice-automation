import { createClient } from 'npm:@insforge/sdk';

const ELEVENLABS_API_BASE = 'https://api.elevenlabs.io/v1';
const DEFAULT_PROMPT_VERSION = 'v2-campaign-booking';
const DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM';

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

function requireTenant(portalUser: JsonRecord, requestedTenantId?: string) {
  if (requestedTenantId && requestedTenantId !== portalUser.tenantId) {
    throw new Error('Requested tenant does not match signed-in tenant');
  }
  return portalUser.tenantId;
}

async function loadTenantContext(db: any, tenantId: string, agentId: string) {
  if (!agentId) throw new Error('agentId is required');

  const [tenantRows, agentRows, phoneRows, emailRows, bookingRows, knowledgeRows] = await Promise.all([
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

  return {
    tenant: tenantRows?.[0] || null,
    agent,
    phoneNumber: phoneRows?.find((row: JsonRecord) => row.is_primary) || phoneRows?.[0] || null,
    emailIdentity: emailRows?.[0] || null,
    bookingIntegration: bookingRows?.[0] || null,
    knowledgeDocuments: knowledgeRows || [],
  };
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

function buildAgentPrompt(context: JsonRecord) {
  const tenantName = context.tenant?.name || 'the company';
  const agentName = context.agent?.display_name || 'the AI assistant';
  const bookingProvider = context.bookingIntegration?.provider || 'manual';
  const bookingUrl = context.bookingIntegration?.booking_url || 'not configured';
  const senderEmail = context.emailIdentity?.from_email || 'not configured';
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
    'You qualify leads, answer questions from the tenant knowledge base, and help book consultations.',
    'Start outbound calls with a clear introduction: say your name, the company name, and the specific reason for the call using the lead/service context. In that same introduction, ask what language the lead would prefer to communicate in. Do not open with "is now a good time" or similar permission-only language.',
    'When the lead gives a preferred language in the introduction, switch immediately in your next spoken response. Do not wait for a tool result before speaking. Then call update_lead_status with preferredLanguage set to the spoken language as a fast background-style state save. Do not repeat the introduction or ask the language question again after the language is selected. If the lead already has preferred_language, greet them and continue in that language without asking again unless they ask to change it.',
    'If the lead asks to switch language mid-call, never end the call and never restart the introduction. Respond within one short sentence in the requested language, then continue all subsequent responses in that language from the current point in the conversation. Save preferredLanguage with update_lead_status after the spoken acknowledgement, but do not let the save delay the language switch.',
    'Never end the call because of background noise, cross-talk, multiple interruptions, silence, or a language change. Treat interruptions as normal conversation. If the lead is silent, patiently prompt again instead of ending.',
    'If the lead sounds busy after the introduction, offer a quick SMS follow-up or a better time. Do not pressure them.',
    'Early in the conversation, use get_lead_context when you need lead, company, campaign, or setup context. Use tenant knowledge before answering company-specific service, policy, pricing, or process questions.',
    'The core purpose of the call is to understand what service the lead is interested in and move that interest toward qualification and booking. If service_interest is missing, generic, unclear, or the lead has not clearly expressed interest yet, do not abandon the workflow and do not mark them not_interested. Ask one concise clarifying question such as which service they wanted help with, what prompted the request, or what outcome they want. If tenant knowledge lists services, offer 2 to 4 likely service options. Once the interest is clear, save it with update_lead_status and continue qualification.',
    'Before booking, qualify the lead with a short dynamic question set based on their service interest and tenant knowledge. Ask only relevant questions, one at a time, normally 3 to 7 questions. For insurance-like services, examples include marital/common-law status, children, home ownership, what they want to protect, free review interest, age range, and current insurance status. For other services, infer comparable qualification questions from the service and knowledge base.',
    'After collecting qualification answers, call update_lead_status with qualificationQuestions, qualificationAnswers, qualificationSummary, qualificationStatus, qualificationScore when useful, and leadStage or schedulingState. Do not book until the lead has answered enough qualification questions, refuses, or clearly asks to skip qualification.',
    'During an active call, treat every booking date the lead mentions as a future date by default. Use current_date, current_time, and current_timezone to resolve relative dates like today, tomorrow, Monday, next week, or later today to the next future occurrence. For month/day or weekday mentions without a year, choose the next future occurrence, never a past year. Never use old example dates or training-data dates. If the date/time is genuinely ambiguous, ask one short confirmation question before booking.',
    'When the lead is interested or asks for next steps, your first attempt must be to book the appointment directly on the phone by asking for a preferred date/time and calling create_booking. Sending a booking link by SMS/email is only a fallback when the lead explicitly asks to choose a time later, asks for the link, refuses to pick a time on the call, or cannot decide.',
    'After a booking is created, SMS and email confirmation are handled by the booking tool when consent and provider configuration exist. If a confirmation channel fails, tell the lead which channel failed and provide the link verbally.',
    'Do not read, pronounce, or spell long URLs by default. Say that the meeting link will be sent by SMS/email. If the lead explicitly asks you to read a link aloud, read it slowly in short chunks.',
    'If the lead asks for a text, follow-up, booking link, or recap, use send_sms only when SMS consent is present. If the lead asks for email, use send_email only when email consent and an email address are present. Respect STOP/opt-out immediately.',
    'Stay concise, warm, truthful, and operational. If tenant knowledge is missing, say you will have the team follow up instead of inventing facts.',
    'Respect channel consent, opt-outs, and tenant boundaries. Never contact a lead outside the allowed channels.',
    `Tenant phone number: ${phoneNumber}.`,
    `Tenant sender email: ${senderEmail}.`,
    `Booking provider: ${bookingProvider}. Booking URL or event reference: ${bookingUrl}.`,
    `Tool webhook URL: ${toolWebhookUrl || 'not configured'}.`,
    'Runtime dynamic variables may include tenant_id, tenant_name, tenant_agent_id, agent_name, lead_id, lead_name, service_interest, preferred_language, booking_provider, booking_url, tenant_phone_number, sender_email, tool_webhook_url, current_date, current_time, and current_timezone.',
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
      first_message: `Hi, this is ${agentName} from ${tenantName}. I’m calling about your recent request and wanted to help with the next step. Before we continue, what language would you prefer we speak in?`,
      prompt: {
        prompt: buildAgentPrompt(context),
        knowledge_base: knowledgeRefs(documents),
        tool_ids: toolIds,
      },
    },
    tts: {
      voice_id: voiceId,
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
    preferred_language: '',
    booking_provider: context.bookingIntegration?.provider || 'manual',
    booking_url: context.bookingIntegration?.booking_url || '',
    tenant_phone_number: context.phoneNumber?.phone_number || '',
    sender_email: context.emailIdentity?.from_email || '',
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
      2
    ),
    webhookToolConfig(
      'create_booking',
      'Create a booking once the lead agrees to a time. If no time is agreed and a Calendly/booking link exists, use this to send the booking link by SMS when consent exists.',
      {
        startTime: literal('string', 'ISO start time agreed with the lead. Resolve all spoken call dates to the next future occurrence by default. Omit only when sending the booking link instead.'),
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
      'Fast state save for lead status, qualification, scheduling state, preferred language/channel, service interest, or notes after the lead gives new information. For language switches, speak in the requested language first, then use this tool.',
      {
        status: literal('string', 'Optional CRM status update.'),
        qualificationStatus: literal('string', 'Optional qualification status update.'),
        leadStage: literal('string', 'Optional lead stage update.'),
        schedulingState: literal('string', 'Optional scheduling state, such as interested, scheduled, or booking_link_sent.'),
        preferredLanguage: literal('string', 'The lead spoken language preference, such as English, Spanish, French, Yoruba, Igbo, Hausa, Arabic, or Portuguese. Save exactly what the lead asks for.'),
        qualificationQuestions: literal('string', 'JSON or concise text list of the qualification questions asked in this conversation.'),
        qualificationAnswers: literal('string', 'JSON or concise text list of the lead answers to the qualification questions.'),
        qualificationSummary: literal('string', 'Short summary of the qualification result and why the lead is or is not ready to book.'),
        qualificationNotes: literal('string', 'Brief notes from the conversation.'),
        nextContactAt: literal('string', 'Optional ISO date/time for the next follow-up.'),
      },
      [],
      2
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
  const response = await elevenLabsRequest('https://api.elevenlabs.io/v2/voices?page_size=100', {
    method: 'GET',
  });
  return (response?.voices || []).map(simplifyVoice).filter((voice: JsonRecord) => voice.voiceId);
}

async function updateKnowledgeDocument(db: any, document: JsonRecord, patch: JsonRecord) {
  const { data } = await db.database
    .from('tenant_knowledge_documents')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', document.id)
    .eq('tenant_id', document.tenant_id)
    .select();
  return data?.[0] || null;
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
      const { data: blob, error } = await db.storage.from('tenant-knowledge').download(document.storage_key);
      if (error) throw new Error(error.message || 'Failed to download stored knowledge file');
      const formData = new FormData();
      formData.append('file', blob, document.storage_key.split('/').pop() || name);
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
    elevenlabs: {
      ...((agent.metadata || {}).elevenlabs || {}),
      lastProvisionedAt: new Date().toISOString(),
      lastProvisionStatus: 'synced',
      name,
      promptVersion: agent.prompt_version || DEFAULT_PROMPT_VERSION,
      dynamicVariableDefaults: dynamicVariableDefaults(context),
      knowledgeDocumentCount: knowledgeRefs(documents).length,
      toolIds,
    },
  };

  return updateTenantAgent(db, agent, {
    elevenlabs_agent_id: elevenlabsAgentId,
    prompt_version: agent.prompt_version || DEFAULT_PROMPT_VERSION,
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
    const tenantId = requireTenant(portalUser, body.tenantId || body.tenant_id);
    const agentId = body.agentId || body.agent_id;

    if (action === 'provision-agent') {
      return jsonResponse({
        success: true,
        ...(await provisionAgent(db, tenantId, agentId, body.syncKnowledge !== false)),
      });
    }

    if (action === 'sync-knowledge') {
      const context = await loadTenantContext(db, tenantId, agentId);
      return jsonResponse({
        success: true,
        ...(await syncKnowledgeDocuments(db, context.knowledgeDocuments)),
      });
    }

    if (action === 'test-agent') {
      return jsonResponse({
        success: true,
        setup: await testAgentSetup(db, tenantId, agentId),
      });
    }

    if (action === 'list-voices') {
      return jsonResponse({
        success: true,
        voices: await listElevenLabsVoices(),
      });
    }

    return jsonResponse({ success: false, error: 'Unsupported ElevenLabs agent action' }, 404);
  } catch (error) {
    const status = safeError(error).toLowerCase().includes('auth') ? 401 : 500;
    return jsonResponse({ success: false, error: safeError(error) }, status);
  }
}
