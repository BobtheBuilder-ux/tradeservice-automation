import { createClient } from 'npm:@insforge/sdk';
import twilio from 'npm:twilio';

const DEFAULT_TENANT_ID = '00000000-0000-4000-8000-000000000001';
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

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function randomContextToken() {
  return `${crypto.randomUUID()}.${crypto.randomUUID()}`;
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

async function resolveTenantAgent(db: any, tenantId: string, lead: any, requestedAgentId?: string | null) {
  const agentId = requestedAgentId || lead?.assigned_tenant_agent_id || null;
  if (agentId) {
    const rows = await unwrap(
      await db.database.from('tenant_agents').select('*').eq('tenant_id', tenantId).eq('id', agentId).limit(1),
      'Failed to load tenant agent'
    );
    if (rows?.[0]) return rows[0];
  }

  const defaults = await unwrap(
    await db.database
      .from('tenant_agents')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('template_key', 'bob-default')
      .neq('status', 'archived')
      .limit(1),
    'Failed to load default tenant agent'
  );
  if (defaults?.[0]) return defaults[0];

  const active = await unwrap(
    await db.database
      .from('tenant_agents')
      .select('*')
      .eq('tenant_id', tenantId)
      .in('status', ['live', 'testing'])
      .limit(1),
    'Failed to load active tenant agent'
  );
  return active?.[0] || null;
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
    statusCallback: input.statusCallbackUrl,
    statusCallbackMethod: 'POST',
    statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
  });
}

