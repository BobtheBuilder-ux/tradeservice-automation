import assert from 'node:assert/strict';
import test from 'node:test';
import { EmailService } from '../src/services/email-service.js';

test('formatFromAddress accepts plain email with sender name', () => {
  assert.equal(
    EmailService.formatFromAddress('hello@example.com', 'Bob'),
    'Bob <hello@example.com>'
  );
});

test('formatFromAddress preserves already formatted sender', () => {
  assert.equal(
    EmailService.formatFromAddress('9QC Inc. <hello@example.com>', 'Bob'),
    '9QC Inc. <hello@example.com>'
  );
});

test('formatFromAddress falls back to plain email when sender name is blank', () => {
  assert.equal(
    EmailService.formatFromAddress('hello@example.com', ''),
    'hello@example.com'
  );
});

test('formatFromAddress rejects invalid EMAIL_FROM values before provider call', () => {
  assert.throws(
    () => EmailService.formatFromAddress('not an email', 'Bob'),
    /Invalid EMAIL_FROM format/
  );
});
