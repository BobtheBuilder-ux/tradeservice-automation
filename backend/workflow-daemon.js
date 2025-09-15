#!/usr/bin/env node
/**
 * Workflow Automation Daemon
 * Starts and manages the automated workflow processor
 * Runs continuously in the background to handle all lead automation
 */

import workflowProcessor from './src/services/workflow-processor.js';
import logger from './src/utils/logger.js';
import { supabase } from './src/config/index.js';
import pkg from 'uuid';
const { v4: uuidv4 } = pkg;

class WorkflowDaemon {
  constructor() {
    this.isRunning = false;
    this.trackingId = uuidv4();
    this.healthCheckInterval = null;
    this.cleanupInterval = null;
    this.startTime = new Date();
    this.processedJobs = 0;
    this.failedJobs = 0;
  }

  /**
   * Start the workflow daemon
   */
  async start() {
    try {
      logger.info('Starting Workflow Automation Daemon', {
        trackingId: this.trackingId,
        startTime: this.startTime,
        processId: process.pid
      });

      // Check if automation is enabled
      const isEnabled = await this.checkAutomationEnabled();
      if (!isEnabled) {
        logger.info('Workflow automation is disabled in system configuration', {
          trackingId: this.trackingId
        });
        process.exit(0);
      }

      // Setup graceful shutdown handlers
      this.setupShutdownHandlers();

      // Start the workflow processor
      await workflowProcessor.start();

      // Start health monitoring
      this.startHealthMonitoring();

      // Start cleanup tasks
      this.startCleanupTasks();

      this.isRunning = true;

      logger.info('Workflow Automation Daemon started successfully', {
        trackingId: this.trackingId,
        processorStatus: workflowProcessor.getStatus()
      });

      // Keep the process alive
      this.keepAlive();

    } catch (error) {
      logger.logError(error, {
        context: 'workflow_daemon_startup',
        trackingId: this.trackingId
      });
      process.exit(1);
    }
  }

  /**
   * Stop the workflow daemon
   */
  async stop() {
    if (!this.isRunning) {
      return;
    }

    logger.info('Stopping Workflow Automation Daemon', {
      trackingId: this.trackingId,
      uptime: Date.now() - this.startTime.getTime(),
      processedJobs: this.processedJobs,
      failedJobs: this.failedJobs
    });

    this.isRunning = false;

    // Stop health monitoring
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    // Stop cleanup tasks
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // Stop workflow processor
    await workflowProcessor.stop();

    logger.info('Workflow Automation Daemon stopped', {
      trackingId: this.trackingId
    });
  }

  /**
   * Check if workflow automation is enabled
   */
  async checkAutomationEnabled() {
    try {
      const { data, error } = await supabase
        .from('system_config')
        .select('value')
        .eq('key', 'workflow_automation_enabled')
        .single();

      if (error) {
        logger.logError(error, {
          context: 'check_automation_enabled',
          trackingId: this.trackingId
        });
        return true; // Default to enabled if can't check
      }

      return data.value === 'true' || data.value === true;
    } catch (error) {
      logger.logError(error, {
        context: 'check_automation_enabled',
        trackingId: this.trackingId
      });
      return true; // Default to enabled
    }
  }

