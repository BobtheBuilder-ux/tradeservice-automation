import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldSendPostCallBookingSms, buildCompletedCallActionPatch } from '../src/services/voice-call-outcome-service.js';

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
