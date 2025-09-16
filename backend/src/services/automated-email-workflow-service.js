/**
 * Automated Email Workflow Service
 * Manages the complete email automation workflow for leads from HubSpot
 * Integrates with existing services for comprehensive lead nurturing
 */

import { db } from '../config/index.js';
import { leads, emailQueue, workflowAutomation } from '../db/schema.js';
import { eq, and, isNull, gte, lte, desc, inArray, lt, gt } from 'drizzle-orm';
import logger from '../utils/logger.js';
import { generateTrackingId } from '../utils/crypto.js';
import emailTemplateService from './email-template-service.js';
import { hashForLogging } from '../utils/crypto.js';

class AutomatedEmailWorkflowService {
  constructor() {
    this.emailTemplateService = emailTemplateService;
    this.isRunning = false;
    this.monitoringInterval = null;
    this.intervalMs = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Initialize email workflow for a new lead
   * Called when a new lead is retrieved from HubSpot
   */
  async initializeLeadEmailWorkflow(leadId, trackingId) {
    try {
      logger.info('Initializing email workflow for new lead', {
        trackingId,
        leadId
      });

      // Get lead data
      const leadData = await this.getLeadData(leadId);
      if (!leadData) {
        throw new Error(`Lead not found: ${leadId}`);
      }

      // Step 1: Queue initial meeting scheduling invitation
      await this.queueMeetingSchedulingInvitation(leadData, trackingId);

      // Step 2: Create monitoring workflow for lead status updates
      await this.createLeadMonitoringWorkflow(leadData, trackingId);

      logger.info('Email workflow initialized successfully', {
        trackingId,
        leadId,
        email: hashForLogging(leadData.email)
      });

      return {
        success: true,
        leadId,
        workflowsCreated: ['meeting_invitation', 'status_monitoring']
      };

    } catch (error) {
      logger.error('Failed to initialize email workflow', {
        trackingId,
        leadId,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Queue meeting scheduling invitation email
   */
  async queueMeetingSchedulingInvitation(leadData, trackingId) {
    try {
      const calendlyLink = process.env.CALENDLY_BOOKING_URL || process.env.CALENDLY_LINK || 'https://calendly.com/your-link';
      
      // Use existing email template service
      const result = await this.emailTemplateService.queueAppointmentEmail(
        leadData,
        calendlyLink,
        trackingId
      );

      // Create workflow automation entry for tracking
      await db.insert(workflowAutomation).values({
        leadId: leadData.id,
        workflowType: 'email_automation',
        stepName: 'meeting_scheduling_invitation',
        scheduledAt: new Date(),
        status: 'completed',
        metadata: {
          emailQueueId: result.queueId,
          emailType: 'meeting_invitation',
          calendlyLink,
          trackingId
        }
      });

      logger.info('Meeting scheduling invitation queued', {
        trackingId,
        leadId: leadData.id,
        email: hashForLogging(leadData.email),
        queueId: result.queueId
      });

      return result;

    } catch (error) {
      logger.error('Failed to queue meeting scheduling invitation', {
        trackingId,
        leadId: leadData.id,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Create monitoring workflow for lead status updates
   */
  async createLeadMonitoringWorkflow(leadData, trackingId) {
    try {
      // Create workflow to monitor for meeting scheduling
      await db.insert(workflowAutomation).values({
        leadId: leadData.id,
        workflowType: 'email_automation',
        stepName: 'monitor_meeting_status',
        scheduledAt: new Date(Date.now() + 60 * 60 * 1000), // Start monitoring in 1 hour
        status: 'pending',
        metadata: {
          monitoringType: 'meeting_scheduling',
          checkInterval: '6_hours',
          maxMonitoringDays: 7,
          trackingId
        }
      });

      // Create workflow for 24-hour follow-up if no meeting scheduled
      await db.insert(workflowAutomation).values({
        leadId: leadData.id,
        workflowType: 'email_automation',
        stepName: 'followup_reminder_24h',
        scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
        status: 'pending',
        metadata: {
          reminderType: 'unscheduled_meeting',
          trackingId
        }
      });

      logger.info('Lead monitoring workflows created', {
        trackingId,
        leadId: leadData.id,
        workflows: ['monitor_meeting_status', 'followup_reminder_24h']
      });

    } catch (error) {
      logger.error('Failed to create lead monitoring workflow', {
        trackingId,
        leadId: leadData.id,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Process meeting scheduled event
   * Called when a lead schedules a meeting
   */
  async processMeetingScheduled(leadId, meetingData, trackingId) {
    try {
      logger.info('Processing meeting scheduled event', {
        trackingId,
        leadId,
        scheduledAt: meetingData.scheduledAt
      });

      // Get lead data
      const leadData = await this.getLeadData(leadId);
      if (!leadData) {
        throw new Error(`Lead not found: ${leadId}`);
      }

      // Cancel pending follow-up reminders for unscheduled meetings
      await this.cancelUnscheduledFollowUps(leadId, trackingId);

      // Create meeting reminder workflows
      await this.createMeetingReminderWorkflows(leadData, meetingData, trackingId);

      logger.info('Meeting scheduled processing completed', {
        trackingId,
        leadId,
        email: hashForLogging(leadData.email)
      });

      return {
        success: true,
        leadId,
        workflowsCreated: ['meeting_reminders']
      };

    } catch (error) {
      logger.error('Failed to process meeting scheduled event', {
        trackingId,
        leadId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Create meeting reminder workflows
   */
  async createMeetingReminderWorkflows(leadData, meetingData, trackingId) {
    try {
      const meetingTime = new Date(meetingData.scheduledAt);
      const now = new Date();

      // Create 24-hour reminder if meeting is more than 24 hours away
      if (meetingTime.getTime() > now.getTime() + 24 * 60 * 60 * 1000) {
        await db.insert(workflowAutomation).values({
          leadId: leadData.id,
          workflowType: 'email_automation',
          stepName: 'meeting_reminder_24h',
          scheduledAt: new Date(meetingTime.getTime() - 24 * 60 * 60 * 1000),
          status: 'pending',
          metadata: {
            reminderType: 'meeting_24h',
            meetingTime: meetingTime.toISOString(),
            trackingId
          }
        });
      }

      // Create 1-hour reminder if meeting is more than 1 hour away
      if (meetingTime.getTime() > now.getTime() + 60 * 60 * 1000) {
        await db.insert(workflowAutomation).values({
          leadId: leadData.id,
          workflowType: 'email_automation',
          stepName: 'meeting_reminder_1h',
          scheduledAt: new Date(meetingTime.getTime() - 60 * 60 * 1000),
          status: 'pending',
          metadata: {
            reminderType: 'meeting_1h',
            meetingTime: meetingTime.toISOString(),
            trackingId
          }
        });
      }

      logger.info('Meeting reminder workflows created', {
        trackingId,
        leadId: leadData.id,
        meetingTime: meetingTime.toISOString()
      });

    } catch (error) {
      logger.error('Failed to create meeting reminder workflows', {
        trackingId,
        leadId: leadData.id,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Cancel pending follow-up reminders for unscheduled meetings
   */
  async cancelUnscheduledFollowUps(leadId, trackingId) {
    try {
      await db.update(workflowAutomation)
        .set({
          status: 'cancelled',
          updatedAt: new Date()
        })
        .where(
          and(
            eq(workflowAutomation.leadId, leadId),
            eq(workflowAutomation.stepName, 'followup_reminder_24h'),
            eq(workflowAutomation.status, 'pending')
          )
        );

      logger.info('Cancelled unscheduled follow-up reminders', {
        trackingId,
        leadId
      });

    } catch (error) {
      logger.error('Failed to cancel unscheduled follow-ups', {
        trackingId,
        leadId,
        error: error.message
      });
    }
  }

  /**
   * Process follow-up reminder for unscheduled leads
   */
  async processFollowUpReminder(leadId, trackingId) {
    try {
      logger.info('Processing follow-up reminder for unscheduled lead', {
        trackingId,
        leadId
      });

      // Get lead data
      const leadData = await this.getLeadData(leadId);
      if (!leadData) {
        throw new Error(`Lead not found: ${leadId}`);
      }

      // Check if meeting has been scheduled since workflow was created
      if (leadData.scheduledAt) {
        logger.info('Lead has scheduled meeting, skipping follow-up reminder', {
          trackingId,
          leadId,
          scheduledAt: leadData.scheduledAt
        });
        return { success: true, skipped: true, reason: 'meeting_scheduled' };
      }

      // Queue follow-up email
      const calendlyLink = process.env.CALENDLY_BOOKING_URL || process.env.CALENDLY_LINK || 'https://calendly.com/your-link';
      
      const result = await this.emailTemplateService.queueFollowUpEmail(
        leadData,
        calendlyLink,
        trackingId
      );

      logger.info('Follow-up reminder email queued', {
        trackingId,
        leadId,
        email: hashForLogging(leadData.email),
        queueId: result.queueId
      });

      return {
        success: true,
        leadId,
        emailQueued: true,
        queueId: result.queueId
      };

    } catch (error) {
      logger.error('Failed to process follow-up reminder', {
        trackingId,
        leadId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Start continuous monitoring for lead status updates
   */
  async startContinuousMonitoring() {
    if (this.isRunning) {
      logger.warn('Email workflow monitoring is already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting automated email workflow monitoring', {
      intervalMs: this.intervalMs
    });

    this.monitoringInterval = setInterval(async () => {
      try {
        await this.processScheduledWorkflows();
      } catch (error) {
        logger.error('Error in email workflow monitoring cycle', {
          error: error.message,
          stack: error.stack
        });
      }
    }, this.intervalMs);
  }

  /**
   * Stop continuous monitoring
   */
  stopContinuousMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    this.isRunning = false;
    logger.info('Stopped automated email workflow monitoring');
  }

  /**
   * Process scheduled email workflows
   */
  async processScheduledWorkflows() {
    const trackingId = generateTrackingId();
    
    try {
      // Get pending email automation workflows that are due
      const pendingWorkflows = await db.select()
        .from(workflowAutomation)
        .where(
          and(
            eq(workflowAutomation.workflowType, 'email_automation'),
            eq(workflowAutomation.status, 'pending'),
            lte(workflowAutomation.scheduledAt, new Date())
          )
        )
        .orderBy(workflowAutomation.scheduledAt)
        .limit(50);

      if (pendingWorkflows.length === 0) {
        return { processed: 0, message: 'No pending workflows' };
      }

      logger.info('Processing scheduled email workflows', {
        trackingId,
        count: pendingWorkflows.length
      });

      let processed = 0;
      let errors = 0;

      for (const workflow of pendingWorkflows) {
        try {
          await this.processWorkflowStep(workflow, trackingId);
          processed++;
        } catch (error) {
          errors++;
          logger.error('Failed to process workflow step', {
            trackingId,
            workflowId: workflow.id,
            stepName: workflow.stepName,
            error: error.message
          });
        }
      }

      logger.info('Completed processing scheduled email workflows', {
        trackingId,
        processed,
        errors
      });

      return { processed, errors };

    } catch (error) {
      logger.error('Failed to process scheduled workflows', {
        trackingId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Process individual workflow step
   */
  async processWorkflowStep(workflow, trackingId) {
    try {
      // Mark workflow as executing
      await db.update(workflowAutomation)
        .set({
          status: 'executing',
          executedAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(workflowAutomation.id, workflow.id));

      let result;
      
      switch (workflow.stepName) {
        case 'followup_reminder_24h':
          result = await this.processFollowUpReminder(workflow.leadId, trackingId);
          break;
          
        case 'meeting_reminder_24h':
        case 'meeting_reminder_1h':
          result = await this.processMeetingReminder(workflow, trackingId);
          break;
          
        case 'monitor_meeting_status':
          result = await this.processStatusMonitoring(workflow, trackingId);
          break;
          
        default:
          throw new Error(`Unknown workflow step: ${workflow.stepName}`);
      }

      // Mark workflow as completed
      await db.update(workflowAutomation)
        .set({
          status: 'completed',
          updatedAt: new Date(),
          metadata: {
            ...workflow.metadata,
            result,
            completedAt: new Date().toISOString()
          }
        })
        .where(eq(workflowAutomation.id, workflow.id));

      logger.info('Workflow step completed successfully', {
        trackingId,
        workflowId: workflow.id,
        stepName: workflow.stepName,
        leadId: workflow.leadId
      });

    } catch (error) {
      // Mark workflow as failed
      await db.update(workflowAutomation)
        .set({
          status: 'failed',
          errorMessage: error.message,
          updatedAt: new Date()
        })
        .where(eq(workflowAutomation.id, workflow.id));

      throw error;
    }
  }

  /**
   * Process meeting reminder
   */
  async processMeetingReminder(workflow, trackingId) {
    try {
      const leadData = await this.getLeadData(workflow.leadId);
      if (!leadData) {
        throw new Error(`Lead not found: ${workflow.leadId}`);
      }

      // Check if meeting is still scheduled
      if (!leadData.scheduledAt) {
        logger.info('Meeting no longer scheduled, skipping reminder', {
          trackingId,
          leadId: workflow.leadId
        });
        return { success: true, skipped: true, reason: 'meeting_cancelled' };
      }

      // Queue meeting reminder email
      const reminderType = workflow.stepName === 'meeting_reminder_24h' ? '24h' : '1h';
      const result = await this.emailTemplateService.queueMeetingReminderEmail(
        leadData,
        reminderType,
        trackingId
      );

      logger.info('Meeting reminder email queued', {
        trackingId,
        leadId: workflow.leadId,
        reminderType,
        queueId: result.queueId
      });

      return {
        success: true,
        reminderType,
        emailQueued: true,
        queueId: result.queueId
      };

    } catch (error) {
      logger.error('Failed to process meeting reminder', {
        trackingId,
        workflowId: workflow.id,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Process status monitoring
   */
  async processStatusMonitoring(workflow, trackingId) {
    try {
      const leadData = await this.getLeadData(workflow.leadId);
      if (!leadData) {
        throw new Error(`Lead not found: ${workflow.leadId}`);
      }

      // Check if meeting has been scheduled
      if (leadData.scheduledAt) {
        // Meeting scheduled - trigger meeting reminder workflows
        await this.processMeetingScheduled(
          workflow.leadId,
          { scheduledAt: leadData.scheduledAt },
          trackingId
        );
        
        return {
          success: true,
          statusChange: 'meeting_scheduled',
          scheduledAt: leadData.scheduledAt
        };
      }

      // Check if we should continue monitoring
      const workflowAge = Date.now() - new Date(workflow.createdAt).getTime();
      const maxMonitoringTime = 7 * 24 * 60 * 60 * 1000; // 7 days

      if (workflowAge > maxMonitoringTime) {
        logger.info('Maximum monitoring period reached', {
          trackingId,
          leadId: workflow.leadId,
          workflowAge: workflowAge / (24 * 60 * 60 * 1000) + ' days'
        });
        
        return {
          success: true,
          statusChange: 'monitoring_expired',
          reason: 'max_monitoring_period_reached'
        };
      }

      // Schedule next monitoring check
      await db.insert(workflowAutomation).values({
        leadId: workflow.leadId,
        workflowType: 'email_automation',
        stepName: 'monitor_meeting_status',
        scheduledAt: new Date(Date.now() + 6 * 60 * 60 * 1000), // Check again in 6 hours
        status: 'pending',
        metadata: {
          ...workflow.metadata,
          previousCheckAt: new Date().toISOString()
        }
      });

      return {
        success: true,
        statusChange: 'continue_monitoring',
        nextCheckAt: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString()
      };

    } catch (error) {
      logger.error('Failed to process status monitoring', {
        trackingId,
        workflowId: workflow.id,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get lead data by ID
   */
  async getLeadData(leadId) {
    try {
      const result = await db.select()
        .from(leads)
        .where(eq(leads.id, leadId))
        .limit(1);

      return result.length > 0 ? result[0] : null;
    } catch (error) {
      logger.error('Failed to get lead data', {
        leadId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get workflow status for a lead
   */
  async getLeadWorkflowStatus(leadId) {
    try {
      const workflows = await db.select()
        .from(workflowAutomation)
        .where(
          and(
            eq(workflowAutomation.leadId, leadId),
            eq(workflowAutomation.workflowType, 'email_automation')
          )
        )
        .orderBy(desc(workflowAutomation.createdAt));

      return {
        leadId,
        totalWorkflows: workflows.length,
        pending: workflows.filter(w => w.status === 'pending').length,
        completed: workflows.filter(w => w.status === 'completed').length,
        failed: workflows.filter(w => w.status === 'failed').length,
        workflows
      };
    } catch (error) {
      logger.error('Failed to get lead workflow status', {
        leadId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get service status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      intervalMs: this.intervalMs,
      hasMonitoringInterval: !!this.monitoringInterval
    };
  }
}

const automatedEmailWorkflowService = new AutomatedEmailWorkflowService();
export default automatedEmailWorkflowService;
export { AutomatedEmailWorkflowService };