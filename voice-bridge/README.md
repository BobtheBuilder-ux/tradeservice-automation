# Bob Voice Media Bridge

Persistent WebSocket bridge for Phase 10 voice calls.

Twilio calls the InsForge twilio-voice-webhook Function, which returns Connect Stream TwiML pointing to this service at:

    wss://<bridge-host>/twilio-media

The bridge:

- receives Twilio bidirectional Media Stream events;
- resolves a short-lived call context through twilio-voice-webhook?mode=bridge-context;
- connects to the tenant agent's ElevenLabs signed WebSocket URL;
- forwards inbound media chunks to ElevenLabs as user_audio_chunk;
- forwards ElevenLabs audio chunks back to Twilio as media frames;
- reports transcripts, agent responses, errors, and call end summaries through twilio-voice-webhook?mode=bridge-event.

Audio conversion is explicit:

- Twilio inbound media is G.711 μ-law at 8 kHz and is decoded/resampled to PCM16 before it reaches ElevenLabs.
- ElevenLabs PCM16 audio is resampled/encoded to G.711 μ-law at 8 kHz before it is sent back to Twilio.

## Required environment

    PORT=8080
    INSFORGE_FUNCTION_BASE_URL=https://xxx3s5ke.function2.insforge.app
    VOICE_BRIDGE_CONTEXT_SECRET=<same value configured on the InsForge Function runtime>
    SEND_ELEVENLABS_AUDIO_TO_TWILIO=true
    ELEVENLABS_PCM_SAMPLE_RATE=16000

VOICE_BRIDGE_CONTEXT_SECRET is optional in code for local smoke tests, but should be set in production.

The InsForge Functions, not this bridge, own ELEVENLABS_API_KEY. The bridge receives only a temporary signed ElevenLabs WebSocket URL.

ELEVENLABS_PCM_SAMPLE_RATE defaults to 16000. Change it only if the configured ElevenLabs conversational WebSocket audio format uses a different PCM sample rate.

## Local check

    npm install
    npm run check
    npm start

## Deploy note

Deploy this as a managed long-lived compute/WebSocket service, then set the deployed wss://.../twilio-media URL in InsForge secrets as VOICE_MEDIA_BRIDGE_WS_URL.
