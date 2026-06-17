import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildFreshEmailDraft,
  normalizeEmailGoal,
  validateFreshEmailDraft,
} from '../src/services/fresh-email-draft-service.js';

test('buildFreshEmailDraft creates a professional booking email with one CTA', () => {
  const draft = buildFreshEmailDraft({
    lead: {
      firstName: 'Sarah',
      serviceInterest: 'business registration',
      email: 'sarah@example.com',
    },
    goal: 'booking_reminder',
    bookingLink: 'https://booking.example.com/sarah',
  });

  assert.equal(draft.emailGoal, 'booking_reminder');
  assert.match(draft.subject, /Sarah/);
  assert.match(draft.bodyText, /Hi Sarah/);
  assert.match(draft.bodyText, /business registration/);
  assert.match(draft.bodyText, /https:\/\/booking\.example\.com\/sarah/);
  assert.match(draft.bodyText, /Best,\nBob\n9QC Inc\./);
});

test('validateFreshEmailDraft blocks opted-out leads and missing email addresses', () => {
  const draft = buildFreshEmailDraft({ lead: { firstName: 'Alex' } });
  const safety = validateFreshEmailDraft(draft, { firstName: 'Alex', optedOut: true });

  assert.equal(safety.approvedForQueue, false);
  assert.deepEqual(safety.errors, [
    'Lead has no email address.',
    'Lead has opted out of outreach.',
  ]);
});

test('validateFreshEmailDraft flags human review without losing draft content', () => {
  const lead = { firstName: 'Maya', email: 'maya@example.com', requiresHumanReview: true };
  const draft = buildFreshEmailDraft({ lead, goal: 'qualification_request' });
  const safety = validateFreshEmailDraft(draft, lead);

  assert.equal(safety.approvedForQueue, false);
  assert.equal(safety.requiresApproval, true);
  assert.equal(safety.errors.length, 0);
  assert.match(safety.warnings[0], /human review/);
});

test('validateFreshEmailDraft blocks guarantee and regulated-advice language', () => {
  const safety = validateFreshEmailDraft(
    {
      subject: 'Guaranteed results',
      bodyText: 'We guarantee success and can provide tax advice.',
      cta: '{{booking_link}}',
    },
    { email: 'lead@example.com' }
  );

  assert.equal(safety.approvedForQueue, false);
  assert.match(safety.errors[0], /regulated-advice/);
});

test('normalizeEmailGoal defaults unknown goals to booking invite', () => {
  assert.equal(normalizeEmailGoal('reactivation'), 'reactivation');
  assert.equal(normalizeEmailGoal('unknown'), 'booking_invite');
});
