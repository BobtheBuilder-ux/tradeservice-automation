import { createClient } from 'npm:@insforge/sdk';

const ELEVENLABS_API_BASE = 'https://api.elevenlabs.io/v1';
const DEFAULT_PROMPT_VERSION = 'v1';
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
  const response = await fetch(`${ELEVENLABS_API_BASE}${path}`, {
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
  const agentName = context.agent?.display_name || 'Bob';
  const bookingProvider = context.bookingIntegration?.provider || 'manual';
  const bookingUrl = context.bookingIntegration?.booking_url || 'not configured';
  const senderEmail = context.emailIdentity?.from_email || 'not configured';
  const phoneNumber = context.phoneNumber?.phone_number || 'not configured';
  const toolWebhookUrl = elevenLabsToolWebhookUrl();

  return [
    `You are ${agentName}, an AI outreach and booking assistant for ${tenantName}.`,
    'You qualify leads, answer questions from the tenant knowledge base, and help book consultations.',
    'Stay concise, warm, truthful, and operational. If tenant knowledge is missing, say you will have the team follow up instead of inventing facts.',
    'Respect channel consent, opt-outs, and tenant boundaries. Never contact a lead outside the allowed channels.',
    `Tenant phone number: ${phoneNumber}.`,
    `Tenant sender email: ${senderEmail}.`,
    `Booking provider: ${bookingProvider}. Booking URL or event reference: ${bookingUrl}.`,
    `Tool webhook URL: ${toolWebhookUrl || 'not configured'}.`,
    'Runtime dynamic variables may include tenant_id, tenant_name, tenant_agent_id, agent_name, lead_id, lead_name, service_interest, booking_provider, booking_url, tenant_phone_number, sender_email, and tool_webhook_url.',
    'Use the configured webhook tools for get_lead_context, update_lead_status, check_availability, create_booking, send_sms, send_whatsapp, send_email, record_call_outcome, escalate_to_human, and mark_opt_out.',
  ].join('\n\n');
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

function buildConversationConfig(context: JsonRecord, documents: JsonRecord[]) {
  const agentName = context.agent?.display_name || 'Bob';
  const tenantName = context.tenant?.name || 'the company';
  const voiceId = context.agent?.voice_id || DEFAULT_VOICE_ID;

  return {
    agent: {
      first_message: `Hi, this is ${agentName} from ${tenantName}. Is now still a good time?`,
      language: 'en',
      prompt: {
        prompt: buildAgentPrompt(context),
        knowledge_base: knowledgeRefs(documents),
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
    agent_name: context.agent?.display_name || 'Bob',
    lead_id: 'test-lead-id',
    lead_name: 'Test Lead',
    service_interest: 'consultation',
    booking_provider: context.bookingIntegration?.provider || 'manual',
    booking_url: context.bookingIntegration?.booking_url || '',
    tenant_phone_number: context.phoneNumber?.phone_number || '',
    sender_email: context.emailIdentity?.from_email || '',
    tool_webhook_url: elevenLabsToolWebhookUrl(),
  };
}

function elevenLabsToolWebhookUrl() {
  const baseUrl = Deno.env.get('INSFORGE_FUNCTION_BASE_URL');
  return baseUrl ? `${baseUrl.replace(/\/$/, '')}/elevenlabs-tool-webhooks` : '';
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
  const name = safeName(`${context.tenant?.name || 'Tenant'} - ${agent.display_name || 'Bob'}`, 'Tenant agent');
  const payload = {
    name,
    tags: ['bob-automation', `tenant:${context.tenant?.id || agent.tenant_id}`, agent.template_key || 'custom-agent'],
    conversation_config: buildConversationConfig(context, documents),
    platform_settings: {
      evaluation: {
        criteria: [],
      },
    },
  };

  const providerResult = agent.elevenlabs_agent_id
    ? await elevenLabsRequest(`/convai/agents/${agent.elevenlabs_agent_id}`, {
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

  const elevenlabsAgentId = providerResult?.agent_id || agent.elevenlabs_agent_id;
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
  const action = url.searchParams.get('action') || 'status';
  const body = req.method === 'GET' ? {} : await req.json().catch(() => ({}));

  try {
    if (action === 'status') {
      return jsonResponse({
        success: true,
        service: 'elevenlabs-agent-actions',
        configured: Boolean(Deno.env.get('ELEVENLABS_API_KEY')),
        actions: ['status', 'provision-agent', 'sync-knowledge', 'test-agent'],
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

    return jsonResponse({ success: false, error: 'Unsupported ElevenLabs agent action' }, 404);
  } catch (error) {
    const status = safeError(error).toLowerCase().includes('auth') ? 401 : 500;
    return jsonResponse({ success: false, error: safeError(error) }, status);
  }
}
