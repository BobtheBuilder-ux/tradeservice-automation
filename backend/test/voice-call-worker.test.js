import assert from 'node:assert/strict';
import test from 'node:test';
import { VoiceCallWorker } from '../src/services/voice-call-worker.js';

function buildWorker({ actions, activeCalls = [], maxConcurrentCalls = 2, enabled = true }) {
  const started = [];
  const updates = [];
  const dataService = {
    getQueuedCallActions: async () => actions,
    getActiveVoiceCallActions: async () => activeCalls,
    getLeadById: async (leadId) => ({ id: leadId, phone: '+155****1111', firstName: 'Test' }),
    getConversationById: async (conversationId) => ({ id: conversationId, metadata: {} }),
    updateBobAction: async (actionId, patch) => {
      updates.push({ actionId, patch });
      return { id: actionId, ...patch };
    },
  };
  const voiceService = {
    startOutboundCall: async ({ action, lead }) => {
      started.push({ actionId: action.id, phone: lead.phone });
      return { success: true, callSid: `CA${action.id}` };
    },
  };
  const worker = new VoiceCallWorker({ dataService, voiceService, maxConcurrentCalls, enabled });
  return { worker, started, updates };
}

test('processQueuedCalls does not start calls when disabled', async () => {
  const { worker, started } = buildWorker({
    enabled: false,
    actions: [{ id: '1', leadId: 'lead-1', conversationId: 'conv-1', actionType: 'queue_call_attempt' }],
  });

  const result = await worker.processQueuedCalls();

  assert.equal(result.disabled, true);
  assert.equal(result.started, 0);
  assert.equal(started.length, 0);
});

test('processQueuedCalls respects max concurrent call limit', async () => {
  const { worker, started } = buildWorker({
    activeCalls: [{ id: 'existing' }],
    maxConcurrentCalls: 2,
    actions: [
      { id: '1', leadId: 'lead-1', conversationId: 'conv-1', actionType: 'queue_call_attempt' },
      { id: '2', leadId: 'lead-2', conversationId: 'conv-2', actionType: 'queue_call_attempt' },
    ],
  });

  const result = await worker.processQueuedCalls();

  assert.equal(result.started, 1);
  assert.equal(started.length, 1);
  assert.equal(started[0].actionId, '1');
});

test('processQueuedCalls marks actions failed when lead has no phone', async () => {
  const updates = [];
  const worker = new VoiceCallWorker({
    maxConcurrentCalls: 2,
    enabled: true,
    voiceService: { startOutboundCall: async () => { throw new Error('should not call'); } },
    dataService: {
      getQueuedCallActions: async () => [{ id: '1', leadId: 'lead-1', conversationId: 'conv-1', actionType: 'queue_call_attempt' }],
      getActiveVoiceCallActions: async () => [],
      getLeadById: async () => ({ id: 'lead-1', phone: null }),
      getConversationById: async () => ({ id: 'conv-1', metadata: {} }),
      updateBobAction: async (actionId, patch) => {
        updates.push({ actionId, patch });
        return { id: actionId, ...patch };
      },
    },
  });

  const result = await worker.processQueuedCalls();

  assert.equal(result.failed, 1);
  assert.equal(updates[0].patch.status, 'failed');
  assert.match(updates[0].patch.result.error, /phone/);
});
