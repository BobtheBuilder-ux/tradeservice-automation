import { createClient } from 'npm:@insforge/sdk';

type JsonRecord = Record<string, any>;

const CHANNELS = ['sms', 'whatsapp', 'messenger', 'email', 'lead_form', 'system'];
const INTENTS = [
  'general_question',
  'booking_request',
  'callback_request',
  'channel_switch',
  'not_interested_now',
  'not_interested_final',
  'opt_out',
  'wrong_number',
  'pricing_question',
  'service_question',
  'human_review',
  'other',
];
const LIFECYCLE_OUTCOMES = [
  'answered',
  'callback_requested',
  'channel_switch_requested',
  'not_interested_now',
  'not_interested_final',
  'wrong_number',
  'opted_out',
  'booked',
  'needs_human_review',
];

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Message-Actions-Secret,X-Email-Actions-Secret,X-ElevenLabs-Tool-Secret',
};

function createInsForgeClient() {
  return createClient({ baseUrl: Deno.env.get('INSFORGE_BASE_URL'), anonKey: Deno.env.get('ANON_KEY') });
}

function jsonResponse(data: unknown, status = 200) {
  return Response.json(data, { status, headers: corsHeaders });
}

function firstValue(...values: unknown[]) {
  return values.find((value) => value !== undefined && value !== null && value !== '');
}

function bearerToken(value: string | null) {
  if (!value) return '';
  return value.toLowerCase().startsWith('bearer ') ? value.slice(7).trim() : value.trim();
}

function actionSecret() {
  return Deno.env.get('MESSAGE_ACTIONS_SECRET')
    || Deno.env.get('EMAIL_ACTIONS_SECRET')
    || Deno.env.get('ELEVENLABS_TOOL_SECRET')
    || '';
}

function assertAuthorized(req: Request) {
  const expected = actionSecret();
  if (!expected) throw new Error('Messaging brain authorization is not configured');
  const provided = req.headers.get('x-message-actions-secret')
    || req.headers.get('x-email-actions-secret')
    || req.headers.get('x-elevenlabs-tool-secret')
    || bearerToken(req.headers.get('authorization'));
  if (provided !== expected) throw new Error('Unauthorized messaging brain action');
}

function requiredTenantId(input: any) {
  const tenantId = firstValue(input?.tenantId, input?.tenant_id);
  if (!tenantId) throw new Error('tenantId is required');
  return String(tenantId);
}

function compactText(value: unknown, maxLength = 1200) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

function safeError(error: unknown) {
  return error instanceof Error ? error.message : 'Messaging brain failed';
}

function extractOutputText(response: any) {
  if (response?.output_text) return response.output_text;
  return (response?.output || []).flatMap((item: any) => item?.content || [])
    .filter((content: any) => content?.type === 'output_text')
    .map((content: any) => content.text)
    .join('');
}

function leadName(lead: any) {
  return lead?.full_name || [lead?.first_name, lead?.last_name].filter(Boolean).join(' ') || lead?.name || null;
}

function normalizeChannel(value: unknown) {
  const channel = String(value || '').toLowerCase();
  return CHANNELS.includes(channel) ? channel : 'system';
}

function normalizePreferredChannel(value: unknown) {
  const channel = String(value || '').toLowerCase();
  if (['call', 'voice', 'phone', 'sms', 'whatsapp', 'email', 'messenger'].includes(channel)) return channel;
  return null;
}

function knowledgeExcerpt(row: JsonRecord, scope: string) {
  const body = compactText(row.body_text || row.metadata?.extractedText || row.metadata?.extracted_text || '', 1100);
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
      if (excerpts.length >= 10) break;
    }
  };

  try {
    const { data } = await db.database
      .from('tenant_knowledge_documents')
      .select('title,body_text,source_type,source_url,storage_key,status,tenant_agent_id,metadata,updated_at')
      .eq('tenant_id', tenant.id)
      .in('status', ['ready', 'uploaded'])
      .order('updated_at', { ascending: false })
      .limit(20);
    addRows((data || []).filter((row: any) => !row.tenant_agent_id || row.tenant_agent_id === agent?.id), 'tenant');
  } catch {
    // Knowledge context enriches replies but must not block webhook response.
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
      .limit(70);
    addRows((platformResult.data || []).filter((row: any) => (
      row.scope === 'global'
      || (tenant.business_niche && row.scope === 'niche' && row.niche_key === tenant.business_niche)
      || assignedIds.includes(row.id)
    )), 'platform');
  } catch {
    // Shared context is optional.
  }

  return excerpts.slice(0, 10);
}

