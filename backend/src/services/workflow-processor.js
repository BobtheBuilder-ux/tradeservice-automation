import logger from '../utils/logger.js';

class WorkflowProcessor {
  isEnabled() {
    return false;
  }

  disabledResult() {
    return {
      disabled: true,
      processedCount: 0,
      successCount: 0,
      errorCount: 0,
      message: 'Legacy workflow processing disabled',
    };
  }

  async processLead(leadId) {
    logger.info('Legacy workflow lead initialization skipped; Bob/InsForge orchestration is active', { leadId });
    return this.disabledResult();
  }

  async processWorkflow() {
    logger.info('Legacy workflow processor skipped; Bob/InsForge orchestration is active');
    return {
      success: true,
      ...this.disabledResult(),
    };
  }

  async processBatch() {
    return this.disabledResult();
  }

  async processPendingJobs() {
    return 0;
  }

  async getLeadStatus(leadId) {
    return {
      leadId,
      ...this.disabledResult(),
    };
  }
}

export default new WorkflowProcessor();