  /**
   * Setup graceful shutdown handlers
   */
  setupShutdownHandlers() {
    const shutdown = async (signal) => {
      logger.info(`Received ${signal}, shutting down gracefully`, {
        trackingId: this.trackingId
      });
      await this.stop();
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGUSR2', () => shutdown('SIGUSR2')); // For nodemon

    process.on('uncaughtException', (error) => {
      logger.logError(error, {
        context: 'uncaught_exception',
        trackingId: this.trackingId
      });
      this.stop().then(() => process.exit(1));
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.logError(new Error(`Unhandled Rejection: ${reason}`), {
        context: 'unhandled_rejection',
        trackingId: this.trackingId,
        promise: promise.toString()
      });
    });
  }

  /**
   * Start health monitoring
   */
  startHealthMonitoring() {
    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.performHealthCheck();
      } catch (error) {
        logger.logError(error, {
          context: 'health_check',
          trackingId: this.trackingId
        });
      }
    }, 60000); // Every minute
  }

  /**
   * Perform health check
   */
  async performHealthCheck() {
    try {
      // Check database connectivity
      const { data, error } = await supabase
        .from('system_config')
        .select('key')
        .limit(1);

      if (error) throw error;

      // Check workflow processor status
      const processorStatus = workflowProcessor.getStatus();
      
      // Get pending jobs count
      const { data: pendingJobs, error: jobsError } = await supabase
        .from('workflow_automation')
        .select('id', { count: 'exact' })
        .eq('status', 'pending')
        .lte('scheduled_at', new Date().toISOString());

      if (jobsError) throw jobsError;

      const healthStatus = {
        daemon: {
          isRunning: this.isRunning,
          uptime: Date.now() - this.startTime.getTime(),
          processedJobs: this.processedJobs,
          failedJobs: this.failedJobs
        },
        processor: processorStatus,
        database: {
          connected: true,
          pendingJobs: pendingJobs?.length || 0
        },
        timestamp: new Date().toISOString()
      };

      logger.info('Health check completed', {
        trackingId: this.trackingId,
        health: healthStatus
      });

      // Alert if too many pending jobs
      if (pendingJobs?.length > 100) {
        logger.warn('High number of pending workflow jobs detected', {
          trackingId: this.trackingId,
          pendingJobsCount: pendingJobs.length
        });
      }

    } catch (error) {
      logger.logError(error, {
        context: 'health_check_failed',
        trackingId: this.trackingId
      });
    }
  }

  /**
   * Start cleanup tasks
   */
  startCleanupTasks() {
    // Run cleanup every 6 hours
    this.cleanupInterval = setInterval(async () => {
      try {
        await this.performCleanup();
      } catch (error) {
        logger.logError(error, {
          context: 'cleanup_task',
          trackingId: this.trackingId
        });
      }
    }, 6 * 60 * 60 * 1000); // 6 hours
  }

  /**
   * Perform cleanup tasks
   */
  async performCleanup() {
    try {
      logger.info('Starting cleanup tasks', {
        trackingId: this.trackingId
      });

      // Clean up old workflow jobs
      const { data: deletedCount, error } = await supabase
        .rpc('cleanup_old_workflow_jobs');

      if (error) throw error;

      logger.info('Cleanup completed', {
        trackingId: this.trackingId,
        deletedWorkflowJobs: deletedCount
      });

    } catch (error) {
      logger.logError(error, {
        context: 'cleanup_failed',
        trackingId: this.trackingId
      });
    }
  }

  /**
   * Keep the process alive
   */
  keepAlive() {
    // Log status every hour
    setInterval(() => {
      if (this.isRunning) {
        logger.info('Workflow daemon status', {
          trackingId: this.trackingId,
          uptime: Date.now() - this.startTime.getTime(),
          processedJobs: this.processedJobs,
          failedJobs: this.failedJobs,
          processorStatus: workflowProcessor.getStatus()
        });
      }
    }, 60 * 60 * 1000); // Every hour
  }

  /**
   * Get daemon status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      startTime: this.startTime,
      uptime: Date.now() - this.startTime.getTime(),
      processedJobs: this.processedJobs,
      failedJobs: this.failedJobs,
      trackingId: this.trackingId,
      processor: workflowProcessor.getStatus()
    };
  }
}

// CLI handling
if (import.meta.url === `file://${process.argv[1]}`) {
  const daemon = new WorkflowDaemon();
  
  const command = process.argv[2];
  
  switch (command) {
    case 'start':
      daemon.start();
      break;
    case 'status':
      console.log('Workflow Daemon Status:', daemon.getStatus());
      break;
    case 'test':
      // Test mode - run for 30 seconds then exit
      daemon.start().then(() => {
        setTimeout(async () => {
          console.log('Test completed, stopping daemon...');
          await daemon.stop();
          process.exit(0);
        }, 30000);
      });
      break;
    default:
      console.log(`
🤖 Workflow Automation Daemon
`);
      console.log('Usage:');
      console.log('  node workflow-daemon.js start    # Start the daemon');
      console.log('  node workflow-daemon.js status   # Show daemon status');
      console.log('  node workflow-daemon.js test     # Test run for 30 seconds');
      console.log('');
      console.log('The daemon will:');
      console.log('  ✅ Automatically process new leads');
      console.log('  📧 Send scheduled emails and reminders');
      console.log('  📱 Dispatch SMS notifications');
      console.log('  📅 Monitor meeting schedules');
      console.log('  🔄 Handle all workflow automation');
      console.log('');
      console.log('To run in background:');
      console.log('  nohup node workflow-daemon.js start > workflow.log 2>&1 &');
      console.log('');
      process.exit(0);
  }
}

export default WorkflowDaemon;