async function loadRecentMessages(db: any, tenantId: string, leadId?: string | null, channel?: string | null) {
  if (!leadId) return [];
  let query = db.database
    .from('lead_conversation_messages')
    .select('direction,channel,subject,body_text,status,created_at')
    .eq('tenant_id', tenantId)
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .limit(12);
  if (channel && channel !== 'system' && channel !== 'lead_form') query = query.eq('channel', channel);
  const { data } = await query;
  return (data || []).reverse().map((message: any) => ({
    direction: message.direction,
    channel: message.channel,
    subject: message.subject || null,
    body: compactText(message.body_text, 800),
    status: message.status || null,
  }));
}

async function loadLatestLifecycle(db: any, tenantId: string, leadId?: string | null) {
  if (!leadId) return null;
  const { data } = await db.database
    .from('lead_lifecycle_events')
    .select('source_channel,outcome,next_action_type,next_action_channel,next_action_at,reason,blocked_reason,created_at')
    .eq('tenant_id', tenantId)
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .limit(1);
  return data?.[0] || null;
}

async function loadContext(db: any, tenantId: string, input: any) {
  const leadId = firstValue(input.leadId, input.lead_id);
  const requestedAgentId = firstValue(input.tenantAgentId, input.tenant_agent_id, input.agentId, input.agent_id);
  const [tenantResult, leadResult, requestedAgentResult] = await Promise.all([
    db.database.from('tenants').select('*').eq('id', tenantId).limit(1),
    leadId ? db.database.from('leads').select('*').eq('tenant_id', tenantId).eq('id', leadId).limit(1) : Promise.resolve({ data: [] }),
    requestedAgentId ? db.database.from('tenant_agents').select('*').eq('tenant_id', tenantId).eq('id', requestedAgentId).limit(1) : Promise.resolve({ data: [] }),
  ]);
  if (tenantResult.error) throw new Error(tenantResult.error.message || 'Failed to load tenant');
  if (leadResult.error) throw new Error(leadResult.error.message || 'Failed to load lead');
  if (requestedAgentResult.error) throw new Error(requestedAgentResult.error.message || 'Failed to load tenant agent');
  const tenant = tenantResult.data?.[0] || null;
  const lead = leadResult.data?.[0] || null;
  const assignedAgent = !requestedAgentResult.data?.[0] && lead?.assigned_tenant_agent_id
    ? await db.database.from('tenant_agents').select('*').eq('tenant_id', tenantId).eq('id', lead.assigned_tenant_agent_id).limit(1)
    : { data: [] };
  const fallbackAgent = !requestedAgentResult.data?.[0] && !assignedAgent.data?.[0]
    ? await db.database.from('tenant_agents').select('*').eq('tenant_id', tenantId).in('status', ['live', 'testing', 'active']).order('created_at', { ascending: true }).limit(1)
    : { data: [] };
  const agent = requestedAgentResult.data?.[0] || assignedAgent.data?.[0] || fallbackAgent.data?.[0] || null;
  const channel = normalizeChannel(firstValue(input.channel, input.sourceChannel, input.source_channel, 'system'));
  const [knowledgeContext, recentMessages, latestLifecycle] = await Promise.all([
    loadKnowledgeContext(db, tenant, agent),
    loadRecentMessages(db, tenantId, lead?.id || null, channel),
    loadLatestLifecycle(db, tenantId, lead?.id || null),
  ]);
  return { tenant, lead, agent, channel, knowledgeContext, recentMessages, latestLifecycle };
}

