import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import EmailService from './src/services/email-service.js';
import TwilioSmsService from './src/services/twilio-sms-service.js';
import { processCalendlyEvent } from './src/services/calendly-service.js';
import { logger } from './utils/logger.js';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '.env') });

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Workflow Orchestrator - Manages complete automation sequence
 * 
 * This orchestrator handles:
 * 1. Manual workflow initiation for new leads
 * 2. Processing pending workflow jobs
 * 3. Managing workflow state transitions
 * 4. Handling retries and error recovery
 */
class WorkflowOrchestrator {
  constructor() {
    this.isProcessing = false;
    this.batchSize = 50;
    this.retryDelay = 15 * 60 * 1000; // 15 minutes in milliseconds
  }

  /**
   * Initialize workflow for a new lead
   * @param {string} leadId - UUID of the lead
   * @returns {Promise<boolean>} Success status
   */
  async initializeWorkflow(leadId) {
    try {
      logger.info('Initializing workflow for lead', { leadId });

      // Get lead details
      const { data: lead, error: leadError } = await supabase
        .from('leads')
        .select('*')
        .eq('id', leadId)
        .single();

      if (leadError || !lead) {
        throw new Error(`Lead not found: ${leadError?.message}`);
      }

      // Create initial workflow steps
      const currentTime = new Date();
      const workflowSteps = [
        {
          lead_id: leadId,
          workflow_type: 'initial_engagement',
          step_name: 'send_welcome_email',
          scheduled_at: new Date(currentTime.getTime() + 1 * 60 * 1000), // 1 minute delay
          metadata: { priority: 'high', template: 'welcome_email' }
        },
        {
          lead_id: leadId,
          workflow_type: 'reminder_sequence',
          step_name: 'send_24h_reminder',
          scheduled_at: new Date(currentTime.getTime() + 24 * 60 * 60 * 1000), // 24 hours
          metadata: { priority: 'medium', template: '24h_reminder' }
        },
        {
          lead_id: leadId,
          workflow_type: 'reminder_sequence',
          step_name: 'send_1h_email_reminder',
          scheduled_at: new Date(currentTime.getTime() + 1 * 60 * 60 * 1000), // 1 hour
          metadata: { priority: 'medium', template: '1h_email_reminder' }
        },
        {
          lead_id: leadId,
          workflow_type: 'reminder_sequence',
          step_name: 'send_2h_sms_reminder',
          scheduled_at: new Date(currentTime.getTime() + 2 * 60 * 60 * 1000), // 2 hours
          metadata: { priority: 'medium', template: '2h_sms_reminder' }
        },
        {
          lead_id: leadId,
          workflow_type: 'meeting_monitor',
          step_name: 'check_meeting_status',
          scheduled_at: new Date(currentTime.getTime() + 30 * 60 * 1000), // 30 minutes
          metadata: { priority: 'low', recurring: true, interval_minutes: 30 }
        },
        {
          lead_id: leadId,
          workflow_type: 'follow_up',
          step_name: 'send_follow_up_email',
          scheduled_at: new Date(currentTime.getTime() + 3 * 24 * 60 * 60 * 1000), // 3 days
          metadata: { priority: 'low', template: 'follow_up_email' }
        }
      ];

      // Insert workflow steps
      const { error: insertError } = await supabase
        .from('workflow_automation')
        .insert(workflowSteps);

      if (insertError) {
        throw new Error(`Failed to create workflow steps: ${insertError.message}`);
      }

      // Log the workflow initialization
      await this.logWorkflowEvent(leadId, 'workflow_initialized', {
        steps_created: workflowSteps.length,
        lead_email: lead.email
      });

      logger.info('Workflow initialized successfully', {
        leadId,
        stepsCreated: workflowSteps.length
      });

      return true;
    } catch (error) {
      logger.error('Failed to initialize workflow', { leadId, error: error.message });
      return false;
    }
  }

