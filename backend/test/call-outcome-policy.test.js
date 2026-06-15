import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCallOutcomeLeadPatch, CALL_OUTCOMES, isValidCallOutcome } from '../src/services/call-outcome-policy.js';

const now = new Date('2026-06-15T12:00:00.000Z');

test('CALL_OUTCOMES includes dashboard-supported outcomes', () => {
  assert.deepEqual(CALL_OUTCOMES, [
    'booked',
    'no_answer',
    'callback_requested',
    'wrong_number',
    'not_interested',
    'needs_human_follow_up',
  ]);
});

test('isValidCallOutcome accepts supported outcomes only', () => {
  assert.equal(isValidCallOutcome('booked'), true);
  assert.equal(isValidCallOutcome('bad_value'), false);
});

test('booked outcome marks lead as scheduled and clears human review', () => {
  const patch = buildCallOutcomeLeadPatch('booked', now);

  assert.equal(patch.status, 'scheduled');
  assert.equal(patch.leadStage, 'booked');
  assert.equal(patch.schedulingState, 'scheduled');
  assert.equal(patch.requiresHumanReview, false);
  assert.equal(patch.nextContactAt, null);
  assert.equal(patch.escalationReason, null);
});

test('no answer outcome schedules another follow-up in 24 hours', () => {
  const patch = buildCallOutcomeLeadPatch('no_answer', now);

  assert.equal(patch.status, 'contacted');
  assert.equal(patch.leadStage, 'nurturing');
  assert.equal(patch.schedulingState, 'needs_follow_up');
  assert.equal(patch.requiresHumanReview, false);
  assert.equal(patch.nextContactAt.toISOString(), '2026-06-16T12:00:00.000Z');
});

test('wrong number outcome escalates for human review', () => {
  const patch = buildCallOutcomeLeadPatch('wrong_number', now);

  assert.equal(patch.leadStage, 'escalated');
  assert.equal(patch.requiresHumanReview, true);
  assert.equal(patch.escalationReason, 'wrong_phone_number');
});

test('not interested outcome closes the lead', () => {
  const patch = buildCallOutcomeLeadPatch('not_interested', now);

  assert.equal(patch.status, 'closed');
  assert.equal(patch.leadStage, 'closed_lost');
  assert.equal(patch.schedulingState, 'not_interested');
});

test('unsupported outcome throws', () => {
  assert.throws(() => buildCallOutcomeLeadPatch('bad_value', now), /Unsupported call outcome/);
});
