import assert from 'node:assert/strict';
import test from 'node:test';
import { TwilioVoiceService } from '../src/services/twilio-voice-service.js';

const originalEnv = { ...process.env };

test.afterEach(() => {
  process.env = { ...originalEnv };
});

test('startOutboundCall uses a tenant sender phone number when provided', async () => {
  process.env.VOICE_CALLING_ENABLED = 'true';
  process.env.INSFORGE_FUNCTION_BASE_URL = 'https://functions.example.test';
  const createdCalls = [];
  const service = new TwilioVoiceService({
    initialize: false,
    fromNumber: '+15550001111',
    client: {
      calls: {
        create: async (payload) => {
          createdCalls.push(payload);
          return { sid: 'CA123', status: 'queued' };
        },
      },
    },
  });

  const result = await service.startOutboundCall({
    action: {
      id: 'action-1',
      conversationId: 'conversation-1',
      tenantPhoneNumber: '+15550003333',
    },
    lead: {
      id: 'lead-1',
      phone: '+15550002222',
    },
  });

  assert.equal(result.success, true);
  assert.equal(createdCalls[0].from, '+15550003333');
  assert.equal(createdCalls[0].to, '+15550002222');
  assert.match(createdCalls[0].url, /twilio-voice-webhook/);
});
