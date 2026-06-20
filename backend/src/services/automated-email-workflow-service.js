import logger from '../utils/logger.js';

class AutomatedEmailWorkflowService {
  constructor() {
    this.isRunning = false;
  }

  startContinuousMonitoring() {
    this.isRunning = true;
    logger.info('Automated email workflow service started in InsForge-safe compatibility mode');
  }

  stopContinuousMonitoring() {
    this.isRunning = false;
    logger.info('Automated email workflow service stopped');
  }

  async initializeLeadEmailWorkflow(leadId, trackingId) {
    return {
      success: true,
      leadId,
      trackingId,
      workflowsCreated: [],
      message: 'Email workflow is handled by Bob/InsForge orchestration',
    };
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      mode: 'insforge-compatible',
    };
  }
}

export default new AutomatedEmailWorkflowService();
