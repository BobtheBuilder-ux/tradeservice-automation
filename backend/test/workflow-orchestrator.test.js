import assert from 'node:assert/strict';
import test from 'node:test';
import { WorkflowOrchestrator } from '../workflow-orchestrator.js';

test('legacy workflow processor is disabled by default and does not query workflow_automation', async () => {
  const orchestrator = new WorkflowOrchestrator();
  assert.equal(orchestrator.workflowProcessor.isEnabled(), false);

  const processedCount = await orchestrator.processPendingJobs(50);
  assert.equal(processedCount, 0);

  const workflowResult = await orchestrator.processWorkflow();
  assert.equal(workflowResult.success, true);
  assert.equal(workflowResult.disabled, true);
  assert.equal(workflowResult.errorCount, 0);
});
