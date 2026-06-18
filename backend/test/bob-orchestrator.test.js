import assert from 'node:assert/strict';
import test from 'node:test';
import { BobOrchestrator } from '../src/services/bob-orchestrator.js';

const orchestrator = new BobOrchestrator();

test('shouldPersistDecision skips non-executable wait decisions', () => {
  assert.equal(orchestrator.shouldPersistDecision({ actionType: 'wait' }), false);
});

test('shouldPersistDecision persists executable outreach and assignment decisions', () => {
  assert.equal(orchestrator.shouldPersistDecision({ actionType: 'request_more_info' }), true);
  assert.equal(orchestrator.shouldPersistDecision({ actionType: 'assign_lead' }), true);
});