function outputSchema(channel: string) {
  return {
    type: 'object',
    additionalProperties: false,
    required: [
      'replyText',
      'replySubject',
      'replyHtml',
      'detectedIntent',
      'preferredChannel',
      'callbackRequested',
      'requestedCallbackAt',
      'bookingIntent',
      'optOutIntent',
      'needsHumanReview',
      'humanReviewReason',
      'confidence',
      'lifecycleRecommendation',
      'allowedActionHints',
      'reason',
    ],
    properties: {
      replyText: { type: 'string' },
      replySubject: { type: ['string', 'null'] },
      replyHtml: { type: ['string', 'null'] },
      detectedIntent: { type: 'string', enum: INTENTS },
      preferredChannel: { type: ['string', 'null'], enum: ['call', 'voice', 'phone', 'sms', 'whatsapp', 'email', 'messenger', null] },
      callbackRequested: { type: 'boolean' },
      requestedCallbackAt: { type: ['string', 'null'] },
      bookingIntent: { type: 'boolean' },
      optOutIntent: { type: 'boolean' },
      needsHumanReview: { type: 'boolean' },
      humanReviewReason: { type: ['string', 'null'] },
      confidence: { type: 'number' },
      lifecycleRecommendation: {
        type: 'object',
        additionalProperties: false,
        required: ['outcome', 'nextActionType', 'nextActionChannel', 'nextActionAt', 'reason'],
        properties: {
          outcome: { type: ['string', 'null'], enum: [...LIFECYCLE_OUTCOMES, null] },
          nextActionType: { type: ['string', 'null'] },
          nextActionChannel: { type: ['string', 'null'], enum: ['call', 'voice', 'phone', 'sms', 'whatsapp', 'email', 'messenger', 'human', 'system', null] },
          nextActionAt: { type: ['string', 'null'] },
          reason: { type: ['string', 'null'] },
        },
      },
      allowedActionHints: {
        type: 'array',
        items: { type: 'string', enum: ['send_reply', 'book_meeting', 'schedule_callback', 'evaluate_lifecycle', 'mark_opt_out', 'escalate_to_human', 'no_action'] },
      },
      reason: { type: 'string' },
    },
    description: `Structured messaging-brain response for ${channel}.`,
  };
}

function buildInstructions(channel: string, preferredLanguage?: string | null) {
  const emailRules = channel === 'email'
    ? 'For email, provide replySubject and replyHtml using only simple safe tags: p, strong, em, ul, li, a, br.'
    : 'For SMS, WhatsApp, Messenger, and lead forms, keep replyText concise and set replySubject and replyHtml to null.';
  return [
    'You are the OpenAI messaging brain for a multi-tenant service-business outreach platform.',
    'Return only the requested JSON schema.',
    'You draft replies and classify intent; you do not actually send messages, book meetings, mark opt-outs, or schedule actions.',
    'InsForge runtime will enforce tenant isolation, consent, opt-out, do-not-contact, business hours, channel setup, and stop conditions after your response.',
    'Use knowledgeContext only as source-of-truth for services, policies, objections, offers, qualification guidance, and booking rules.',
    'If a knowledge item is only a file or URL reference without an excerpt, do not claim details from unseen contents.',
    'Never invent prices, availability, booking links, meeting links, policies, discounts, legal promises, or account-specific details.',
    'If the lead asks to stop, unsubscribe, says wrong number, or clearly does not want contact, set optOutIntent or the closest stop intent and do not write a persuasive sales reply.',
    'If the lead asks for a different channel or callback time, classify it and set the preferred channel or callback fields, but do not assume consent.',
    'If exact information is missing, answer what is known and move toward a consultation or human review.',
    emailRules,
    preferredLanguage ? `Write user-facing reply fields in ${preferredLanguage}.` : '',
  ].filter(Boolean).join(' ');
}

