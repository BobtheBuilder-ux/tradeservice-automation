import assert from 'node:assert/strict';
import test from 'node:test';
import { buildLeadBookingReminderMessage } from '../src/services/sms-message-builder.js';

test('buildLeadBookingReminderMessage guides lead to booking without overpromising', () => {
  const message = buildLeadBookingReminderMessage({
    firstName: 'Maya',
    serviceInterest: 'bookkeeping',
  }, 'https://example.com/book');

  assert.match(message, /^Hi Maya/);
  assert.match(message, /bookkeeping/);
  assert.match(message, /book/);
  assert.match(message, /https:\/\/example\.com\/book/);
  assert.ok(message.length <= 320);
});

test('buildLeadBookingReminderMessage handles missing first name and service interest', () => {
  const message = buildLeadBookingReminderMessage({}, 'https://example.com/book');

  assert.match(message, /^Hi there/);
  assert.match(message, /consultation/);
  assert.match(message, /https:\/\/example\.com\/book/);
  assert.ok(message.length <= 320);
});
