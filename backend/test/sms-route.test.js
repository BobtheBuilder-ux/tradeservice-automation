import assert from 'node:assert/strict';
import test from 'node:test';
import { isStopReply } from '../src/routes/sms.js';

test('isStopReply detects opt-out SMS language', () => {
  assert.equal(isStopReply('STOP'), true);
  assert.equal(isStopReply('please do not contact me again'), true);
  assert.equal(isStopReply('yes send the booking link'), false);
});
