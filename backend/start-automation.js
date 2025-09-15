#!/usr/bin/env node
/**
 * Automation Startup Script
 * Initializes the database and starts the automated workflow system
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from './src/utils/logger.js';
import { supabase } from './src/config/index.js';
import pkg from 'uuid';
const { v4: uuidv4 } = pkg;

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class AutomationStarter {
  constructor() {
    this.trackingId = uuidv4();
  }

  /**
   * Initialize and start the automation system
   */
  async start() {
    try {
      logger.info('Starting Automation System Initialization', {
        trackingId: this.trackingId
      });

      // Step 1: Check database connection
      await this.checkDatabaseConnection();

      // Step 2: Run database migrations
      await this.runMigrations();

      // Step 3: Initialize system configuration
      await this.initializeSystemConfig();

      // Step 4: Verify automation setup
      await this.verifyAutomationSetup();

      // Step 5: Start the workflow daemon
      await this.startWorkflowDaemon();

      logger.info('Automation System started successfully', {
        trackingId: this.trackingId
      });

    } catch (error) {
      logger.logError(error, {
        context: 'automation_startup_failed',
        trackingId: this.trackingId
      });
      process.exit(1);
    }
  }

  /**
   * Check database connection
   */
  async checkDatabaseConnection() {
    try {
      logger.info('Checking database connection...', {
        trackingId: this.trackingId
      });

      const { data, error } = await supabase
        .from('leads')
        .select('id')
        .limit(1);

      if (error) {
        throw new Error(`Database connection failed: ${error.message}`);
      }

      logger.info('Database connection verified', {
        trackingId: this.trackingId
      });

    } catch (error) {
      throw new Error(`Database connection check failed: ${error.message}`);
    }
  }

  /**
   * Run database migrations
   */
  async runMigrations() {
    try {
      logger.info('Running database migrations...', {
        trackingId: this.trackingId
      });

      // Check if Supabase CLI is available
      try {
        await execAsync('which supabase');
      } catch (error) {
        logger.warn('Supabase CLI not found, skipping migrations', {
          trackingId: this.trackingId
        });
        return;
      }

      // Run migrations
      const { stdout, stderr } = await execAsync('supabase db push', {
        cwd: __dirname
      });

      if (stderr && !stderr.includes('warning')) {
        throw new Error(`Migration failed: ${stderr}`);
      }

      logger.info('Database migrations completed', {
        trackingId: this.trackingId,
        output: stdout
      });

    } catch (error) {
      // Don't fail if migrations can't run - the system might still work
      logger.warn('Migration step failed, continuing...', {
        trackingId: this.trackingId,
        error: error.message
      });
    }
  }

  /**
   * Initialize system configuration
   */
  async initializeSystemConfig() {
    try {
      logger.info('Initializing system configuration...', {
        trackingId: this.trackingId
      });

      // Check if system_config table exists
      const { data: tables, error: tablesError } = await supabase
        .rpc('get_table_info', { table_name: 'system_config' });

      if (tablesError) {
        logger.warn('system_config table not found, creating basic config', {
          trackingId: this.trackingId
        });
        return;
      }

      // Set default configuration values
      const defaultConfigs = [
        {
          key: 'workflow_automation_enabled',
          value: 'true',
          description: 'Enable/disable workflow automation'
        },
        {
          key: 'email_automation_enabled',
          value: 'true',
          description: 'Enable/disable email automation'
        },
        {
          key: 'sms_automation_enabled',
          value: 'true',
          description: 'Enable/disable SMS automation'
        },
        {
          key: 'meeting_monitoring_enabled',
          value: 'true',
          description: 'Enable/disable meeting monitoring'
        },
        {
          key: 'automation_batch_size',
          value: '10',
          description: 'Number of jobs to process in each batch'
        },
        {
          key: 'automation_interval_ms',
          value: '30000',
          description: 'Interval between automation runs in milliseconds'
        }
      ];

      for (const config of defaultConfigs) {
        await supabase
          .from('system_config')
          .upsert(config, { onConflict: 'key' });
      }

      logger.info('System configuration initialized', {
        trackingId: this.trackingId,
        configCount: defaultConfigs.length
      });

    } catch (error) {
      logger.warn('System configuration initialization failed', {
        trackingId: this.trackingId,
        error: error.message
      });
    }
  }

  /**
   * Verify automation setup
   */
  async verifyAutomationSetup() {
    try {
      logger.info('Verifying automation setup...', {
        trackingId: this.trackingId
      });

      // Check if workflow_automation table exists
      const { data, error } = await supabase
        .from('workflow_automation')
        .select('id')
        .limit(1);

      if (error) {
        throw new Error(`Workflow automation table not found: ${error.message}`);
      }

      // Check for required environment variables
      const requiredEnvVars = [
        'SUPABASE_URL',
        'SUPABASE_ANON_KEY'
      ];

      const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
      
      if (missingVars.length > 0) {
        logger.warn('Missing environment variables', {
          trackingId: this.trackingId,
          missingVars
        });
      }

      logger.info('Automation setup verified', {
        trackingId: this.trackingId
      });

    } catch (error) {
      throw new Error(`Automation setup verification failed: ${error.message}`);
    }
  }

  /**
   * Start the workflow daemon
   */
  async startWorkflowDaemon() {
    try {
      logger.info('Starting workflow daemon...', {
        trackingId: this.trackingId
      });

      // Import and start the daemon
      const WorkflowDaemon = (await import('./workflow-daemon.js')).default;
      const daemon = new WorkflowDaemon();
      
      await daemon.start();

      logger.info('Workflow daemon started successfully', {
        trackingId: this.trackingId
      });

    } catch (error) {
      throw new Error(`Failed to start workflow daemon: ${error.message}`);
    }
  }

  /**
   * Stop the automation system
   */
  async stop() {
    try {
      logger.info('Stopping automation system...', {
        trackingId: this.trackingId
      });

      // The daemon handles its own shutdown via signal handlers
      process.kill(process.pid, 'SIGTERM');

    } catch (error) {
      logger.logError(error, {
        context: 'automation_stop_failed',
        trackingId: this.trackingId
      });
    }
  }
}

