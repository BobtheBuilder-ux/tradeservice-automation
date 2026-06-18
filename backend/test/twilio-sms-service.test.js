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