function normalizedBrainOutput(raw: any, channel: string) {
  const recommendation = raw?.lifecycleRecommendation || {};
  const output = {
    replyText: String(raw?.replyText || '').trim().slice(0, channel === 'email' ? 12000 : 1500),
    replySubject: channel === 'email' ? (raw?.replySubject ? String(raw.replySubject).trim().slice(0, 240) : null) : null,
    replyHtml: channel === 'email' ? (raw?.replyHtml ? String(raw.replyHtml).trim().slice(0, 20000) : null) : null,
    detectedIntent: INTENTS.includes(raw?.detectedIntent) ? raw.detectedIntent : 'other',
    preferredChannel: normalizePreferredChannel(raw?.preferredChannel),
    callbackRequested: Boolean(raw?.callbackRequested),
    requestedCallbackAt: raw?.requestedCallbackAt ? String(raw.requestedCallbackAt) : null,
    bookingIntent: Boolean(raw?.bookingIntent),
    optOutIntent: Boolean(raw?.optOutIntent || raw?.detectedIntent === 'opt_out'),
    needsHumanReview: Boolean(raw?.needsHumanReview),
    humanReviewReason: raw?.humanReviewReason ? String(raw.humanReviewReason).slice(0, 500) : null,
    confidence: Number.isFinite(Number(raw?.confidence)) ? Math.max(0, Math.min(1, Number(raw.confidence))) : 0,
    lifecycleRecommendation: {
      outcome: LIFECYCLE_OUTCOMES.includes(recommendation?.outcome) ? recommendation.outcome : null,
      nextActionType: recommendation?.nextActionType ? String(recommendation.nextActionType).slice(0, 100) : null,
      nextActionChannel: normalizePreferredChannel(recommendation?.nextActionChannel) || (recommendation?.nextActionChannel === 'human' ? 'human' : recommendation?.nextActionChannel === 'system' ? 'system' : null),
      nextActionAt: recommendation?.nextActionAt ? String(recommendation.nextActionAt) : null,
      reason: recommendation?.reason ? String(recommendation.reason).slice(0, 700) : null,
    },
    allowedActionHints: Array.isArray(raw?.allowedActionHints) ? raw.allowedActionHints.filter((item: any) => typeof item === 'string').slice(0, 8) : [],
    reason: String(raw?.reason || '').slice(0, 800),
  };
  if (!output.replyText && output.optOutIntent) output.replyText = 'Understood. We will stop contacting you.';
  if (!output.replyText && output.needsHumanReview) output.replyText = 'Thanks for your message. A team member will review this and follow up.';
  return output;
}

async function writeAudit(db: any, row: JsonRecord) {
  try {
    await db.database.from('openai_messaging_brain_audit_logs').insert([row]);
  } catch {
    // Audit failure should not block provider webhooks.
  }
}

function auditRequestPayload(context: any, input: any) {
  return {
    source: input.source || 'openai-messaging-brain',
    channel: context.channel,
    tenant: { id: context.tenant?.id || null, name: context.tenant?.name || null, businessNiche: context.tenant?.business_niche || null },
    agent: { id: context.agent?.id || null, name: context.agent?.display_name || null },
    lead: {
      id: context.lead?.id || null,
      serviceInterest: context.lead?.service_interest || null,
      preferredContactChannel: context.lead?.preferred_contact_channel || null,
      preferredLanguage: context.lead?.preferred_language || null,
      lifecycleStage: context.lead?.lead_stage || null,
      schedulingState: context.lead?.scheduling_state || null,
    },
    inboundText: compactText(firstValue(input.inboundText, input.message, input.body, input.text), 3000),
    knowledgeTitles: (context.knowledgeContext || []).map((item: any) => ({ scope: item.scope, title: item.title, hasExcerpt: item.hasExcerpt })),
    latestLifecycle: context.latestLifecycle || null,
  };
}