// CLI handling
if (import.meta.url === `file://${process.argv[1]}`) {
  const starter = new AutomationStarter();
  
  const command = process.argv[2];
  
  switch (command) {
    case 'start':
      starter.start();
      break;
    case 'stop':
      starter.stop();
      break;
    case 'init':
      // Just run initialization without starting daemon
      starter.checkDatabaseConnection()
        .then(() => starter.runMigrations())
        .then(() => starter.initializeSystemConfig())
        .then(() => starter.verifyAutomationSetup())
        .then(() => {
          console.log('✅ Automation system initialized successfully');
          process.exit(0);
        })
        .catch((error) => {
          console.error('❌ Initialization failed:', error.message);
          process.exit(1);
        });
      break;
    default:
      console.log(`
🚀 Automation System Starter
`);
      console.log('Usage:');
      console.log('  node start-automation.js start   # Initialize and start automation');
      console.log('  node start-automation.js init    # Initialize system only');
      console.log('  node start-automation.js stop    # Stop automation system');
      console.log('');
      console.log('What this does:');
      console.log('  🔧 Checks database connection');
      console.log('  📊 Runs database migrations');
      console.log('  ⚙️  Initializes system configuration');
      console.log('  ✅ Verifies automation setup');
      console.log('  🤖 Starts workflow daemon');
      console.log('');
      console.log('The automation system will:');
      console.log('  📧 Send emails automatically when leads are created');
      console.log('  📱 Dispatch SMS reminders');
      console.log('  📅 Monitor meeting schedules');
      console.log('  🔄 Handle all workflow processes in background');
      console.log('');
      console.log('To run in background:');
      console.log('  nohup node start-automation.js start > automation.log 2>&1 &');
      console.log('');
      process.exit(0);
  }
}

export default AutomationStarter;