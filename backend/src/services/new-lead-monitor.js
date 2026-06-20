import logger from '../utils/logger.js';

class NewLeadMonitor {
  constructor() {
    this.isRunning = false;
    this.intervalMinutes = 2;
    this.stats = {
      totalChecks: 0,
      totalProcessed: 0,
      lastCheckAt: null,
      lastError: null,
    };
  }

  start() {
    this.isRunning = true;
    logger.info('New lead monitor started in InsForge-safe compatibility mode');
  }

  stop() {
    this.isRunning = false;
    logger.info('New lead monitor stopped');
  }

  async triggerCheck() {
    this.stats.totalChecks += 1;
    this.stats.lastCheckAt = new Date().toISOString();
    return [];
  }

  async healthCheck() {
    return {
      status: this.isRunning ? 'healthy' : 'disabled',
      warnings: [],
      lastCheckAt: this.stats.lastCheckAt,
    };
  }

  getStats() {
    return {
      ...this.stats,
      isRunning: this.isRunning,
      intervalMinutes: this.intervalMinutes,
    };
  }
}

export default NewLeadMonitor;