async function generateReply(db: any, tenantId: string, input: any) {
  const started = Date.now();
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');
  const context = await loadContext(db, tenantId, input);
  const channel = context.channel;
  const configuredModel = firstValue(input.model, Deno.env.get('OPENAI_TEXT_MODEL'), Deno.env.get('OPENAI_EMAIL_MODEL'), 'gpt-5.5') as string;
  const inboundText = String(firstValue(input.inboundText, input.message, input.body, input.text, '') || '').trim();
  if (!inboundText) throw new Error('Inbound message text is required');
  const requestPayload = auditRequestPayload(context, input);

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: configuredModel,
        instructions: buildInstructions(channel, context.lead?.preferred_language || input.preferredLanguage || input.preferred_language || null),
        input: JSON.stringify({
          channel,
          tenant: {
            name: context.tenant?.name || null,
            industry: context.tenant?.industry || null,
            businessNiche: context.tenant?.business_niche || null,
            timezone: context.tenant?.default_timezone || null,
          },
          agent: { name: context.agent?.display_name || 'the AI assistant' },
          lead: {
            name: leadName(context.lead),
            serviceInterest: context.lead?.service_interest || null,
            preferredContactChannel: context.lead?.preferred_contact_channel || null,
            preferredLanguage: context.lead?.preferred_language || null,
            lifecycleStage: context.lead?.lead_stage || null,
            schedulingState: context.lead?.scheduling_state || null,
            nextContactAt: context.lead?.next_contact_at || null,
            qualificationNotes: context.lead?.qualification_notes || null,
            customFields: context.lead?.custom_fields || null,
          },
          latestLifecycle: context.latestLifecycle,
          recentMessages: context.recentMessages,
          knowledgeContext: context.knowledgeContext,
          inboundMessage: inboundText,
          allowedActions: ['send_reply', 'book_meeting', 'schedule_callback', 'evaluate_lifecycle', 'mark_opt_out', 'escalate_to_human'],
        }),
        text: {
          format: {
            type: 'json_schema',
            name: 'openai_messaging_brain_response',
            strict: true,
            schema: outputSchema(channel),
          },
        },
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error?.message || `OpenAI messaging brain failed with ${response.status}`);
    let parsed: any;
    try {
      parsed = JSON.parse(extractOutputText(data) || '{}');
    } catch {
      throw new Error('OpenAI returned invalid messaging brain JSON');
    }
    const output = normalizedBrainOutput(parsed, channel);
    await writeAudit(db, {
      tenant_id: tenantId,
      lead_id: context.lead?.id || firstValue(input.leadId, input.lead_id) || null,
      conversation_id: firstValue(input.conversationId, input.conversation_id) || null,
      message_id: firstValue(input.messageId, input.message_id) || null,
      tenant_agent_id: context.agent?.id || null,
      source_channel: channel,
      source: String(firstValue(input.source, 'openai-messaging-brain')).slice(0, 80),
      status: 'success',
      model: configuredModel,
      provider_response_id: data.id || null,
      detected_intent: output.detectedIntent,
      recommended_outcome: output.lifecycleRecommendation.outcome,
      recommended_action: output.lifecycleRecommendation.nextActionType,
      needs_human_review: output.needsHumanReview,
      request_payload: requestPayload,
      response_payload: output,
      duration_ms: Date.now() - started,
    });
    return { ...output, model: configuredModel, responseId: data.id || null, agentId: context.agent?.id || null };
  } catch (error) {
    await writeAudit(db, {
      tenant_id: tenantId,
      lead_id: context.lead?.id || firstValue(input.leadId, input.lead_id) || null,
      conversation_id: firstValue(input.conversationId, input.conversation_id) || null,
      message_id: firstValue(input.messageId, input.message_id) || null,
      tenant_agent_id: context.agent?.id || null,
      source_channel: channel,
      source: String(firstValue(input.source, 'openai-messaging-brain')).slice(0, 80),
      status: 'failed',
      model: configuredModel,
      needs_human_review: true,
      request_payload: requestPayload,
      response_payload: {},
      error_message: safeError(error),
      duration_ms: Date.now() - started,
    });
    throw error;
  }
}

export default async function(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method === 'GET') {
    return jsonResponse({
      success: true,
      service: 'openai-messaging-brain',
      actions: ['generate-reply'],
      provider: 'openai',
      configured: {
        openai: Boolean(Deno.env.get('OPENAI_API_KEY')),
        authorization: Boolean(actionSecret()),
        defaultModel: Deno.env.get('OPENAI_TEXT_MODEL') || Deno.env.get('OPENAI_EMAIL_MODEL') || 'gpt-5.5',
      },
    });
  }

  try {
    assertAuthorized(req);
    const action = new URL(req.url).searchParams.get('action') || 'generate-reply';
    if (action !== 'generate-reply') return jsonResponse({ success: false, error: 'Unsupported messaging brain action' }, 400);
    const body = await req.json().catch(() => ({}));
    const tenantId = requiredTenantId(body);
    const db = createInsForgeClient();
    const result = await generateReply(db, tenantId, body);
    return jsonResponse({ success: true, ...result });
  } catch (error) {
    const message = safeError(error);
    const status = /unauthorized/i.test(message) ? 401 : 500;
    return jsonResponse({ success: false, error: message }, status);
  }
}
