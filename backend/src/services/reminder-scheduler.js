import cron from 'node-cron';
import MeetingService from './meeting-service.js';
import CalendlyEmailService from './calendly-email-service.js';
import TwilioSmsService from './twilio-sms-service.js';
import logger from '../utils/logger.js';
import { generateTrackingId } from '../utils/crypto.js';

/**
 * Automated Reminder Scheduler Service
 * Handles scheduled tasks for meeting reminders and follow-ups
 */
class ReminderScheduler {
  constructor() {
    this.isRunning = false;
    this.scheduledTasks = new Map();
  }

  /**
   * Initialize all scheduled tasks
   */
  start() {
    if (this.isRunning) {
      logger.warn('Reminder scheduler is already running');
      return;
    }

    logger.info('Starting automated reminder scheduler...');
    
    // Daily task: Check for 24-hour meeting reminders
    // Runs every day at 9:00 AM
    const dailyReminderTask = cron.schedule('0 9 * * *', async () => {
      await this.processDailyReminders();
    }, {
      scheduled: false,
      timezone: 'America/New_York'
    });

    // Hourly task: Check for 1-hour meeting reminders
    // Runs every hour at minute 0
    const hourlyReminderTask = cron.schedule('0 * * * *', async () => {
      await this.processHourlyReminders();
    }, {
      scheduled: false,
      timezone: 'America/New_York'
    });

    // Daily task: Send meeting scheduling reminders to leads
    // Runs every day at 10:00 AM
    const leadFollowUpTask = cron.schedule('0 10 * * *', async () => {
      await this.processLeadFollowUps();
    }, {
      scheduled: false,
      timezone: 'America/New_York'
    });

    // Store tasks for management
    this.scheduledTasks.set('dailyReminders', dailyReminderTask);
    this.scheduledTasks.set('hourlyReminders', hourlyReminderTask);
    this.scheduledTasks.set('leadFollowUps', leadFollowUpTask);

    // Start all tasks
    dailyReminderTask.start();
    hourlyReminderTask.start();
    leadFollowUpTask.start();

    this.isRunning = true;
    logger.info('Reminder scheduler started successfully with 3 scheduled tasks');
  }

  /**
   * Stop all scheduled tasks
   */
  stop() {
    if (!this.isRunning) {
      logger.warn('Reminder scheduler is not running');
      return;
    }

    logger.info('Stopping reminder scheduler...');
    
    this.scheduledTasks.forEach((task, name) => {
      task.stop();
      logger.info(`Stopped task: ${name}`);
    });

    this.scheduledTasks.clear();
    this.isRunning = false;
    logger.info('Reminder scheduler stopped');
  }

  /**
   * Process daily 24-hour meeting reminders
   */
  async processDailyReminders() {
    const trackingId = generateTrackingId();
    
    try {
      logger.info('Starting daily reminder processing...', { trackingId });
      
      const meetings = await MeetingService.getMeetingsNeedingDailyReminders();
      
      if (meetings.length === 0) {
        logger.info('No meetings need 24-hour reminders today', { trackingId });
        return;
      }

      logger.info(`Processing ${meetings.length} meetings for 24-hour reminders`, { trackingId });
      
      let successCount = 0;
      let errorCount = 0;

      for (const meeting of meetings) {
        try {
          const leadData = meeting.leads;
          
          // Send 24-hour reminder email
          const emailResult = await CalendlyEmailService.sendAppointmentReminder(
            leadData,
            {
              start_time: meeting.start_time,
              end_time: meeting.end_time,
              meeting_url: meeting.meeting_url,
              location: meeting.location,
              title: meeting.meeting_title
            },
            trackingId
          );

          if (emailResult.success) {
            // Mark reminder as sent
            await MeetingService.markReminderSent(
              meeting.id,
              '24h',
              emailResult.messageId,
              trackingId
            );
            
            successCount++;
            logger.info(`24-hour email reminder sent successfully`, {
              trackingId,
              meetingId: meeting.id,
              leadEmail: leadData.email,
              messageId: emailResult.messageId
            });
          } else {
            errorCount++;
            logger.error('Failed to send 24-hour email reminder', {
              trackingId,
              meetingId: meeting.id,
              leadEmail: leadData.email,
              error: emailResult.error
            });
          }
        } catch (error) {
          errorCount++;
          logger.logError(error, {
            context: 'process_daily_reminder',
            trackingId,
            meetingId: meeting.id
          });
        }
      }

      // Process SMS 24-hour reminders
      await this.processDailySmsReminders(trackingId);

      logger.info('Daily reminder processing completed', {
        trackingId,
        totalMeetings: meetings.length,
        successCount,
        errorCount
      });

    } catch (error) {
      logger.logError(error, {
        context: 'process_daily_reminders',
        trackingId
      });
    }
  }

