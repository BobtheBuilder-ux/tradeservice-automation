import assert from 'node:assert/strict';
import test from 'node:test';
import { TwilioSmsService } from '../src/services/twilio-sms-service.js';

const originalEnv = { ...process.env };

test.afterEach(() => {
  process.env = { ...originalEnv };
});

test('getTwilioAuthConfig prefers API key and secret over account auth token', () => {
  process.env.TWILIO_ACCOUNT_SID = 'AC123';
  process.env.TWILIO_AUTH_TOKEN = 'legacy-token';
  process.env.TWILIO_API_KEY = 'SK123';
  process.env.TWILIO_API_SECRET = 'api-secret';

  assert.deepEqual(TwilioSmsService.getTwilioAuthConfig(), {
    username: 'SK123',
    password: 'api-secret',
    options: { accountSid: 'AC123' },
    mode: 'api_key',
  });
});

test('getTwilioAuthConfig falls back to account SID and auth token', () => {
  process.env.TWILIO_ACCOUNT_SID = 'AC123';
  process.env.TWILIO_AUTH_TOKEN = 'legacy-token';
  delete process.env.TWILIO_API_KEY;
  delete process.env.TWILIO_API_SECRET;

  assert.deepEqual(TwilioSmsService.getTwilioAuthConfig(), {
    username: 'AC123',
    password: 'legacy-token',
    options: undefined,
    mode: 'auth_token',
  });
});

test('sendCallbackConfirmation texts callback note and booking link', async () => {
  process.env.CALL_PUBLIC_BASE_URL = 'https://automation.setmymeet.ca';
  const createdMessages = [];
  const service = new TwilioSmsService({ initialize: false });
  service.fromNumber = '+15550001111';
  service.client = {
    messages: {
      create: async (payload) => {
        createdMessages.push(payload);
        return { sid: 'SM123', status: 'queued' };
      },
    },
  };

  const result = await service.sendCallbackConfirmation(
    { id: 'lead-1', firstName: 'Dana', phone: '+15550002222' },
    'https://calendly.test/book',
    'track-1'
  );

  assert.equal(result.success, true);
  assert.equal(result.messageSid, 'SM123');
  assert.equal(createdMessages[0].to, '+15550002222');
  assert.equal(createdMessages[0].from, '+15550001111');
  assert.equal(createdMessages[0].statusCallback, 'https://automation.setmymeet.ca/api/sms/status');
  assert.match(createdMessages[0].body, /Dana/);
  assert.match(createdMessages[0].body, /https:\/\/calendly\.test\/book/);
});

test('buildMessagePayload omits status callback when public backend URL is not configured', () => {
  delete process.env.CALL_PUBLIC_BASE_URL;
  delete process.env.BACKEND_URL;
  const service = new TwilioSmsService({ initialize: false });

  assert.deepEqual(service.buildMessagePayload({ body: 'hello' }), { body: 'hello' });
});