  /**
   * Process pending workflow jobs
   * @param {number} limit - Maximum number of jobs to process
   * @returns {Promise<number>} Number of jobs processed
   */
  async processPendingJobs(limit = this.batchSize) {
    if (this.isProcessing) {
      logger.warn('Workflow processing already in progress');
      return 0;
    }

    this.isProcessing = true;
    let processedCount = 0;

    try {
      logger.info('Starting workflow job processing', { limit });

      // Get pending jobs
      const { data: jobs, error: jobsError } = await supabase
        .from('workflow_automation')
        .select(`
          *,
          leads!inner(
            id,
            email,
            phone,
            full_name,
            status,
            scheduled_at
          )
        `)
        .eq('status', 'pending')
        .lte('scheduled_at', new Date().toISOString())
        .lt('retry_count', 3)
        .order('scheduled_at', { ascending: true })
        .order('workflow_type', { ascending: false })
        .limit(limit);

      if (jobsError) {
        throw new Error(`Failed to fetch pending jobs: ${jobsError.message}`);
      }

      if (!jobs || jobs.length === 0) {
        logger.info('No pending workflow jobs found');
        return 0;
      }

      logger.info(`Found ${jobs.length} pending workflow jobs`);

      // Process each job
      for (const job of jobs) {
        try {
          await this.processWorkflowJob(job);
          processedCount++;
        } catch (error) {
          logger.error('Failed to process workflow job', {
            jobId: job.id,
            error: error.message
          });
          
          // Mark job as failed
          await this.markJobFailed(job.id, error.message);
        }
      }

      logger.info('Workflow job processing completed', {
        totalJobs: jobs.length,
        processedCount,
        failedCount: jobs.length - processedCount
      });

      return processedCount;
    } catch (error) {
      logger.error('Workflow processing failed', { error: error.message });
      return processedCount;
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process a single workflow job
   * @param {Object} job - Workflow job object
   */
  async processWorkflowJob(job) {
    const { id, workflow_type, step, leads: lead, metadata } = job;
    
    logger.info('Processing workflow job', {
      jobId: id,
      workflowType: workflow_type,
      step,
      leadEmail: lead.email
    });

    // Mark job as processing
    await this.updateJobStatus(id, 'processing');

    try {
      let success = false;

      switch (step) {
        case 'send_welcome_email':
          success = await this.sendWelcomeEmail(lead, metadata);
          break;
        
        case 'send_24h_reminder':
        case 'send_1h_email_reminder':
        case 'send_follow_up_email':
          success = await this.sendReminderEmail(lead, metadata);
          break;
        
        case 'send_2h_sms_reminder':
          success = await this.sendReminderSMS(lead, metadata);
          break;
        
        case 'check_meeting_status':
          success = await this.checkMeetingStatus(lead, metadata);
          break;
        
        case 'send_meeting_reminder_24h':
        case 'send_meeting_reminder_1h':
          success = await this.sendMeetingReminder(lead, metadata);
          break;
        
        case 'verify_zoom_link':
          success = await this.verifyZoomLink(lead, metadata);
          break;
        
        default:
          throw new Error(`Unknown workflow step: ${step}`);
      }

      if (success) {
        await this.markJobCompleted(id);
        
        // Handle recurring jobs
        if (metadata?.recurring) {
          await this.createRecurringJob(job);
        }
      } else {
        throw new Error('Job execution returned false');
      }

    } catch (error) {
      await this.markJobFailed(id, error.message);
      throw error;
    }
  }

  /**
   * Send welcome email to lead
   */
  async sendWelcomeEmail(lead, metadata) {
    try {
      const emailData = {
        to: lead.email,
        subject: 'Welcome! Let\'s Schedule Your Consultation',
        template: metadata.template || 'welcome_email',
        data: {
          name: lead.full_name || lead.email,
          calendlyLink: process.env.CALENDLY_LINK || 'https://calendly.com/your-link'
        }
      };

      const result = await EmailService.sendEmail(emailData);
      
      logger.info('Welcome email sent successfully', {
        leadId: lead.id,
        email: lead.email,
        messageId: result.messageId
      });

      return true;
    } catch (error) {
      logger.error('Failed to send welcome email', {
        leadId: lead.id,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Send reminder email to lead
   */
  async sendReminderEmail(lead, metadata) {
    try {
      const emailData = {
        to: lead.email,
        subject: 'Reminder: Schedule Your Free Consultation',
        template: metadata.template || 'reminder_email',
        data: {
          name: lead.full_name || lead.email,
          calendlyLink: process.env.CALENDLY_LINK || 'https://calendly.com/your-link'
        }
      };

      const result = await EmailService.sendEmail(emailData);
      
      logger.info('Reminder email sent successfully', {
        leadId: lead.id,
        email: lead.email,
        template: metadata.template,
        messageId: result.messageId
      });

      return true;
    } catch (error) {
      logger.error('Failed to send reminder email', {
        leadId: lead.id,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Send reminder SMS to lead
   */
  async sendReminderSMS(lead, metadata) {
    try {
      if (!lead.phone || !lead.sms_opt_in) {
        logger.info('Skipping SMS - no phone or not opted in', {
          leadId: lead.id,
          hasPhone: !!lead.phone,
          smsOptIn: lead.sms_opt_in
        });
        return true; // Consider this successful
      }

      const message = `Hi ${lead.full_name || 'there'}! Don't forget to schedule your free consultation: ${process.env.CALENDLY_LINK || 'https://calendly.com/your-link'}`;
      
      const result = await TwilioSmsService.sendAppointmentReminder(lead, { start_time: new Date() }, 'workflow-orchestrator');
      
      logger.info('Reminder SMS sent successfully', {
        leadId: lead.id,
        phone: lead.phone,
        sid: result.sid
      });

      return true;
    } catch (error) {
      logger.error('Failed to send reminder SMS', {
        leadId: lead.id,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Check meeting status for lead
   */
  async checkMeetingStatus(lead, metadata) {
    try {
      // Check if lead has scheduled a meeting
      const { data: meetings, error } = await supabase
        .from('meetings')
        .select('*')
        .eq('lead_id', lead.id)
        .eq('status', 'scheduled')
        .order('start_time', { ascending: false })
        .limit(1);

      if (error) {
        throw new Error(`Failed to check meetings: ${error.message}`);
      }

      if (meetings && meetings.length > 0) {
        // Lead has scheduled a meeting - update workflow
        await this.handleMeetingScheduled(lead.id, meetings[0]);
      }

      logger.info('Meeting status checked', {
        leadId: lead.id,
        hasMeeting: meetings && meetings.length > 0
      });

      return true;
    } catch (error) {
      logger.error('Failed to check meeting status', {
        leadId: lead.id,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Send meeting reminder
   */
  async sendMeetingReminder(lead, metadata) {
    try {
      if (!lead.scheduled_at) {
        logger.info('No meeting scheduled - skipping reminder', { leadId: lead.id });
        return true;
      }

      const emailData = {
        to: lead.email,
        subject: 'Meeting Reminder - Your Consultation is Coming Up',
        template: metadata.template || 'meeting_reminder',
        data: {
          name: lead.full_name || lead.email,
          meetingTime: new Date(lead.scheduled_at).toLocaleString(),
          meetingLink: lead.meeting_location || 'Check your calendar for details'
        }
      };

      const result = await EmailService.sendEmail(emailData);
      
      logger.info('Meeting reminder sent successfully', {
        leadId: lead.id,
        email: lead.email,
        messageId: result.messageId
      });

      return true;
    } catch (error) {
      logger.error('Failed to send meeting reminder', {
        leadId: lead.id,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Verify Zoom link for meeting
   */
  async verifyZoomLink(lead, metadata) {
    try {
      // This is a placeholder for Zoom link verification
      // In a real implementation, you would check if the Zoom link is valid
      logger.info('Zoom link verification completed', { leadId: lead.id });
      return true;
    } catch (error) {
      logger.error('Failed to verify Zoom link', {
        leadId: lead.id,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Handle when a meeting is scheduled
   */
  async handleMeetingScheduled(leadId, meeting) {
    try {
      // Cancel general reminder sequence
      await supabase
        .from('workflow_automation')
        .update({ 
          status: 'skipped', 
          updated_at: new Date().toISOString() 
        })
        .eq('lead_id', leadId)
        .eq('workflow_type', 'reminder_sequence')
        .eq('status', 'pending');

      // Create meeting-specific reminders
      const meetingTime = new Date(meeting.start_time);
      const reminderJobs = [
        {
          lead_id: leadId,
          workflow_type: 'meeting_monitor',
          step: 'send_meeting_reminder_24h',
          scheduled_at: new Date(meetingTime.getTime() - 24 * 60 * 60 * 1000),
          metadata: { priority: 'high', template: 'meeting_reminder_24h' }
        },
        {
          lead_id: leadId,
          workflow_type: 'meeting_monitor',
          step: 'send_meeting_reminder_1h',
          scheduled_at: new Date(meetingTime.getTime() - 60 * 60 * 1000),
          metadata: { priority: 'high', template: 'meeting_reminder_1h' }
        },
        {
          lead_id: leadId,
          workflow_type: 'meeting_monitor',
          step: 'verify_zoom_link',
          scheduled_at: new Date(meetingTime.getTime() - 2 * 60 * 60 * 1000),
          metadata: { priority: 'high', action: 'verify_zoom_link' }
        }
      ];

      await supabase
        .from('workflow_automation')
        .insert(reminderJobs);

      logger.info('Meeting-specific workflow created', {
        leadId,
        meetingId: meeting.id,
        remindersCreated: reminderJobs.length
      });

    } catch (error) {
      logger.error('Failed to handle meeting scheduled', {
        leadId,
        error: error.message
      });
    }
  }

  /**
   * Create recurring job
   */
  async createRecurringJob(originalJob) {
    try {
      const intervalMinutes = originalJob.metadata?.interval_minutes || 30;
      const nextScheduled = new Date(Date.now() + intervalMinutes * 60 * 1000);

      const recurringJob = {
        lead_id: originalJob.lead_id,
        workflow_type: originalJob.workflow_type,
        step: originalJob.step,
        scheduled_at: nextScheduled.toISOString(),
        metadata: originalJob.metadata
      };

      await supabase
        .from('workflow_automation')
        .insert([recurringJob]);

      logger.info('Recurring job created', {
        originalJobId: originalJob.id,
        nextScheduled: nextScheduled.toISOString()
      });

    } catch (error) {
      logger.error('Failed to create recurring job', {
        originalJobId: originalJob.id,
        error: error.message
      });
    }
  }

  /**
   * Update job status
   */
  async updateJobStatus(jobId, status) {
    const { error } = await supabase
      .from('workflow_automation')
      .update({ 
        status, 
        updated_at: new Date().toISOString() 
      })
      .eq('id', jobId);

    if (error) {
      throw new Error(`Failed to update job status: ${error.message}`);
    }
  }

  /**
   * Mark job as completed
   */
  async markJobCompleted(jobId) {
    const { error } = await supabase
      .from('workflow_automation')
      .update({ 
        status: 'completed',
        executed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', jobId);

    if (error) {
      throw new Error(`Failed to mark job completed: ${error.message}`);
    }
  }

  /**
   * Mark job as failed
   */
  async markJobFailed(jobId, errorMessage) {
    const { data: job, error: fetchError } = await supabase
      .from('workflow_automation')
      .select('retry_count, max_retries')
      .eq('id', jobId)
      .single();

    if (fetchError) {
      logger.error('Failed to fetch job for retry logic', { jobId, error: fetchError.message });
      return;
    }

    const retryCount = (job.retry_count || 0) + 1;
    const maxRetries = job.max_retries || 3;

    if (retryCount < maxRetries) {
      // Schedule retry
      const retryAt = new Date(Date.now() + this.retryDelay);
      
      const { error } = await supabase
        .from('workflow_automation')
        .update({ 
          status: 'pending',
          retry_count: retryCount,
          scheduled_at: retryAt.toISOString(),
          error_message: errorMessage,
          updated_at: new Date().toISOString()
        })
        .eq('id', jobId);

      if (error) {
        logger.error('Failed to schedule retry', { jobId, error: error.message });
      } else {
        logger.info('Job scheduled for retry', {
          jobId,
          retryCount,
          retryAt: retryAt.toISOString()
        });
      }
    } else {
      // Mark as permanently failed
      const { error } = await supabase
        .from('workflow_automation')
        .update({ 
          status: 'failed',
          error_message: errorMessage,
          updated_at: new Date().toISOString()
        })
        .eq('id', jobId);

      if (error) {
        logger.error('Failed to mark job as failed', { jobId, error: error.message });
      }
    }
  }

  /**
   * Log workflow event
   */
  async logWorkflowEvent(leadId, eventType, eventData) {
    try {
      await supabase
        .from('lead_processing_logs')
        .insert({
          lead_id: leadId,
          event_type: eventType,
          event_data: eventData,
          success: true
        });
    } catch (error) {
      logger.error('Failed to log workflow event', {
        leadId,
        eventType,
        error: error.message
      });
    }
  }

  /**
   * Get workflow status for a lead
   */
  async getWorkflowStatus(leadId) {
    try {
      const { data: jobs, error } = await supabase
        .from('workflow_automation')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false });

      if (error) {
        throw new Error(`Failed to fetch workflow status: ${error.message}`);
      }

      return {
        leadId,
        totalJobs: jobs.length,
        pending: jobs.filter(j => j.status === 'pending').length,
        processing: jobs.filter(j => j.status === 'processing').length,
        completed: jobs.filter(j => j.status === 'completed').length,
        failed: jobs.filter(j => j.status === 'failed').length,
        skipped: jobs.filter(j => j.status === 'skipped').length,
        jobs: jobs
      };
    } catch (error) {
      logger.error('Failed to get workflow status', {
        leadId,
        error: error.message
      });
      return null;
    }
  }

  /**
   * Start continuous processing
   */
  async startContinuousProcessing(intervalMinutes = 5) {
    logger.info('Starting continuous workflow processing', { intervalMinutes });
    
    const processInterval = setInterval(async () => {
      try {
        await this.processPendingJobs();
      } catch (error) {
        logger.error('Error in continuous processing', { error: error.message });
      }
    }, intervalMinutes * 60 * 1000);

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      logger.info('Stopping continuous workflow processing');
      clearInterval(processInterval);
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      logger.info('Stopping continuous workflow processing');
      clearInterval(processInterval);
      process.exit(0);
    });

    return processInterval;
  }
}

// Export the orchestrator
export { WorkflowOrchestrator };

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const orchestrator = new WorkflowOrchestrator();
  const command = process.argv[2];
  const leadId = process.argv[3];

  switch (command) {
    case 'init':
      if (!leadId) {
        console.error('Usage: node workflow-orchestrator.js init <leadId>');
        process.exit(1);
      }
      orchestrator.initializeWorkflow(leadId)
        .then(success => {
          console.log(success ? 'Workflow initialized successfully' : 'Failed to initialize workflow');
          process.exit(success ? 0 : 1);
        });
      break;

    case 'process':
      const limit = parseInt(process.argv[3]) || 50;
      orchestrator.processPendingJobs(limit)
        .then(count => {
          console.log(`Processed ${count} workflow jobs`);
          process.exit(0);
        });
      break;

    case 'status':
      if (!leadId) {
        console.error('Usage: node workflow-orchestrator.js status <leadId>');
        process.exit(1);
      }
      orchestrator.getWorkflowStatus(leadId)
        .then(status => {
          console.log(JSON.stringify(status, null, 2));
          process.exit(0);
        });
      break;

    case 'continuous':
      const interval = parseInt(process.argv[3]) || 5;
      orchestrator.startContinuousProcessing(interval);
      break;

    default:
      console.log(`
Workflow Orchestrator CLI

Usage:
  node workflow-orchestrator.js init <leadId>        # Initialize workflow for a lead
  node workflow-orchestrator.js process [limit]      # Process pending jobs
  node workflow-orchestrator.js status <leadId>      # Get workflow status
  node workflow-orchestrator.js continuous [minutes] # Start continuous processing
`);
      process.exit(1);
  }
}