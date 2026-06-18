import assert from 'node:assert/strict';
import test from 'node:test';
import {
  shouldSendPostCallBookingSms,
  buildCompletedCallActionPatch,
  buildTerminalCallActionPatch,
} from '../src/services/voice-call-outcome-service.js';

test('shouldSendPostCallBookingSms sends booking link after answered incomplete call', () => {
  const action = {
    result: {
      providerStatus: 'answered',
      currentStep: 'location',
      extracted: { serviceInterest: 'My company' },
    },
  };

  assert.equal(shouldSendPostCallBookingSms(action, 'completed'), true);
});

test('shouldSendPostCallBookingSms does not resend when booking link was already requested', () => {
  const action = { result: { outcome: 'send_booking_link', bookingSmsAttempted: true } };

  assert.equal(shouldSendPostCallBookingSms(action, 'completed'), false);
});

test('buildCompletedCallActionPatch preserves extracted data and marks incomplete call outcome', () => {
  const patch = buildCompletedCallActionPatch({
    action: { result: { currentStep: 'location', extracted: { timeline: 'soon' } } },
    callSid: 'CA123',
    callStatus: 'completed',
    callDuration: '60',
    smsResult: { success: false, error: 'SMS geo permission disabled' },
  });

  assert.equal(patch.status, 'completed');
  assert.equal(patch.result.outcome, 'incomplete_call');
  assert.equal(patch.result.bookingSmsAttempted, true);
  assert.equal(patch.result.bookingSmsSent, false);
  assert.equal(patch.result.bookingSmsError, 'SMS geo permission disabled');
  assert.deepEqual(patch.result.extracted, { timeline: 'soon' });
});

test('buildTerminalCallActionPatch schedules retry below retry limit', () => {
  const now = new Date('2026-06-18T12:00:00.000Z');
  const patch = buildTerminalCallActionPatch({
    action: { result: { currentStep: 'permission' } },
    callSid: 'CA123',
    callStatus: 'no-answer',
    now,
    retryLimit: 2,
    retryDelayMinutes: 30,
  });

  assert.equal(patch.status, 'awaiting_call');
  assert.equal(patch.result.callAttemptCount, 1);
  assert.equal(patch.result.retryExhausted, false);
  assert.equal(patch.result.nextRetryAt, '2026-06-18T12:30:00.000Z');
  assert.equal(patch.scheduledFor.toISOString(), '2026-06-18T12:30:00.000Z');
});

test('buildTerminalCallActionPatch sends action to human review after retry limit', () => {
  const now = new Date('2026-06-18T12:00:00.000Z');
  const patch = buildTerminalCallActionPatch({
    action: { result: { callAttemptCount: 1 } },
    callSid: 'CA123',
    callStatus: 'busy',
    now,
    retryLimit: 2,
  });

  assert.equal(patch.status, 'completed');
  assert.equal(patch.scheduledFor, null);
  assert.equal(patch.executedAt, now);
  assert.equal(patch.result.callAttemptCount, 2);
  assert.equal(patch.result.outcome, 'needs_human_review');
  assert.equal(patch.result.retryExhausted, true);
});
