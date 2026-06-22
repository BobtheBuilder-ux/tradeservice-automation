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

function normalizeLanguageName(value) {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return '';
  const languageMap = [
    ['French', /\b(french|francais|français|francaise|française)\b/i],
    ['English', /\b(english|anglais)\b/i],
    ['Spanish', /\b(spanish|espanol|español)\b/i],
    ['Portuguese', /\b(portuguese|portugues|português)\b/i],
    ['Arabic', /\b(arabic|arabe)\b/i],
    ['Yoruba', /\b(yoruba|yorùbá)\b/i],
    ['Igbo', /\b(igbo|ibo)\b/i],
    ['Hausa', /\b(hausa)\b/i],
  ];
  for (const [language, pattern] of languageMap) {
    if (pattern.test(text)) return language;
  }
  return String(value || '').trim();
}

function detectLanguagePreference(text) {
  const value = String(text || '').trim();
  if (!value) return '';
  const lowered = value.toLowerCase();
  const hasLanguageIntent = /\b(switch|change|speak|talk|continue|communicate|prefer|preferred|language|langue|parler|anglais|français|francais|french|english|spanish|español|portuguese|arabic|yoruba|igbo|hausa)\b/i.test(lowered);
  if (!hasLanguageIntent) return '';
  return normalizeLanguageName(value);
}

function preferredLanguageFromContext(context) {
  const dynamicVariables = context?.dynamicVariables || {};
  return normalizeLanguageName(
    dynamicVariables.preferred_language
      || dynamicVariables.preferredLanguage
      || dynamicVariables.active_language
      || ''
  );
}