async function createVoiceCallSession(db: any, input: JsonRecord) {
  const tenantId = input.tenantId || input.tenant_id || DEFAULT_TENANT_ID;
  const leadId = input.leadId || input.lead_id || null;
  const lead = await loadLead(db, tenantId, leadId);

  if (leadId && !lead) throw new Error('Lead not found for voice call');
  if (lead) {
    const policy = leadAllowsChannel(lead, 'call');
    if (!policy.allowed) throw new Error(policy.reason);
  } else if (!input.callConsent) {
    throw new Error('Call consent is required for direct test calls');
  }

  const tenantAgent = await resolveTenantAgent(db, tenantId, lead, input.tenantAgentId || input.tenant_agent_id || input.agentId);
  if (!tenantAgent?.id) throw new Error('No tenant AI agent is configured for this call');
  if (!tenantAgent.elevenlabs_agent_id) throw new Error('Tenant AI agent is not synced to ElevenLabs yet');

  const primaryPhoneNumber = await getTenantPrimaryPhoneNumber(db, tenantId);
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

const bobQueueActions = ['status', 'tick', 'start-calls', 'skip', 'test-lead', 'test-call', 'test-sms', 'live-start', 'live-status'];

async function getBobRunStatus(db: any, leadId: string, conversationId?: string) {
  const { data: leads } = await db.database.from('leads').select('*').eq('id', leadId).limit(1);
  const lead = leads?.[0] || null;
  const { data: conversations } = conversationId
    ? await db.database.from('lead_conversations').select('*').eq('id', conversationId).limit(1)
    : await db.database.from('lead_conversations').select('*').eq('lead_id', leadId).limit(1);
  const conversation = conversations?.[0] || null;
  const { data: actions } = await db.database
    .from('bob_actions')
    .select('*')
    .eq('lead_id', leadId)
    .order('scheduled_for', { ascending: true })
    .limit(100);
  const { data: voiceCalls } = await db.database
    .from('voice_call_sessions')
    .select('*')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .limit(20);
  return { lead, conversation, actions: actions || [], voiceCalls: voiceCalls || [] };
}

async function createLiveLeadRun(db: any, body: any) {
  const tenantId = body.tenantId || body.tenant_id || DEFAULT_TENANT_ID;
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
    assigned_tenant_agent_id: body.tenantAgentId || body.tenant_agent_id || null,
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
  if (body.includeEmail !== false) actionRows.push({ tenant_id: tenantId, lead_id: lead.id, conversation_id: conversation.id, action_type: 'send_email', channel: 'email', status: emailPolicy.allowed ? 'pending' : 'awaiting_human', reason: emailPolicy.allowed ? 'Live test email action' : emailPolicy.reason, scheduled_for: nowIso(), payload: { source: 'function_live_test', contactPolicy: emailPolicy } });
  if (body.includeSms) actionRows.push({ tenant_id: tenantId, lead_id: lead.id, conversation_id: conversation.id, action_type: 'send_sms', channel: 'sms', status: smsPolicy.allowed ? 'pending' : 'awaiting_human', reason: smsPolicy.allowed ? 'Live test SMS action' : smsPolicy.reason, scheduled_for: nowIso(), payload: { source: 'function_live_test', contactPolicy: smsPolicy } });
  if (body.includeCall) actionRows.push({ tenant_id: tenantId, lead_id: lead.id, conversation_id: conversation.id, action_type: 'queue_call_attempt', channel: 'phone', status: callPolicy.allowed ? 'awaiting_call' : 'awaiting_human', reason: callPolicy.allowed ? 'Live test call action' : callPolicy.reason, scheduled_for: nowIso(), payload: { source: 'function_live_test', contactPolicy: callPolicy, tenantAgentId: body.tenantAgentId || body.tenant_agent_id || null } });
  if (actionRows.length) await db.database.from('bob_actions').insert(actionRows);
  return { lead, conversation, status: await getBobRunStatus(db, lead.id, conversation.id) };
}

async function skipBobAction(db: any, actionId: string) {
  const { data } = await db.database.from('bob_actions').update({
    status: 'skipped',
    executed_at: nowIso(),
    updated_at: nowIso(),
    result: { skippedBy: 'insforge_function' },
  }).eq('id', actionId).select();
  return data?.[0] || null;
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

async function startQueuedCalls(db: any, body: JsonRecord) {
  let query = db.database
    .from('bob_actions')
    .select('*')
    .eq('action_type', 'queue_call_attempt')
    .eq('status', 'awaiting_call')
    .order('scheduled_for', { ascending: true })
    .limit(Number(body.limit || 3));
  if (body.leadId || body.lead_id) query = query.eq('lead_id', body.leadId || body.lead_id);
  if (body.conversationId || body.conversation_id) query = query.eq('conversation_id', body.conversationId || body.conversation_id);

  const actions = await unwrap(await query, 'Failed to load queued call actions');
  const results = [];
  for (const action of actions || []) {
    try {
      const call = await launchVoiceCall(db, {
        tenantId: action.tenant_id,
        leadId: action.lead_id,
        conversationId: action.conversation_id,
        actionId: action.id,
        tenantAgentId: action.payload?.tenantAgentId || action.payload?.tenant_agent_id || null,
        source: 'queued_call_action',
      });
      results.push({ actionId: action.id, success: true, call });
    } catch (error) {
      await db.database.from('bob_actions').update({
        status: 'failed',
        executed_at: nowIso(),
        updated_at: nowIso(),
        result: { error: String(error?.message || 'Queued call failed') },
      }).eq('id', action.id).eq('tenant_id', action.tenant_id);
      results.push({ actionId: action.id, success: false, error: String(error?.message || 'Queued call failed') });
    }
  }
  return results;
}

async function createFunctionTestLead(db: any, body: any) {
  const { data } = await db.database.from('leads').insert([{
    tenant_id: body.tenantId || body.tenant_id || DEFAULT_TENANT_ID,
    email: body.email || `test-${Date.now()}@example.com`,
    full_name: body.fullName || body.name || 'Test Lead',
    phone: body.phone || null,
    source: 'function_test',
    service_interest: body.serviceInterest || body.service_interest || null,
    location_summary: body.locationSummary || body.location_summary || null,
    preferred_meeting_window: body.preferredMeetingWindow || body.preferred_meeting_window || null,
    call_consent: Boolean(body.callConsent),
    sms_consent: Boolean(body.smsConsent),
    whatsapp_consent: Boolean(body.whatsappConsent),
    email_consent: Boolean(body.emailConsent),
    do_not_contact: Boolean(body.doNotContact),
    assigned_tenant_agent_id: body.tenantAgentId || body.tenant_agent_id || null,
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
      const id = body.actionId || url.searchParams.get('actionId');
      if (!id) return jsonResponse({ success: false, error: 'actionId is required' }, 400);
      return jsonResponse({ success: true, action: await skipBobAction(db, id) });
    }

    if (action === 'live-start') {
      return jsonResponse({ success: true, ...(await createLiveLeadRun(db, body)) });
    }

    if (action === 'live-status') {
      const leadId = body.leadId || url.searchParams.get('leadId');
      if (!leadId) return jsonResponse({ success: false, error: 'leadId is required' }, 400);
      return jsonResponse({
        success: true,
        status: await getBobRunStatus(db, leadId, body.conversationId || url.searchParams.get('conversationId') || undefined),
      });
    }

    if (action === 'tick' || action === 'start-calls') {
      const startedCalls = await startQueuedCalls(db, body);
      if (body.leadId || body.lead_id) {
        const leadId = body.leadId || body.lead_id;
        return jsonResponse({
          success: true,
          tick: { processedAt: nowIso(), mode: 'function_tick', voice: { started: startedCalls.filter((row) => row.success).length, results: startedCalls } },
          status: await getBobRunStatus(db, leadId, body.conversationId || body.conversation_id),
        });
      }
      return jsonResponse({ success: true, queued: await inspectQueuedBobActions(db), voice: { results: startedCalls }, mode: 'function_tick' });
    }

    if (action === 'test-lead') {
      return jsonResponse({ success: true, lead: await createFunctionTestLead(db, body) });
    }

    if (action === 'test-call') {
      return jsonResponse({ success: true, call: await launchVoiceCall(db, { ...body, source: 'direct_test_call' }) });
    }

    if (action === 'test-sms') {
      const secret = Deno.env.get('MESSAGE_ACTIONS_SECRET') || Deno.env.get('ELEVENLABS_TOOL_SECRET');
      if (!secret) throw new Error('Message delivery authorization is not configured');
      const response = await fetch(`${functionBaseUrl()}/twilio-sms-webhook?action=send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-message-actions-secret': secret },
        body: JSON.stringify({
          tenantId: body.tenantId,
          leadId: body.leadId,
          channel: 'sms',
          message: body.message || 'This is a tenant SMS test message.',
          source: 'admin_dashboard_test_sms',
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.success) throw new Error(result?.error || 'Failed to send SMS test');
      return jsonResponse({ success: true, message: result });
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
    return jsonResponse({ success: false, error: error?.message || 'Bob queue action failed' }, 500);
  }
}