  /**
   * Process hourly 1-hour meeting reminders
   */
  async processHourlyReminders() {
    const trackingId = generateTrackingId();
    
    try {
      logger.info('Starting hourly reminder processing...', { trackingId });
      
      const meetings = await MeetingService.getMeetingsNeedingHourlyReminders();
      
      if (meetings.length === 0) {
        logger.info('No meetings need 1-hour reminders this hour', { trackingId });
        return;
      }

      logger.info(`Processing ${meetings.length} meetings for 1-hour reminders`, { trackingId });
      
      let successCount = 0;
      let errorCount = 0;

      for (const meeting of meetings) {
        try {
          const leadData = meeting.leads;
          
          // Send 1-hour reminder email
          const emailResult = await CalendlyEmailService.sendAppointmentReminder(
            leadData,
            {
              start_time: meeting.start_time,
              end_time: meeting.end_time,
              meeting_url: meeting.meeting_url,
              location: meeting.location,
              title: meeting.meeting_title
            },
            trackingId
          );

          if (emailResult.success) {
            // Mark reminder as sent
            await MeetingService.markReminderSent(
              meeting.id,
              '1h',
              emailResult.messageId,
              trackingId
            );
            
            successCount++;
            logger.info(`1-hour email reminder sent successfully`, {
              trackingId,
              meetingId: meeting.id,
              leadEmail: leadData.email,
              messageId: emailResult.messageId
            });
          } else {
            errorCount++;
            logger.error('Failed to send 1-hour email reminder', {
              trackingId,
              meetingId: meeting.id,
              leadEmail: leadData.email,
              error: emailResult.error
            });
          }
        } catch (error) {
          errorCount++;
          logger.logError(error, {
            context: 'process_hourly_reminder',
            trackingId,
            meetingId: meeting.id
          });
        }
      }

      // Process SMS 1-hour reminders
      await this.processHourlySmsReminders(trackingId);

      logger.info('Hourly reminder processing completed', {
        trackingId,
        totalMeetings: meetings.length,
        successCount,
        errorCount
      });

    } catch (error) {
      logger.logError(error, {
        context: 'process_hourly_reminders',
        trackingId
      });
    }
  }

  /**
   * Process lead follow-ups for meeting scheduling
   */
  async processLeadFollowUps() {
    const trackingId = generateTrackingId();
    
    try {
      logger.info('Starting lead follow-up processing...', { trackingId });
      
      const leads = await MeetingService.getLeadsNeedingMeetingReminders();
      
      if (leads.length === 0) {
        logger.info('No leads need meeting scheduling reminders today', { trackingId });
        return;
      }

      logger.info(`Processing ${leads.length} leads for meeting scheduling reminders`, { trackingId });
      
      let successCount = 0;
      let errorCount = 0;

      for (const lead of leads) {
        try {
          // Send follow-up email to schedule meeting
          const emailResult = await CalendlyEmailService.sendFollowUpEmail(
            lead,
            process.env.CALENDLY_BOOKING_URL,
            trackingId
          );

          if (emailResult.success) {
            // Update lead to mark reminder sent
            await MeetingService.updateLeadMeetingStatus(
              lead.id,
              null,
              false,
              trackingId
            );
            
            successCount++;
            logger.info(`Meeting scheduling reminder sent successfully`, {
              trackingId,
              leadId: lead.id,
              leadEmail: lead.email,
              messageId: emailResult.messageId
            });
          } else {
            errorCount++;
            logger.error('Failed to send meeting scheduling reminder', {
              trackingId,
              leadId: lead.id,
              leadEmail: lead.email,
              error: emailResult.error
            });
          }
        } catch (error) {
          errorCount++;
          logger.logError(error, {
            context: 'process_lead_followup',
            trackingId,
            leadId: lead.id
          });
        }
      }

      logger.info('Lead follow-up processing completed', {
        trackingId,
        totalLeads: leads.length,
        successCount,
        errorCount
      });

    } catch (error) {
      logger.logError(error, {
        context: 'process_lead_followups',
        trackingId
      });
    }
  }

