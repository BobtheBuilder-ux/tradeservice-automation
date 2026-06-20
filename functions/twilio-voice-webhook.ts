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

async function verifySessionToken(session: JsonRecord, token: string) {
  if (!token) throw new Error('Call context token is required');
  if (new Date(session.context_expires_at).getTime() < Date.now()) {
    throw new Error('Call context token expired');
  }
  const tokenHash = await sha256Hex(token);
  if (tokenHash !== session.context_token_hash) throw new Error('Invalid call context token');
}

async function loadContextRows(db: any, session: JsonRecord) {
  const [tenants, leads, agents] = await Promise.all([
    unwrap(await db.database.from('tenants').select('*').eq('id', session.tenant_id).limit(1), 'Failed to load tenant'),
    session.lead_id
      ? unwrap(await db.database.from('leads').select('*').eq('tenant_id', session.tenant_id).eq('id', session.lead_id).limit(1), 'Failed to load lead')
      : Promise.resolve([]),
    session.tenant_agent_id
      ? unwrap(await db.database.from('tenant_agents').select('*').eq('tenant_id', session.tenant_id).eq('id', session.tenant_agent_id).limit(1), 'Failed to load tenant agent')
      : Promise.resolve([]),
  ]);
  return {
    tenant: tenants?.[0] || null,
    lead: leads?.[0] || null,
    agent: agents?.[0] || null,
  };
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

function streamTwiml(reqUrl: URL, session: JsonRecord, token: string) {
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

async function handleIntro(db: any, reqUrl: URL, body: JsonRecord) {
  const sessionId = reqUrl.searchParams.get('sessionId') || body.VoiceCallSessionId || body.sessionId || '';
  const token = reqUrl.searchParams.get('token') || body.CallContextToken || body.token || '';
  const session = await loadSession(db, sessionId);
  await verifySessionToken(session, token);

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

  return streamTwiml(reqUrl, session, token);
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
    dynamicVariables: {
      tenant_id: session.tenant_id,
      lead_id: session.lead_id,
      tenant_agent_id: session.tenant_agent_id,
      agent_name: rows.agent?.display_name || 'Bob',
      company_name: rows.tenant?.name || null,
      lead_name: rows.lead?.full_name || [rows.lead?.first_name, rows.lead?.last_name].filter(Boolean).join(' ') || null,
      service_interest: rows.lead?.service_interest || null,
      booking_context: rows.lead?.preferred_meeting_window || null,
    },
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
    await logTimelineMessage(db, session, {
      direction: 'system',
      messageType: 'call_outcome',
      bodyText: body.summary || `Voice call ended with outcome: ${body.outcome || 'completed'}`,
      metadata: { source: 'voice_bridge', outcome: body.outcome || 'completed' },
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
