import assert from 'node:assert/strict';
import test from 'node:test';
import { VoiceCallScriptService } from '../src/services/voice-call-script-service.js';

const service = new VoiceCallScriptService({ bookingLink: 'https://calendly.test/book' });

test('initialStep greets lead and asks permission before qualification', () => {
  const step = service.initialStep({ firstName: 'Derek' });

  assert.equal(step.step, 'permission');
  assert.match(step.prompt, /Hi Derek/);
  assert.match(step.prompt, /two quick questions/);
});

test('nextStep moves yes permission to service interest question', () => {
  const step = service.nextStep('permission', 'yes, that is fine', {});

  assert.equal(step.step, 'service_interest');
  assert.match(step.prompt, /service/);
  assert.equal(step.done, false);
});

test('nextStep handles not interested and stop replies as terminal opt-out outcomes', () => {
  const step = service.nextStep('permission', 'please stop calling me', {});

  assert.equal(step.step, 'opt_out');
  assert.equal(step.done, true);
  assert.equal(step.outcome, 'opted_out');
});

test('nextStep completes booking offer and requests SMS booking link', () => {
  const step = service.nextStep('booking_offer', 'yes send me the link', {});

  assert.equal(step.step, 'booking_link_requested');
  assert.equal(step.done, true);
  assert.equal(step.outcome, 'send_booking_link');
});
