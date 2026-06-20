import logger from '../utils/logger.js';

class FollowUpAutomationService {
  constructor() {
    this.isRunning = false;
  }

  start() {
    this.isRunning = true;
    logger.info('Follow-up automation service started in InsForge-safe compatibility mode');
  }

  stop() {
    this.isRunning = false;
    logger.info('Follow-up automation service stopped');
  }

  async processFollowUps() {
    return {
      success: true,
      processed: 0,
      message: 'Follow-up decisions are handled by Bob/InsForge orchestration',
    };
  }

  async triggerManualFollowUp() {
    return this.processFollowUps();
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      mode: 'insforge-compatible',
    };
  }
}

export default new FollowUpAutomationService();
