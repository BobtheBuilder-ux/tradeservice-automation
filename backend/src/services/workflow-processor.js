/**
 * Automated Workflow Processor
 * Continuously monitors and executes workflow jobs from the database
 * Handles email sending, SMS reminders, meeting monitoring, and follow-ups
 */

import { db } from '../config/index.js';
import { workflowAutomation, systemConfig, leads } from '../db/schema.js';
import { eq, and, lte, isNull, or } from 'drizzle-orm';
import logger from '../utils/logger.js';
import calendlyEmailService from './calendly-email-service.js';
import twilioSmsService from './twilio-sms-service.js';
import meetingService from './meeting-service.js';
import emailTemplateService from './email-template-service.js';
import { hashForLogging } from '../utils/crypto.js';
import pkg from 'uuid';
const { v4: uuidv4 } = pkg;

class WorkflowProcessor {
  constructor() {
    this.isRunning = false;
    this.processingInterval = null;
    this.batchSize = 50;
    this.processingDelay = 5000; // 5 seconds between batches
    this.emailService = calendlyEmailService;
    this.smsService = twilioSmsService;
    this.emailTemplateService = emailTemplateService;
    this.trackingId = uuidv4();
  }

  /**
   * Start the workflow processor
   */
  async start() {
    if (this.isRunning) {
      logger.info('Workflow processor is already running', { trackingId: this.trackingId });
      return;
    }

    this.isRunning = true;
    logger.info('Starting automated workflow processor', { 
      trackingId: this.trackingId,
      batchSize: this.batchSize,
      processingDelay: this.processingDelay
    });

    // Load configuration from database
    await this.loadConfiguration();

    // Start processing loop
    this.processingInterval = setInterval(async () => {
      try {
        await this.processBatch();
      } catch (error) {
        logger.error(error.message, {
          context: 'workflow_processor_batch_error',
          trackingId: this.trackingId,
          stack: error.stack
        });
      }
    }, this.processingDelay);

    // Listen for real-time notifications
    this.setupRealtimeListener();

    logger.info('Workflow processor started successfully', { trackingId: this.trackingId });
  }

  /**
   * Stop the workflow processor
   */
  async stop() {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }

    logger.info('Workflow processor stopped', { trackingId: this.trackingId });
  }

  /**
   * Load configuration from database
   */
  async loadConfiguration() {
    try {
      const config = await db.select({
        key: systemConfig.key,
        value: systemConfig.value
      })
      .from(systemConfig)
      .where(or(
        eq(systemConfig.key, 'workflow_automation_enabled'),
        eq(systemConfig.key, 'workflow_job_batch_size'),
        eq(systemConfig.key, 'workflow_retry_delay_minutes')
      ));

      // Apply configuration
      config.forEach(item => {
        switch (item.key) {
          case 'workflow_job_batch_size':
            this.batchSize = parseInt(item.value) || 50;
            break;
          case 'workflow_retry_delay_minutes':
            this.retryDelay = parseInt(item.value) || 15;
            break;
        }
      });

      logger.info('Configuration loaded', {
        trackingId: this.trackingId,
        batchSize: this.batchSize,
        retryDelay: this.retryDelay
      });
    } catch (error) {
      logger.error(error.message, {
        context: 'workflow_processor_config_load',
        trackingId: this.trackingId,
        stack: error.stack
      });
    }
  }

  /**
   * Setup real-time listener for immediate job processing
   */
  setupRealtimeListener() {
    // Listen for workflow job notifications
    supabase
      .channel('workflow_jobs')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'workflow_automation',
        filter: 'status=eq.pending'
      }, (payload) => {
        logger.info('Real-time workflow job notification', {
          trackingId: this.trackingId,
          jobId: payload.new?.id,
          workflowType: payload.new?.workflow_type,
          step: payload.new?.step
        });
        
        // Process immediately if job is ready
        if (payload.new?.scheduled_at && new Date(payload.new.scheduled_at) <= new Date()) {
          this.processJob(payload.new).catch(error => {
            logger.error(error.message, {
              context: 'realtime_job_processing',
              trackingId: this.trackingId,
              jobId: payload.new?.id,
              stack: error.stack
            });
          });
        }
      })
      .subscribe();
  }

  /**
   * Process a batch of pending workflow jobs
   */
  async processBatch() {
    let processedCount = 0;
    let successCount = 0;
    let errorCount = 0;

    try {
      // Get pending jobs
      const jobs = await db.select()
        .from(workflowAutomation)
        .where(and(
          eq(workflowAutomation.status, 'pending'),
          lte(workflowAutomation.scheduledAt, new Date())
        ))
        .limit(this.batchSize);

      if (!jobs || jobs.length === 0) {
        return {
          processedCount: 0,
          successCount: 0,
          errorCount: 0
        };
      }

      logger.info('Processing workflow batch', {
        trackingId: this.trackingId,
        jobCount: jobs.length
      });

      // Process jobs concurrently with limited concurrency
      const concurrencyLimit = 5;
      for (let i = 0; i < jobs.length; i += concurrencyLimit) {
        const batch = jobs.slice(i, i + concurrencyLimit);
        const results = await Promise.allSettled(
          batch.map(job => this.processJob(job))
        );
        
        // Count results
        results.forEach(result => {
          processedCount++;
          if (result.status === 'fulfilled') {
            successCount++;
          } else {
            errorCount++;
          }
        });
      }

      return {
        processedCount,
        successCount,
        errorCount
      };

    } catch (error) {
      logger.error(error.message, {
        context: 'workflow_batch_processing',
        trackingId: this.trackingId,
        stack: error.stack
      });
      
      return {
        processedCount,
        successCount,
        errorCount: errorCount + 1
      };
    }
  }

  /**
   * Process a single workflow job
   */
  async processJob(job) {
    const jobTrackingId = uuidv4();
    const startTime = Date.now();

    try {
      logger.info('Processing workflow job', {
        trackingId: jobTrackingId,
        jobId: job.id,
        leadId: job.lead_id,
        workflowType: job.workflow_type,
        step: job.step,
        leadEmail: hashForLogging(job.lead_email)
      });

      // Mark job as running
      await this.updateJobStatus(job.id, 'running');

      let success = false;
      let errorMessage = null;

      // Execute the workflow step
      switch (job.workflow_type) {
        case 'initial_engagement':
          success = await this.handleInitialEngagement(job, jobTrackingId);
          break;
        case 'reminder_sequence':
          success = await this.handleReminderSequence(job, jobTrackingId);
          break;
        case 'meeting_monitor':
          success = await this.handleMeetingMonitor(job, jobTrackingId);
          break;
        case 'follow_up':
          success = await this.handleFollowUp(job, jobTrackingId);
          break;
        case 'scheduling_automation':
          success = await this.handleSchedulingAutomation(job, jobTrackingId);
          break;
        default:
          throw new Error(`Unknown workflow type: ${job.workflow_type}`);
      }

      // Complete the job
      await supabase.rpc('complete_workflow_job', {
        job_id: job.id,
        success: success,
        error_msg: errorMessage
      });

      // Handle recurring jobs
      if (success && job.metadata?.recurring === 'true') {
        const intervalMinutes = parseInt(job.metadata?.interval_minutes) || 30;
        await supabase.rpc('create_recurring_workflow_job', {
          original_job_id: job.id,
          next_interval: `${intervalMinutes} minutes`
        });
      }

      const processingTime = Date.now() - startTime;
      logger.info('Workflow job completed', {
        trackingId: jobTrackingId,
        jobId: job.id,
        success: success,
        processingTimeMs: processingTime
      });

    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error(error.message, {
        context: 'workflow_job_processing',
        trackingId: jobTrackingId,
        jobId: job.id,
        leadId: job.lead_id,
        workflowType: job.workflow_type,
        step: job.step,
        processingTimeMs: processingTime,
        stack: error.stack
      });

      // Mark job as failed
      await supabase.rpc('complete_workflow_job', {
        job_id: job.id,
        success: false,
        error_msg: error.message
      });
    }
  }

  /**
   * Handle initial engagement workflow
   */
  async handleInitialEngagement(job, trackingId) {
    switch (job.step_name) {
      case 'send_welcome_email':
        return await this.sendWelcomeEmail(job, trackingId);
      default:
        throw new Error(`Unknown initial engagement step: ${job.step_name}`);
    }
  }

  /**
   * Handle reminder sequence workflow
   */
  async handleReminderSequence(job, trackingId) {
    switch (job.step_name) {
      case 'send_24h_reminder':
        return await this.send24HourReminder(job, trackingId);
      case 'send_1h_email_reminder':
        return await this.send1HourEmailReminder(job, trackingId);
      case 'send_2h_sms_reminder':
        return await this.send2HourSmsReminder(job, trackingId);
      case 'send_reschedule_reminder':
        return await this.sendRescheduleReminder(job, trackingId);
      default:
        throw new Error(`Unknown reminder sequence step: ${job.step_name}`);
    }
  }

  /**
   * Handle meeting monitor workflow
   */
  async handleMeetingMonitor(job, trackingId) {
    switch (job.step_name) {
      case 'check_meeting_status':
        return await this.checkMeetingStatus(job, trackingId);
      case 'send_meeting_reminder_24h':
        return await this.sendMeetingReminder24H(job, trackingId);
      case 'send_meeting_reminder_1h':
        return await this.sendMeetingReminder1H(job, trackingId);
      case 'send_meeting_reminder_2h_sms':
        return await this.send2HourSmsReminder(job, trackingId);
      case 'verify_zoom_link':
        return await this.verifyZoomLink(job, trackingId);
      default:
        throw new Error(`Unknown meeting monitor step: ${job.step_name}`);
    }
  }

  /**
   * Handle follow-up workflow
   */
  async handleFollowUp(job, trackingId) {
    switch (job.step_name) {
      case 'send_follow_up_email':
        return await this.sendFollowUpEmail(job, trackingId);
      case 'post_meeting_follow_up':
        return await this.sendFollowUpEmail(job, trackingId);
      default:
        throw new Error(`Unknown follow-up step: ${job.step_name}`);
    }
  }

  /**
   * Handle scheduling automation workflow
   */
  async handleSchedulingAutomation(job, trackingId) {
    switch (job.step_name) {
      case 'send_scheduling_email':
        return await this.sendSchedulingEmail(job, trackingId);
      case 'monitor_scheduling_status':
        return await this.monitorSchedulingStatus(job, trackingId);
      case 'send_first_reminder':
        return await this.sendFirstSchedulingReminder(job, trackingId);
      case 'send_second_reminder':
        return await this.sendSecondSchedulingReminder(job, trackingId);
      case 'send_final_reminder':
        return await this.sendFinalSchedulingReminder(job, trackingId);
      case 'send_meeting_reminder_24h':
        return await this.sendMeetingReminder24H(job, trackingId);
      case 'send_meeting_reminder_1h':
        return await this.sendMeetingReminder1H(job, trackingId);
      default:
        throw new Error(`Unknown scheduling automation step: ${job.step_name}`);
    }
  }

  /**
   * Send welcome email
   */
  async sendWelcomeEmail(job, trackingId) {
    try {
      const result = await this.emailTemplateService.queueWelcomeEmail(
        job.lead_id,
        job.lead_email,
        job.lead_name || 'Valued Customer',
        {
          trackingId: trackingId,
          workflowType: 'initial_engagement',
          stepName: 'send_welcome_email'
        }
      );

      logger.info('Welcome email queued', {
        trackingId: trackingId,
        leadId: job.lead_id,
        email: hashForLogging(job.lead_email),
        queueId: result.id
      });

      return true;
    } catch (error) {
      logger.error(error.message, {
        context: 'send_welcome_email',
        trackingId: trackingId,
        leadId: job.lead_id,
        stack: error.stack
      });
      return false;
    }
  }

  /**
   * Send 24-hour reminder
   */
  async send24HourReminder(job, trackingId) {
    try {
      const result = await this.emailService.send24HourReminder(
        job.lead_email,
        job.lead_name || 'Valued Customer',
        trackingId
      );

      logger.info('24-hour reminder sent', {
        trackingId: trackingId,
        leadId: job.lead_id,
        email: hashForLogging(job.lead_email),
        messageId: result.messageId
      });

      return true;
    } catch (error) {
      logger.error(error.message, {
        context: 'send_24h_reminder',
        trackingId: trackingId,
        leadId: job.lead_id,
        stack: error.stack
      });
      return false;
    }
  }

  /**
   * Send 1-hour email reminder
   */
  async send1HourEmailReminder(job, trackingId) {
    try {
      const result = await this.emailService.send1HourReminder(
        job.lead_email,
        job.lead_name || 'Valued Customer',
        trackingId
      );

      logger.info('1-hour email reminder sent', {
        trackingId: trackingId,
        leadId: job.lead_id,
        email: hashForLogging(job.lead_email),
        messageId: result.messageId
      });

      return true;
    } catch (error) {
      logger.error(error.message, {
        context: 'send_1h_email_reminder',
        trackingId: trackingId,
        leadId: job.lead_id,
        stack: error.stack
      });
      return false;
    }
  }

  /**
   * Send 2-hour SMS reminder
   */
  async send2HourSmsReminder(job, trackingId) {
    try {
      if (!job.lead_phone) {
        logger.info('Skipping SMS reminder - no phone number', {
          trackingId: trackingId,
          leadId: job.lead_id
        });
        return true; // Consider this successful
      }

      const result = await this.smsService.send2HourReminder(
        job.lead_phone,
        job.lead_name || 'Valued Customer',
        trackingId
      );

      logger.info('2-hour SMS reminder sent', {
        trackingId: trackingId,
        leadId: job.lead_id,
        phone: hashForLogging(job.lead_phone),
        messageId: result.sid
      });

      return true;
    } catch (error) {
      logger.error(error.message, {
        context: 'send_2h_sms_reminder',
        trackingId: trackingId,
        leadId: job.lead_id,
        stack: error.stack
      });
      return false;
    }
  }

  /**
   * Send reschedule reminder
   */
  async sendRescheduleReminder(job, trackingId) {
    try {
      const result = await this.emailService.sendRescheduleReminder(
        job.lead_email,
        job.lead_name || 'Valued Customer',
        trackingId
      );

      logger.info('Reschedule reminder sent', {
        trackingId: trackingId,
        leadId: job.lead_id,
        email: hashForLogging(job.lead_email),
        messageId: result.messageId
      });

      return true;
    } catch (error) {
      logger.error(error.message, {
        context: 'send_reschedule_reminder',
        trackingId: trackingId,
        leadId: job.lead_id,
        stack: error.stack
      });
      return false;
    }
  }

  /**
   * Check meeting status
   */
  async checkMeetingStatus(job, trackingId) {
    try {
      // Get current lead data
      const { data: lead, error } = await supabase
        .from('leads')
        .select('*')
        .eq('id', job.lead_id)
        .single();

      if (error) throw error;

      // Check if meeting is scheduled
      if (lead.status === 'scheduled' && lead.scheduled_at) {
        logger.info('Meeting status check - scheduled', {
          trackingId: trackingId,
          leadId: job.lead_id,
          scheduledAt: lead.scheduled_at
        });
        return true;
      }

      // Check if meeting needs follow-up
      if (lead.status === 'new' && lead.created_at) {
        const hoursSinceCreated = (Date.now() - new Date(lead.created_at)) / (1000 * 60 * 60);
        if (hoursSinceCreated > 48) {
          // Create follow-up task
          await this.createFollowUpTask(job.lead_id, trackingId);
        }
      }

      return true;
    } catch (error) {
      logger.error(error.message, {
        context: 'check_meeting_status',
        trackingId: trackingId,
        leadId: job.lead_id,
        stack: error.stack
      });
      return false;
    }
  }

  /**
   * Send meeting reminder 24 hours before
   */
  async sendMeetingReminder24H(job, trackingId) {
    try {
      const result = await this.emailService.sendMeetingReminder(
        job.lead_email,
        job.lead_name || 'Valued Customer',
        '24 hours',
        trackingId
      );

      logger.info('24-hour meeting reminder sent', {
        trackingId: trackingId,
        leadId: job.lead_id,
        email: hashForLogging(job.lead_email),
        messageId: result.messageId
      });

      return true;
    } catch (error) {
      logger.error(error.message, {
        context: 'send_meeting_reminder_24h',
        trackingId: trackingId,
        leadId: job.lead_id,
        stack: error.stack
      });
      return false;
    }
  }

  /**
   * Send meeting reminder 1 hour before
   */
  async sendMeetingReminder1H(job, trackingId) {
    try {
      const result = await this.emailService.sendMeetingReminder(
        job.lead_email,
        job.lead_name || 'Valued Customer',
        '1 hour',
        trackingId
      );

      logger.info('1-hour meeting reminder sent', {
        trackingId: trackingId,
        leadId: job.lead_id,
        email: hashForLogging(job.lead_email),
        messageId: result.messageId
      });

      return true;
    } catch (error) {
      logger.error(error.message, {
        context: 'send_meeting_reminder_1h',
        trackingId: trackingId,
        leadId: job.lead_id,
        stack: error.stack
      });
      return false;
    }
  }

  /**
   * Verify Zoom link
   */
  async verifyZoomLink(job, trackingId) {
    try {
      // Get meeting details
      const { data: lead, error } = await supabase
        .from('leads')
        .select('meeting_location, calendly_event_uri')
        .eq('id', job.lead_id)
        .single();

      if (error) throw error;

      if (lead.meeting_location && lead.meeting_location.includes('zoom.us')) {
        logger.info('Zoom link verified', {
          trackingId: trackingId,
          leadId: job.lead_id,
          hasZoomLink: true
        });
        return true;
      }

      // If no Zoom link, try to get it from Calendly
      if (lead.calendly_event_uri) {
        const meetingDetails = await meetingService.getMeetingDetails(lead.calendly_event_uri, trackingId);
        if (meetingDetails && meetingDetails.location) {
          // Update meeting location
          await supabase
            .from('leads')
            .update({ meeting_location: meetingDetails.location })
            .eq('id', job.lead_id);

          logger.info('Meeting location updated from Calendly', {
            trackingId: trackingId,
            leadId: job.lead_id,
            location: meetingDetails.location
          });
        }
      }

      return true;
    } catch (error) {
      logger.error(error.message, {
        context: 'verify_zoom_link',
        trackingId: trackingId,
        leadId: job.lead_id,
        stack: error.stack
      });
      return false;
    }
  }

  /**
   * Send follow-up email
   */
  async sendFollowUpEmail(job, trackingId) {
    try {
      // Prepare lead data object for the email template service
      const leadData = {
        id: job.lead_id,
        email: job.lead_email,
        full_name: job.lead_name || 'Valued Customer'
      };

      const calendlyLink = process.env.CALENDLY_BOOKING_URL || process.env.CALENDLY_LINK || 'https://calendly.com/your-link';

      const result = await this.emailTemplateService.queueFollowUpEmail(
        leadData,
        calendlyLink,
        trackingId
      );

      logger.info('Follow-up email queued', {
        trackingId: trackingId,
        leadId: job.lead_id,
        email: hashForLogging(job.lead_email),
        queueId: result.queueId
      });

      return true;
    } catch (error) {
      logger.error(error.message, {
        context: 'send_follow_up_email',
        trackingId: trackingId,
        leadId: job.lead_id,
        stack: error.stack
      });
      return false;
    }
  }

  /**
   * Create follow-up task
   */
  async createFollowUpTask(leadId, trackingId) {
    try {
      const { error } = await supabase
        .from('workflow_automation')
        .insert({
          lead_id: leadId,
          workflow_type: 'follow_up',
          step: 'send_follow_up_email',
          scheduled_at: new Date(Date.now() + 60 * 60 * 1000), // 1 hour from now
          metadata: { priority: 'medium', template: 'follow_up_email' }
        });

      if (error) throw error;

      logger.info('Follow-up task created', {
        trackingId: trackingId,
        leadId: leadId
      });
    } catch (error) {
      logger.error(error.message, {
        context: 'create_follow_up_task',
        trackingId: trackingId,
        leadId: leadId,
        stack: error.stack
      });
    }
  }

  /**
   * Send scheduling email to lead
   */
  async sendSchedulingEmail(job, trackingId) {
    try {
      const result = await this.emailTemplateService.queueSchedulingEmail(
        job.lead_id,
        job.lead_email,
        job.lead_name || 'Valued Customer',
        {
          trackingId: trackingId,
          workflowType: 'scheduling_automation',
          stepName: 'send_scheduling_email'
        }
      );

      logger.info('Scheduling email queued', {
        trackingId: trackingId,
        leadId: job.lead_id,
        email: hashForLogging(job.lead_email),
        queueId: result.id
      });

      // Schedule monitoring task
      await this.scheduleMonitoringTask(job.lead_id, trackingId);

      return true;
    } catch (error) {
      logger.error(error.message, {
        context: 'send_scheduling_email',
        trackingId: trackingId,
        leadId: job.lead_id,
        stack: error.stack
      });
      return false;
    }
  }

  /**
   * Monitor scheduling status
   */
  async monitorSchedulingStatus(job, trackingId) {
    try {
      const meetingStatus = await meetingService.checkMeetingStatus(job.lead_email);
      
      if (meetingStatus.hasScheduled) {
        logger.info('Meeting scheduled detected', {
          trackingId: trackingId,
          leadId: job.lead_id,
          meetingTime: meetingStatus.meetingTime
        });

        // Schedule meeting reminders
        await this.scheduleMeetingReminders(job.lead_id, meetingStatus.meetingTime, trackingId);
        return true;
      } else {
        // Schedule next monitoring check
        await this.scheduleNextMonitoringCheck(job.lead_id, trackingId);
        return true;
      }
    } catch (error) {
      logger.error(error.message, {
        context: 'monitor_scheduling_status',
        trackingId: trackingId,
        leadId: job.lead_id,
        stack: error.stack
      });
      return false;
    }
  }

  /**
   * Send first scheduling reminder
   */
  async sendFirstSchedulingReminder(job, trackingId) {
    try {
      const result = await this.emailTemplateService.queueSchedulingReminderEmail(
        job.lead_id,
        job.lead_email,
        job.lead_name || 'Valued Customer',
        'first',
        {
          trackingId: trackingId,
          workflowType: 'scheduling_automation',
          stepName: 'send_first_reminder',
          reminderType: 'first'
        }
      );

      logger.info('First scheduling reminder queued', {
        trackingId: trackingId,
        leadId: job.lead_id,
        email: hashForLogging(job.lead_email),
        queueId: result.id
      });

      return true;
    } catch (error) {
      logger.error(error.message, {
        context: 'send_first_scheduling_reminder',
        trackingId: trackingId,
        leadId: job.lead_id,
        stack: error.stack
      });
      return false;
    }
  }

  /**
   * Send second scheduling reminder
   */
  async sendSecondSchedulingReminder(job, trackingId) {
    try {
      const result = await this.emailTemplateService.queueSchedulingReminderEmail(
        job.lead_id,
        job.lead_email,
        job.lead_name || 'Valued Customer',
        'second',
        {
          trackingId: trackingId,
          workflowType: 'scheduling_automation',
          stepName: 'send_second_reminder',
          reminderType: 'second'
        }
      );

      logger.info('Second scheduling reminder queued', {
        trackingId: trackingId,
        leadId: job.lead_id,
        email: hashForLogging(job.lead_email),
        queueId: result.id
      });

      return true;
    } catch (error) {
      logger.error(error.message, {
        context: 'send_second_scheduling_reminder',
        trackingId: trackingId,
        leadId: job.lead_id,
        stack: error.stack
      });
      return false;
    }
  }

  /**
   * Send final scheduling reminder
   */
  async sendFinalSchedulingReminder(job, trackingId) {
    try {
      const result = await this.emailTemplateService.queueSchedulingReminderEmail(
        job.lead_id,
        job.lead_email,
        job.lead_name || 'Valued Customer',
        'final',
        {
          trackingId: trackingId,
          workflowType: 'scheduling_automation',
          stepName: 'send_final_reminder',
          reminderType: 'final'
        }
      );

      logger.info('Final scheduling reminder queued', {
        trackingId: trackingId,
        leadId: job.lead_id,
        email: hashForLogging(job.lead_email),
        queueId: result.id
      });

      return true;
    } catch (error) {
      logger.error(error.message, {
        context: 'send_final_scheduling_reminder',
        trackingId: trackingId,
        leadId: job.lead_id,
        stack: error.stack
      });
      return false;
    }
  }

  /**
   * Schedule monitoring task
   */
  async scheduleMonitoringTask(leadId, trackingId) {
    try {
      const { error } = await supabase
        .from('workflow_automation')
        .insert({
          lead_id: leadId,
          workflow_type: 'scheduling_automation',
          step_name: 'monitor_scheduling_status',
          scheduled_at: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2 hours from now
          metadata: { check_count: 1 }
        });

      if (error) throw error;

      logger.info('Monitoring task scheduled', {
        trackingId: trackingId,
        leadId: leadId
      });
    } catch (error) {
      logger.error(error.message, {
        context: 'schedule_monitoring_task',
        trackingId: trackingId,
        leadId: leadId,
        stack: error.stack
      });
    }
  }

  /**
   * Schedule next monitoring check
   */
  async scheduleNextMonitoringCheck(leadId, trackingId) {
    try {
      const { error } = await supabase
        .from('workflow_automation')
        .insert({
          lead_id: leadId,
          workflow_type: 'scheduling_automation',
          step_name: 'monitor_scheduling_status',
          scheduled_at: new Date(Date.now() + 4 * 60 * 60 * 1000), // 4 hours from now
          metadata: { check_count: 2 }
        });

      if (error) throw error;

      logger.info('Next monitoring check scheduled', {
        trackingId: trackingId,
        leadId: leadId
      });
    } catch (error) {
      logger.error(error.message, {
        context: 'schedule_next_monitoring_check',
        trackingId: trackingId,
        leadId: leadId,
        stack: error.stack
      });
    }
  }

  /**
   * Schedule meeting reminders
   */
  async scheduleMeetingReminders(leadId, meetingTime, trackingId) {
    try {
      const meetingDate = new Date(meetingTime);
      const reminder24h = new Date(meetingDate.getTime() - 24 * 60 * 60 * 1000);
      const reminder1h = new Date(meetingDate.getTime() - 60 * 60 * 1000);

      // Get lead info for email
      const { data: lead, error: leadError } = await supabase
        .from('leads')
        .select('email, first_name, last_name')
        .eq('id', leadId)
        .single();

      if (leadError) throw leadError;

      // Queue 24-hour reminder email
      await this.emailTemplateService.queueMeetingReminderEmail(
        leadId,
        lead.email,
        `${lead.first_name} ${lead.last_name}`.trim() || 'Valued Customer',
        '24h',
        reminder24h,
        {
          trackingId: trackingId,
          workflowType: 'meeting_monitor',
          stepName: 'send_meeting_reminder_24h',
          meetingTime: meetingTime
        }
      );

      // Queue 1-hour reminder email
      await this.emailTemplateService.queueMeetingReminderEmail(
        leadId,
        lead.email,
        `${lead.first_name} ${lead.last_name}`.trim() || 'Valued Customer',
        '1h',
        reminder1h,
        {
          trackingId: trackingId,
          workflowType: 'meeting_monitor',
          stepName: 'send_meeting_reminder_1h',
          meetingTime: meetingTime
        }
      );

      logger.info('Meeting reminder emails queued', {
        trackingId: trackingId,
        leadId: leadId,
        meetingTime: meetingTime,
        reminder24h: reminder24h,
        reminder1h: reminder1h
      });
    } catch (error) {
      logger.error(error.message, {
        context: 'schedule_meeting_reminders',
        trackingId: trackingId,
        leadId: leadId,
        stack: error.stack
      });
    }
  }



  /**
   * Update job status
   */
  async updateJobStatus(jobId, status) {
    try {
      await db.update(workflowAutomation)
        .set({ 
          status: status,
          updatedAt: new Date()
        })
        .where(eq(workflowAutomation.id, jobId));
    } catch (error) {
      logger.error(error.message, {
        context: 'update_job_status',
        jobId: jobId,
        status: status,
        stack: error.stack
      });
    }
  }

  /**
   * Get processor status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      batchSize: this.batchSize,
      processingDelay: this.processingDelay,
      trackingId: this.trackingId
    };
  }
}

// Create singleton instance
const workflowProcessor = new WorkflowProcessor();

export default workflowProcessor;