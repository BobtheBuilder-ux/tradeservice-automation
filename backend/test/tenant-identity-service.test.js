import assert from 'node:assert/strict';
import test from 'node:test';
import {
  validateBookingIntegrationInput,
  validateEmailIdentityInput,
  validateTenantAgentInput,
} from '../src/services/tenant-identity-service.js';

test('validateTenantAgentInput requires a display name by default', () => {
  assert.throws(() => validateTenantAgentInput({ displayName: '   ' }), /Agent name is required/);

  const values = validateTenantAgentInput({
    displayName: ' Sarah ',
    status: 'testing',
    voiceId: ' voice-1 ',
    metadata: { tone: 'friendly' },
  });

  assert.equal(values.displayName, 'Sarah');
  assert.equal(values.status, 'testing');
  assert.equal(values.voiceId, 'voice-1');
  assert.deepEqual(values.metadata, { tone: 'friendly' });
});

test('validateTenantAgentInput rejects unknown statuses', () => {
  assert.throws(() => validateTenantAgentInput({ displayName: 'Bob', status: 'deleted' }), /Invalid agent status/);
});

test('validateEmailIdentityInput normalizes and validates sender details', () => {
  const values = validateEmailIdentityInput({
    fromName: '  Bob Automation ',
    fromEmail: ' OWNER@Example.COM ',
    replyToEmail: ' bookings@example.com ',
  });

  assert.equal(values.fromName, 'Bob Automation');
  assert.equal(values.fromEmail, 'owner@example.com');
  assert.equal(values.replyToEmail, 'bookings@example.com');
  assert.equal(values.provider, 'platform');
  assert.equal(values.verifiedStatus, 'unverified');
  assert.equal(values.status, 'active');
});

test('validateEmailIdentityInput rejects invalid sender emails', () => {
  assert.throws(() => validateEmailIdentityInput({ fromName: 'Owner', fromEmail: 'nope' }), /valid sender email/);
  assert.throws(
    () => validateEmailIdentityInput({ fromName: 'Owner', fromEmail: 'owner@example.com', replyToEmail: 'bad' }),
    /Reply-to email/
  );
});

test('validateBookingIntegrationInput requires enough provider setup to connect', () => {
  assert.throws(() => validateBookingIntegrationInput({ provider: 'manual' }), /Manual booking/);
  assert.throws(() => validateBookingIntegrationInput({ provider: 'calendly' }), /Calendly setup/);

  const manual = validateBookingIntegrationInput({
    provider: 'manual',
    bookingUrl: ' https://example.com/book ',
    defaultMeetingType: 'phone',
  });

  assert.equal(manual.provider, 'manual');
  assert.equal(manual.status, 'connected');
  assert.equal(manual.bookingUrl, 'https://example.com/book');
});
