import assert from 'node:assert/strict';
import test from 'node:test';
import { ContactPolicyService } from '../src/services/contact-policy-service.js';

const policy = new ContactPolicyService();
const now = new Date('2026-06-15T12:00:00.000Z');

const baseContext = (overrides = {}) => ({
  lead: {
    id: 'lead-1',
    email: 'lead@example.com',
    phone: '+15555550123',
    nextContactAt: null,
    smsOptIn: true,
  },
  conversation: {
    channel: 'email',
    optedOut: false,
    lastOutboundAt: null,
    metadata: {},
  },
  metadata: {},
  hasMeeting: false,
  isOptedOut: false,
  automationPaused: false,
  requiresHumanReview: false,
  hoursSinceLastOutbound: null,
  outboundCount: 0,
  callQueued: false,
  ...overrides,
});

test('allows system actions without contact checks', () => {
  const result = policy.evaluate(baseContext({ isOptedOut: true }), { actionType: 'assign_lead', channel: 'system', now });

  assert.equal(result.allowed, true);
});

test('blocks outreach for opted-out leads', () => {
  const result = policy.evaluate(baseContext({ isOptedOut: true }), { actionType: 'send_booking_invite', channel: 'email', now });

  assert.equal(result.allowed, false);
  assert.equal(result.reasonCode, 'opted_out');
});

test('blocks outreach when automation is paused', () => {
  const result = policy.evaluate(baseContext({ automationPaused: true }), { actionType: 'send_booking_invite', channel: 'email', now });

  assert.equal(result.allowed, false);
  assert.equal(result.reasonCode, 'automation_paused');
});

test('blocks outreach when human review is required', () => {
  const result = policy.evaluate(baseContext({ requiresHumanReview: true }), { actionType: 'send_booking_invite', channel: 'email', now });

  assert.equal(result.allowed, false);
  assert.equal(result.reasonCode, 'human_review_required');
});

test('blocks outreach when a meeting is already scheduled', () => {
  const result = policy.evaluate(baseContext({ hasMeeting: true }), { actionType: 'send_booking_invite', channel: 'email', now });

  assert.equal(result.allowed, false);
  assert.equal(result.reasonCode, 'meeting_scheduled');
});

test('blocks outreach before nextContactAt', () => {
  const result = policy.evaluate(
    baseContext({ lead: { ...baseContext().lead, nextContactAt: '2026-06-15T14:00:00.000Z' } }),
    { actionType: 'send_booking_invite', channel: 'email', now }
  );

  assert.equal(result.allowed, false);
  assert.equal(result.reasonCode, 'next_contact_not_due');
  assert.equal(result.scheduledFor.toISOString(), '2026-06-15T14:00:00.000Z');
});

test('allows outreach when nextContactAt has passed', () => {
  const result = policy.evaluate(
    baseContext({ lead: { ...baseContext().lead, nextContactAt: '2026-06-15T10:00:00.000Z' } }),
    { actionType: 'send_booking_invite', channel: 'email', now }
  );

  assert.equal(result.allowed, true);
});

test('blocks email when latest outbound is inside minimum spacing window', () => {
  const result = policy.evaluate(
    baseContext({ hoursSinceLastOutbound: 2 }),
    { actionType: 'send_booking_reminder', channel: 'email', now }
  );

  assert.equal(result.allowed, false);
  assert.equal(result.reasonCode, 'contact_spacing');
});

test('blocks email after max email attempts', () => {
  const result = policy.evaluate(
    baseContext({ outboundCount: 5, hoursSinceLastOutbound: 30 }),
    { actionType: 'send_booking_reminder', channel: 'email', now }
  );

  assert.equal(result.allowed, false);
  assert.equal(result.reasonCode, 'max_email_attempts');
});

test('blocks SMS when lead has not explicitly opted into SMS', () => {
  const result = policy.evaluate(
    baseContext({ lead: { ...baseContext().lead, smsOptIn: false } }),
    { actionType: 'send_sms_reminder', channel: 'sms', now }
  );

  assert.equal(result.allowed, false);
  assert.equal(result.reasonCode, 'sms_not_allowed');
});

test('blocks SMS when consent is unknown', () => {
  const leadWithoutConsent = { ...baseContext().lead };
  delete leadWithoutConsent.smsOptIn;
  const result = policy.evaluate(
    baseContext({ lead: leadWithoutConsent }),
    { actionType: 'send_sms_reminder', channel: 'sms', now }
  );

  assert.equal(result.allowed, false);
  assert.equal(result.reasonCode, 'sms_not_allowed');
});

test('allows SMS when consent is explicitly stored in metadata', () => {
  const result = policy.evaluate(
    baseContext({ metadata: { smsOptIn: true }, hoursSinceLastOutbound: 30 }),
    { actionType: 'send_sms_reminder', channel: 'sms', now }
  );

  assert.equal(result.allowed, true);
});

test('blocks SMS after max SMS attempts', () => {
  const result = policy.evaluate(
    baseContext({ metadata: { smsCount: 3, smsOptIn: true }, hoursSinceLastOutbound: 30 }),
    { actionType: 'send_sms_reminder', channel: 'sms', now }
  );

  assert.equal(result.allowed, false);
  assert.equal(result.reasonCode, 'max_sms_attempts');
});

test('blocks call when a call is already queued', () => {
  const result = policy.evaluate(
    baseContext({ callQueued: true, hoursSinceLastOutbound: 30 }),
    { actionType: 'queue_call_attempt', channel: 'phone', now }
  );

  assert.equal(result.allowed, false);
  assert.equal(result.reasonCode, 'call_already_queued');
});

test('blocks call after max call attempts', () => {
  const result = policy.evaluate(
    baseContext({ metadata: { callCount: 3 }, hoursSinceLastOutbound: 30 }),
    { actionType: 'queue_call_attempt', channel: 'phone', now }
  );

  assert.equal(result.allowed, false);
  assert.equal(result.reasonCode, 'max_call_attempts');
});

test('blocks call after max queued call attempts from existing executor metadata', () => {
  const result = policy.evaluate(
    baseContext({ metadata: { callQueueCount: 3 }, hoursSinceLastOutbound: 30 }),
    { actionType: 'queue_call_attempt', channel: 'phone', now }
  );

  assert.equal(result.allowed, false);
  assert.equal(result.reasonCode, 'max_call_attempts');
});

test('quiet hours are disabled by default', () => {
  const result = policy.evaluate(
    baseContext({ hoursSinceLastOutbound: 30 }),
    { actionType: 'send_booking_reminder', channel: 'email', now: new Date('2026-06-15T03:00:00.000Z') }
  );

  assert.equal(result.allowed, true);
});

test('quiet hours block outreach when explicitly enabled', () => {
  const quietPolicy = new ContactPolicyService({ quietHoursEnabled: true, quietHoursStart: 21, quietHoursEnd: 8 });
  const result = quietPolicy.evaluate(
    baseContext({ hoursSinceLastOutbound: 30 }),
    { actionType: 'send_booking_reminder', channel: 'email', now: new Date('2026-06-15T03:00:00.000Z') }
  );

  assert.equal(result.allowed, false);
  assert.equal(result.reasonCode, 'quiet_hours');
});
