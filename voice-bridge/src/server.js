import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import {
  pcm16Base64ToTwilioMuLaw,
  twilioMuLawToPcm16Base64,
} from './audio.js';

const PORT = Number(process.env.PORT || 8080);
const FUNCTION_BASE_URL = (process.env.INSFORGE_FUNCTION_BASE_URL || '').replace(/\/$/, '');
const BRIDGE_SECRET = process.env.VOICE_BRIDGE_CONTEXT_SECRET || '';
const SEND_ELEVENLABS_AUDIO_TO_TWILIO = process.env.SEND_ELEVENLABS_AUDIO_TO_TWILIO !== 'false';
const ELEVENLABS_PCM_SAMPLE_RATE = Number(process.env.ELEVENLABS_PCM_SAMPLE_RATE || 16000);

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function safeParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function open(ws) {
  return ws && ws.readyState === WebSocket.OPEN;
}

function sendJson(ws, payload) {
  if (open(ws)) ws.send(JSON.stringify(payload));
}

async function functionRequest(mode, body) {
  if (!FUNCTION_BASE_URL) throw new Error('INSFORGE_FUNCTION_BASE_URL is not configured');
  const url = new URL('/twilio-voice-webhook', FUNCTION_BASE_URL);
  url.searchParams.set('mode', mode);
  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(BRIDGE_SECRET ? { 'x-voice-bridge-secret': BRIDGE_SECRET } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.success === false) {
    throw new Error(data?.error || 'Function ' + mode + ' failed with ' + response.status);
  }
  return data;
}

function customParameters(start) {
  return start?.customParameters || start?.custom_parameters || {};
}

function buildInitiation(context) {
  const payload = {
    type: 'conversation_initiation_client_data',
    dynamic_variables: context.dynamicVariables || {},
  };
  if (context.conversationConfigOverride) {
    payload.conversation_config_override = context.conversationConfigOverride;
  }
  return payload;
}

async function postBridgeEvent(session, token, event) {
  try {
    await functionRequest('bridge-event', {
      voiceCallSessionId: session?.id,
      callContextToken: token,
      ...event,
    });
  } catch (error) {
    console.error('[voice-bridge] failed to post bridge event', error.message);
  }
}