function resumeFirstMessage(language, reason) {
  const normalized = normalizeLanguageName(language);
  if (normalized === 'French') {
    return 'D’accord, je vais continuer en français. Reprenons là où nous en étions.';
  }
  if (normalized === 'Spanish') {
    return 'De acuerdo, continuaré en español. Sigamos desde donde nos quedamos.';
  }
  if (normalized === 'Portuguese') {
    return 'Combinado, vou continuar em português. Vamos continuar de onde paramos.';
  }
  if (normalized === 'Arabic') {
    return 'تمام، سأتابع بالعربية. دعنا نكمل من حيث توقفنا.';
  }
  if (normalized === 'Yoruba') {
    return 'Ó dáa, màá tẹ̀síwájú ní èdè Yorùbá. Ẹ jẹ́ ká tẹ̀síwájú láti ibi tá a dúró.';
  }
  if (normalized === 'Igbo') {
    return 'Ọ dị mma, aga m aga n’ihu n’asụsụ Igbo. Ka anyị gaa n’ihu ebe anyị kwụsịrị.';
  }
  if (normalized === 'Hausa') {
    return 'To, zan ci gaba da Hausa. Mu ci gaba daga inda muka tsaya.';
  }
  if (reason && /language/i.test(reason)) {
    return 'Absolutely, I’ll continue in your preferred language. Let’s keep going from where we left off.';
  }
  return 'Thanks for staying with me. I’ll continue from where we left off.';
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

function buildInitiation(context, options = {}) {
  const dynamicVariables = {
    ...(context.dynamicVariables || {}),
    ...(options.activeLanguage ? { preferred_language: options.activeLanguage, active_language: options.activeLanguage } : {}),
    ...(options.resume ? { reconnected_call: 'true', intro_already_played: 'true' } : {}),
  };
  const payload = {
    type: 'conversation_initiation_client_data',
    dynamic_variables: dynamicVariables,
  };
  if ((context.conversationConfigOverride && !options.disableOverride) || options.resume) {
    payload.conversation_config_override = {
      ...(!options.disableOverride ? (context.conversationConfigOverride || {}) : {}),
      agent: {
        ...(!options.disableOverride ? ((context.conversationConfigOverride || {}).agent || {}) : {}),
        ...(options.resume
          ? {
              first_message: resumeFirstMessage(options.activeLanguage, options.resumeReason),
            }
          : {}),
      },
    };
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
    twilioStopped: false,
    twilioStoppedAt: 0,
    elevenlabsReconnectAttempts: 0,
    elevenlabsReconnectTimer: null,
    initialIntroSent: false,
    callStartedPosted: false,
    activeLanguage: '',
    languageSwitchRequested: false,
    lastUserTranscriptAt: 0,
    lastAgentResponse: '',
    duplicateAgentResponseCount: 0,
    introLoopRecoveryInProgress: false,
    suppressAgentAudioUntil: 0,
    elevenlabsAudioChunks: 0,
    noAudioTimer: null,
    noAudioRecoveryAttempted: false,
    disableConversationOverride: false,
  };

  function clearNoAudioTimer() {
    if (state.noAudioTimer) {
      clearTimeout(state.noAudioTimer);
      state.noAudioTimer = null;
    }
  }

  function scheduleNoAudioRecovery(context, reason = 'no ElevenLabs audio after initiation') {
    clearNoAudioTimer();
    state.noAudioTimer = setTimeout(() => {
      state.noAudioTimer = null;
      if (state.closed || state.twilioStopped || !open(twilioWs)) return;
      if (state.elevenlabsAudioChunks > 0 || state.agentResponses.length > 0) return;
      postBridgeEvent(state.session, state.token, {
        type: 'bridge_error',
        error: reason + '; retrying without conversation override.',
        twilioStreamSid: state.streamSid,
        timestamp: new Date().toISOString(),
      });
      if (!state.noAudioRecoveryAttempted) {
        state.noAudioRecoveryAttempted = true;
        state.disableConversationOverride = true;
        if (open(state.elevenlabsWs)) {
          state.elevenlabsWs.close(1000, 'no audio recovery');
        } else {
          scheduleElevenLabsReconnect('no audio recovery');
        }
      }
    }, Number(process.env.ELEVENLABS_NO_AUDIO_TIMEOUT_MS || 9000));
  }

  function normalizedResponse(text) {
    return String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function recoverFromRepeatedAgentIntro(text) {
    if (state.introLoopRecoveryInProgress || state.twilioStopped || !open(twilioWs)) return;
    state.introLoopRecoveryInProgress = true;
    state.suppressAgentAudioUntil = Date.now() + 8000;
    sendJson(twilioWs, { event: 'clear', streamSid: state.streamSid });
    postBridgeEvent(state.session, state.token, {
      type: 'bridge_error',
      error: 'Repeated agent intro detected; reconnecting ElevenLabs in resume mode.',
      repeatedText: text,
      duplicateCount: state.duplicateAgentResponseCount,
      twilioStreamSid: state.streamSid,
      timestamp: new Date().toISOString(),
    });
    if (open(state.elevenlabsWs)) {
      state.elevenlabsWs.close(1000, 'intro loop recovery');
    } else {
      scheduleElevenLabsReconnect('intro loop recovery');
    }
    setTimeout(() => {
      state.introLoopRecoveryInProgress = false;
    }, 10_000);
  }

  async function closeBoth(code = 1000, reason = 'bridge closing') {
    if (state.closed) return;
    state.closed = true;
    clearNoAudioTimer();
    if (open(state.elevenlabsWs)) state.elevenlabsWs.close(code, reason);
    if (open(twilioWs)) twilioWs.close(code, reason);
    if (state.session?.id && state.token) {
      const noAgentAudio = state.elevenlabsAudioChunks === 0 && state.agentResponses.length === 0 && state.userTranscript.length === 0;
      await postBridgeEvent(state.session, state.token, {
        type: 'call_ended',
        twilioStreamSid: state.streamSid,
        outcome: noAgentAudio ? 'failed' : 'completed',
        summary: noAgentAudio ? 'Voice call ended before ElevenLabs emitted agent audio.' : (state.agentResponses.at(-1) || state.userTranscript.at(-1) || 'Voice call ended.'),
        transcript: [
          ...state.userTranscript.map((text) => 'Lead: ' + text),
          ...state.agentResponses.map((text) => 'Agent: ' + text),
        ].join('\n'),
        noAgentAudio,
        elevenlabsAudioChunks: state.elevenlabsAudioChunks,
        elevenlabsConversationId: state.elevenlabsConversationId || undefined,
        timestamp: new Date().toISOString(),
      });
    }
  }

  function scheduleFinalCloseAfterTwilioStop(reason = 'twilio stopped') {
    if (state.closed) return;
    state.twilioStopped = true;
    state.twilioStoppedAt = state.twilioStoppedAt || Date.now();
    setTimeout(() => {
      const stoppedForMs = Date.now() - state.twilioStoppedAt;
      if (state.twilioStopped && stoppedForMs >= 10_000 && !state.closed) {
        closeBoth(1000, reason).catch((error) => console.error('[voice-bridge] delayed close failed', error.message));
      }
    }, 10_000);
  }

  function scheduleElevenLabsReconnect(reason = 'elevenlabs closed') {
    if (state.closed || state.twilioStopped || !open(twilioWs)) return;
    if (state.elevenlabsReconnectTimer) return;
    state.elevenlabsReconnectTimer = setTimeout(async () => {
      state.elevenlabsReconnectTimer = null;
      if (state.closed || state.twilioStopped || !open(twilioWs)) return;
      state.elevenlabsReconnectAttempts += 1;
      try {
        const context = await functionRequest('bridge-context', {
          voiceCallSessionId: state.session?.id,
          callContextToken: state.token,
          twilioStreamSid: state.streamSid,
          twilioCallSid: state.callSid,
        });
        state.session = context.voiceCallSession || state.session;
        await connectElevenLabs(context, { resume: true, resumeReason: reason, disableOverride: state.disableConversationOverride });
        await postBridgeEvent(state.session, state.token, {
          type: 'bridge_reconnected',
          reason,
          attempts: state.elevenlabsReconnectAttempts,
          activeLanguage: state.activeLanguage || undefined,
          twilioStreamSid: state.streamSid,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        await postBridgeEvent(state.session, state.token, {
          type: 'bridge_error',
          error: 'ElevenLabs reconnect failed: ' + error.message,
          reason,
          attempts: state.elevenlabsReconnectAttempts,
          twilioStreamSid: state.streamSid,
        });
        if (state.elevenlabsReconnectAttempts < 15) {
          scheduleElevenLabsReconnect('retry after reconnect failure');
        }
      }
    }, Math.min(1000 + state.elevenlabsReconnectAttempts * 500, 5000));
  }

  async function connectElevenLabs(context, options = {}) {
    const elevenlabsWs = new WebSocket(context.elevenlabs.signedUrl);
    state.elevenlabsWs = elevenlabsWs;
    state.activeLanguage = state.activeLanguage || preferredLanguageFromContext(context);

    elevenlabsWs.on('open', () => {
      const resume = Boolean(options.resume || state.initialIntroSent);
      sendJson(elevenlabsWs, buildInitiation(context, {
        resume,
        resumeReason: options.resumeReason,
        activeLanguage: state.activeLanguage,
        disableOverride: options.disableOverride || state.disableConversationOverride,
      }));
      state.initialIntroSent = true;
      postBridgeEvent(state.session, state.token, {
        type: 'initiation_sent',
        resume,
        overrideDisabled: Boolean(options.disableOverride || state.disableConversationOverride),
        twilioStreamSid: state.streamSid,
        timestamp: new Date().toISOString(),
      });
      scheduleNoAudioRecovery(context);
      if (!state.callStartedPosted) {
        state.callStartedPosted = true;
        postBridgeEvent(state.session, state.token, {
          type: 'call_started',
          twilioStreamSid: state.streamSid,
          timestamp: new Date().toISOString(),
        });
      }
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
          state.lastUserTranscriptAt = Date.now();
          const requestedLanguage = detectLanguagePreference(text);
          if (requestedLanguage) {
            state.activeLanguage = requestedLanguage;
            state.languageSwitchRequested = true;
          }
          postBridgeEvent(state.session, state.token, {
            type: 'user_transcript',
            text,
            ...(requestedLanguage ? { detectedLanguagePreference: requestedLanguage } : {}),
            twilioStreamSid: state.streamSid,
          });
        }
      }

      if (data.type === 'agent_response') {
        const text = data.agent_response_event?.agent_response || '';
        if (text) {
          clearNoAudioTimer();
          const normalized = normalizedResponse(text);
          const repeated = normalized && normalized === normalizedResponse(state.lastAgentResponse);
          if (repeated && state.userTranscript.length === 0) {
            state.duplicateAgentResponseCount += 1;
          } else {
            state.duplicateAgentResponseCount = 0;
          }
          state.lastAgentResponse = text;
          if (state.duplicateAgentResponseCount >= 2) {
            recoverFromRepeatedAgentIntro(text);
            return;
          }
          state.agentResponses.push(text);
          postBridgeEvent(state.session, state.token, {
            type: 'agent_response',
            text,
            ...(state.duplicateAgentResponseCount ? { duplicateAgentResponseCount: state.duplicateAgentResponseCount } : {}),
            twilioStreamSid: state.streamSid,
          });
        }
      }

      if (data.type === 'audio' && SEND_ELEVENLABS_AUDIO_TO_TWILIO) {
        if (Date.now() < state.suppressAgentAudioUntil) return;
        const audioBase64 = data.audio_event?.audio_base_64;
        if (audioBase64) {
          state.elevenlabsAudioChunks += 1;
          if (state.elevenlabsAudioChunks === 1) {
            clearNoAudioTimer();
            postBridgeEvent(state.session, state.token, {
              type: 'agent_audio_started',
              twilioStreamSid: state.streamSid,
              timestamp: new Date().toISOString(),
            });
          }
        }
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
      if (state.twilioStopped || !open(twilioWs)) {
        scheduleFinalCloseAfterTwilioStop('twilio stopped after elevenlabs closed');
        return;
      }
      scheduleElevenLabsReconnect('elevenlabs websocket closed while twilio remained active');
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
      scheduleFinalCloseAfterTwilioStop('twilio stop event');
    }
  });

  twilioWs.on('close', () => {
    scheduleFinalCloseAfterTwilioStop('twilio websocket closed');
  });

  twilioWs.on('error', (error) => {
    postBridgeEvent(state.session, state.token, {
      type: 'bridge_error',
      error: error.message,
      twilioStreamSid: state.streamSid,
    });
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