  /**
   * Get scheduler status
   * @returns {Object} Scheduler status information
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      activeTasks: Array.from(this.scheduledTasks.keys()),
      taskCount: this.scheduledTasks.size
    };
  }

  /**
   * Process SMS 24-hour reminders
   * @param {string} trackingId - Tracking ID for logging
   */
  async processDailySmsReminders(trackingId) {
    try {
      logger.info('Starting SMS 24-hour reminder processing...', { trackingId });
      
      const meetings = await MeetingService.getMeetingsNeedingSms24hReminders();
      
      if (meetings.length === 0) {
        logger.info('No meetings need SMS 24-hour reminders today', { trackingId });
        return;
      }

      logger.info(`Processing ${meetings.length} meetings for SMS 24-hour reminders`, { trackingId });
      
      let successCount = 0;
      let errorCount = 0;

      for (const meeting of meetings) {
        try {
          const smsResult = await MeetingService.sendSmsReminder(meeting, '24h', trackingId);

          if (smsResult.success) {
            successCount++;
            logger.info(`SMS 24-hour reminder sent successfully`, {
              trackingId,
              meetingId: meeting.id,
              leadPhone: meeting.leads?.phone ? 'provided' : 'missing',
              messageSid: smsResult.messageSid
            });
          } else {
            errorCount++;
            logger.error('Failed to send SMS 24-hour reminder', {
              trackingId,
              meetingId: meeting.id,
              error: smsResult.error
            });
          }
        } catch (error) {
          errorCount++;
          logger.logError(error, {
            context: 'process_daily_sms_reminder',
            trackingId,
            meetingId: meeting.id
          });
        }
      }

      logger.info('SMS 24-hour reminder processing completed', {
        trackingId,
        totalMeetings: meetings.length,
        successCount,
        errorCount
      });

    } catch (error) {
      logger.logError(error, {
        context: 'process_daily_sms_reminders',
        trackingId
      });
    }
  }

  /**
   * Process SMS 1-hour reminders
   * @param {string} trackingId - Tracking ID for logging
   */
  async processHourlySmsReminders(trackingId) {
    try {
      logger.info('Starting SMS 1-hour reminder processing...', { trackingId });
      
      const meetings = await MeetingService.getMeetingsNeedingSms1hReminders();
      
      if (meetings.length === 0) {
        logger.info('No meetings need SMS 1-hour reminders this hour', { trackingId });
        return;
      }

      logger.info(`Processing ${meetings.length} meetings for SMS 1-hour reminders`, { trackingId });
      
      let successCount = 0;
      let errorCount = 0;

      for (const meeting of meetings) {
        try {
          const smsResult = await MeetingService.sendSmsReminder(meeting, '1h', trackingId);

          if (smsResult.success) {
            successCount++;
            logger.info(`SMS 1-hour reminder sent successfully`, {
              trackingId,
              meetingId: meeting.id,
              leadPhone: meeting.leads?.phone ? 'provided' : 'missing',
              messageSid: smsResult.messageSid
            });
          } else {
            errorCount++;
            logger.error('Failed to send SMS 1-hour reminder', {
              trackingId,
              meetingId: meeting.id,
              error: smsResult.error
            });
          }
        } catch (error) {
          errorCount++;
          logger.logError(error, {
            context: 'process_hourly_sms_reminder',
            trackingId,
            meetingId: meeting.id
          });
        }
      }

      logger.info('SMS 1-hour reminder processing completed', {
        trackingId,
        totalMeetings: meetings.length,
        successCount,
        errorCount
      });

    } catch (error) {
      logger.logError(error, {
        context: 'process_hourly_sms_reminders',
        trackingId
      });
    }
  }

  /**
   * Manually trigger daily reminders (for testing)
   */
  async triggerDailyReminders() {
    logger.info('Manually triggering daily reminders...');
    await this.processDailyReminders();
  }

  /**
   * Manually trigger hourly reminders (for testing)
   */
  async triggerHourlyReminders() {
    logger.info('Manually triggering hourly reminders...');
    await this.processHourlyReminders();
  }

  /**
   * Manually trigger lead follow-ups (for testing)
   */
  async triggerLeadFollowUps() {
    logger.info('Manually triggering lead follow-ups...');
    await this.processLeadFollowUps();
  }
}

export default new ReminderScheduler();