function handleTwilioConnection(twilioWs, req) {
  const state = {
    streamSid: '',
    callSid: '',
    session: null,
    token: '',
    elevenlabsWs: null,
    elevenlabsConversationId: '',
    userTranscript: [],
    agentResponses: [],
    closed: false,
  };

  async function closeBoth(code = 1000, reason = 'bridge closing') {
    if (state.closed) return;
    state.closed = true;
    if (open(state.elevenlabsWs)) state.elevenlabsWs.close(code, reason);
    if (open(twilioWs)) twilioWs.close(code, reason);
    if (state.session?.id && state.token) {
      await postBridgeEvent(state.session, state.token, {
        type: 'call_ended',
        twilioStreamSid: state.streamSid,
        outcome: 'completed',
        summary: state.agentResponses.at(-1) || state.userTranscript.at(-1) || 'Voice call ended.',
        transcript: [
          ...state.userTranscript.map((text) => 'Lead: ' + text),
          ...state.agentResponses.map((text) => 'Agent: ' + text),
        ].join('\n'),
        elevenlabsConversationId: state.elevenlabsConversationId || undefined,
        timestamp: new Date().toISOString(),
      });
    }
  }

  async function connectElevenLabs(context) {
    const elevenlabsWs = new WebSocket(context.elevenlabs.signedUrl);
    state.elevenlabsWs = elevenlabsWs;

    elevenlabsWs.on('open', () => {
      sendJson(elevenlabsWs, buildInitiation(context));
      postBridgeEvent(state.session, state.token, {
        type: 'call_started',
        twilioStreamSid: state.streamSid,
        timestamp: new Date().toISOString(),
      });
    });

    elevenlabsWs.on('message', (raw) => {
      const data = safeParse(raw.toString());
      if (!data) return;

      if (data.type === 'ping') {
        sendJson(elevenlabsWs, {
          type: 'pong',
          event_id: data.ping_event?.event_id,
        });
        return;
      }

      if (data.type === 'conversation_initiation_metadata') {
        const conversationId = data.conversation_initiation_metadata_event?.conversation_id
          || data.conversation_id
          || data.conversationId
          || '';
        if (conversationId) {
          state.elevenlabsConversationId = conversationId;
          postBridgeEvent(state.session, state.token, {
            type: 'conversation_metadata',
            elevenlabsConversationId: conversationId,
            twilioStreamSid: state.streamSid,
          });
        }
      }

      if (data.type === 'user_transcript') {
        const text = data.user_transcription_event?.user_transcript || '';
        if (text) {
          state.userTranscript.push(text);
          postBridgeEvent(state.session, state.token, {
            type: 'user_transcript',
            text,
            twilioStreamSid: state.streamSid,
          });
        }
      }

      if (data.type === 'agent_response') {
        const text = data.agent_response_event?.agent_response || '';
        if (text) {
          state.agentResponses.push(text);
          postBridgeEvent(state.session, state.token, {
            type: 'agent_response',
            text,
            twilioStreamSid: state.streamSid,
          });
        }
      }

      if (data.type === 'audio' && SEND_ELEVENLABS_AUDIO_TO_TWILIO) {
        const audioBase64 = data.audio_event?.audio_base_64;
        const payload = audioBase64
          ? pcm16Base64ToTwilioMuLaw(audioBase64, ELEVENLABS_PCM_SAMPLE_RATE)
          : null;
        if (payload && open(twilioWs) && state.streamSid) {
          sendJson(twilioWs, {
            event: 'media',
            streamSid: state.streamSid,
            media: { payload },
          });
        }
      }

      if (data.type === 'interruption' && open(twilioWs) && state.streamSid) {
        sendJson(twilioWs, { event: 'clear', streamSid: state.streamSid });
      }
    });

    elevenlabsWs.on('error', (error) => {
      postBridgeEvent(state.session, state.token, {
        type: 'bridge_error',
        error: error.message,
        twilioStreamSid: state.streamSid,
      });
    });

    elevenlabsWs.on('close', () => {
      closeBoth().catch((error) => console.error('[voice-bridge] close failed', error.message));
    });
  }

  twilioWs.on('message', async (raw) => {
    const message = safeParse(raw.toString());
    if (!message?.event) return;

    if (message.event === 'start') {
      state.streamSid = message.start?.streamSid || message.streamSid || '';
      state.callSid = message.start?.callSid || '';
      const params = customParameters(message.start);
      state.token = params.CallContextToken || params.callContextToken || '';
      const sessionId = params.VoiceCallSessionId || params.voiceCallSessionId || '';

      try {
        const context = await functionRequest('bridge-context', {
          voiceCallSessionId: sessionId,
          callContextToken: state.token,
          twilioStreamSid: state.streamSid,
          twilioCallSid: state.callSid,
        });
        state.session = context.voiceCallSession;
        await connectElevenLabs(context);
      } catch (error) {
        console.error('[voice-bridge] failed to initialize context', error.message);
        sendJson(twilioWs, { event: 'clear', streamSid: state.streamSid });
        twilioWs.close(1011, 'context initialization failed');
      }
      return;
    }

    if (message.event === 'media') {
      const payload = message.media?.payload;
      if (payload && open(state.elevenlabsWs)) {
        sendJson(state.elevenlabsWs, {
          user_audio_chunk: twilioMuLawToPcm16Base64(payload, ELEVENLABS_PCM_SAMPLE_RATE),
        });
      }
      return;
    }

    if (message.event === 'stop') {
      closeBoth().catch((error) => console.error('[voice-bridge] stop close failed', error.message));
    }
  });

  twilioWs.on('error', (error) => {
    postBridgeEvent(state.session, state.token, {
      type: 'bridge_error',
      error: error.message,
      twilioStreamSid: state.streamSid,
    });
  });

  twilioWs.on('close', () => {
    closeBoth().catch((error) => console.error('[voice-bridge] twilio close failed', error.message));
  });

  console.log('[voice-bridge] Twilio media connection accepted', req.socket.remoteAddress);
}

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    json(res, 200, {
      success: true,
      service: 'bob-voice-media-bridge',
      functionBaseConfigured: Boolean(FUNCTION_BASE_URL),
      bridgeSecretConfigured: Boolean(BRIDGE_SECRET),
      sendElevenLabsAudioToTwilio: SEND_ELEVENLABS_AUDIO_TO_TWILIO,
      elevenlabsPcmSampleRate: ELEVENLABS_PCM_SAMPLE_RATE,
    });
    return;
  }
  json(res, 404, { success: false, error: 'Not found' });
});

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const path = new URL(req.url || '/', 'http://localhost').pathname;
  if (path !== '/twilio-media') {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => handleTwilioConnection(ws, req));
});

server.listen(PORT, () => {
  console.log('[voice-bridge] listening on ' + PORT);
});
