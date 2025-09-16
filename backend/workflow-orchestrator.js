import logger from './utils/logger.js';
import workflowProcessor from './src/services/workflow-processor.js';

/**
 * WorkflowOrchestrator class manages the overall workflow processing
 * for lead automation, including initialization, processing, and status tracking.
 */
export class WorkflowOrchestrator {
  constructor() {
    this.workflowProcessor = workflowProcessor;
    this.isRunning = false;
    this.processingInterval = null;
    this.intervalMs = 2 * 60 * 1000; // 5 minutes
  }

  /**
   * Initialize workflow for a specific lead
   * @param {string} leadId - The lead ID to initialize workflow for
   * @returns {Promise<Object>} - Result of workflow initialization
   */
  async initializeWorkflow(leadId) {
    try {
      logger.info(`🔄 Initializing workflow for lead: ${leadId}`);
      
      const result = await this.workflowProcessor.processLead(leadId);
      
      logger.info(`✅ Workflow initialized successfully for lead: ${leadId}`, {
        leadId,
        result
      });
      
      return {
        success: true,
        leadId,
        result
      };
    } catch (error) {
      logger.error(`❌ Failed to initialize workflow for lead: ${leadId}`, {
        leadId,
        error: error.message,
        stack: error.stack
      });
      
      return {
        success: false,
        leadId,
        error: error.message
      };
    }
  }

  /**
   * Process workflow for all pending leads
   * @returns {Promise<Object>} - Result of workflow processing
   */
  async processWorkflow() {
    try {
      logger.info('🔄 Starting workflow processing for all pending leads');
      
      const result = await this.workflowProcessor.processBatch();
      
      logger.info('✅ Workflow processing completed', {
        processedCount: result.processedCount || 0,
        successCount: result.successCount || 0,
        errorCount: result.errorCount || 0
      });
      
      return {
        success: true,
        ...result
      };
    } catch (error) {
      logger.error('❌ Failed to process workflow', {
        error: error.message,
        stack: error.stack
      });
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Process pending jobs with optional batch size
   * @param {number} batchSize - Number of jobs to process
   * @returns {Promise<number>} - Number of jobs processed
   */
  async processPendingJobs(batchSize = 50) {
    try {
      logger.info(`🔄 Processing pending jobs with batch size: ${batchSize}`);
      
      // Set batch size on processor if provided
      if (batchSize) {
        this.workflowProcessor.batchSize = batchSize;
      }
      
      const result = await this.workflowProcessor.processBatch();
      const processedCount = result.processedCount || 0;
      
      logger.info(`✅ Processed ${processedCount} pending jobs`);
      
      return processedCount;
    } catch (error) {
      logger.error('❌ Failed to process pending jobs', {
        error: error.message,
        stack: error.stack
      });
      
      return 0;
    }
  }

  /**
   * Get workflow status for a specific lead
   * @param {string} leadId - The lead ID to get status for
   * @returns {Promise<Object>} - Lead workflow status
   */
  async getWorkflowStatus(leadId) {
    try {
      logger.info(`📊 Getting workflow status for lead: ${leadId}`);
      
      const status = await this.workflowProcessor.getLeadStatus(leadId);
      
      return {
        success: true,
        leadId,
        status
      };
    } catch (error) {
      logger.error(`❌ Failed to get workflow status for lead: ${leadId}`, {
        leadId,
        error: error.message,
        stack: error.stack
      });
      
      return {
        success: false,
        leadId,
        error: error.message
      };
    }
  }

  /**
   * Start continuous workflow processing
   * @returns {Promise<Object>} - Result of starting continuous processing
   */
  async startContinuousProcessing() {
    try {
      if (this.isRunning) {
        logger.warn('⚠️ Continuous workflow processing is already running');
        return {
          success: false,
          message: 'Continuous processing is already running'
        };
      }

      this.isRunning = true;
      
      // Start the processing interval
      this.processingInterval = setInterval(async () => {
        if (this.isRunning) {
          await this.processWorkflow();
        }
      }, this.intervalMs);
      
      logger.info(`🚀 Started continuous workflow processing (${this.intervalMs / 1000}s intervals)`);
      
      return {
        success: true,
        message: 'Continuous workflow processing started',
        intervalMs: this.intervalMs
      };
    } catch (error) {
      logger.error('❌ Failed to start continuous workflow processing', {
        error: error.message,
        stack: error.stack
      });
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Stop continuous workflow processing
   * @returns {Object} - Result of stopping continuous processing
   */
  stopContinuousProcessing() {
    try {
      if (!this.isRunning) {
        logger.warn('⚠️ Continuous workflow processing is not running');
        return {
          success: false,
          message: 'Continuous processing is not running'
        };
      }

      this.isRunning = false;
      
      if (this.processingInterval) {
        clearInterval(this.processingInterval);
        this.processingInterval = null;
      }
      
      logger.info('🛑 Stopped continuous workflow processing');
      
      return {
        success: true,
        message: 'Continuous workflow processing stopped'
      };
    } catch (error) {
      logger.error('❌ Failed to stop continuous workflow processing', {
        error: error.message,
        stack: error.stack
      });
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get the current status of the workflow orchestrator
   * @returns {Object} - Current orchestrator status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      intervalMs: this.intervalMs,
      hasInterval: !!this.processingInterval
    };
  }

  /**
   * Cleanup resources when shutting down
   */
  cleanup() {
    logger.info('🧹 Cleaning up WorkflowOrchestrator resources');
    this.stopContinuousProcessing();
  }
}

export default WorkflowOrchestrator;