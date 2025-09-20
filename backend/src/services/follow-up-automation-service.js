import { db } from '../db/connection.js';
import { leads, emailQueue } from '../db/schema.js';
import { eq, and, isNull, gte, desc, inArray, lt, gt } from 'drizzle-orm';
import logger from '../utils/logger.js';
import { generateTrackingId } from '../utils/tracking.js';
import EmailTemplateService from './email-template-service.js';

class FollowUpAutomationService {
  constructor() {
    this.isRunning = false;
    this.intervalId = null;
    this.checkInterval = 30 * 60 * 1000; // 30 minutes
  }

  /**
   * Start the follow-up automation service
   */
  start() {
    if (this.isRunning) {
      logger.info('Follow-up automation service is already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting follow-up automation service...');

    // Run immediately
    this.processFollowUps();

    // Schedule periodic runs
    this.intervalId = setInterval(() => {
      this.processFollowUps();
    }, this.checkInterval);

    logger.info(`Follow-up automation service started with ${this.checkInterval / 60000} minute intervals`);
  }

  /**
   * Stop the follow-up automation service
   */
  stop() {
    if (!this.isRunning) {
      logger.info('Follow-up automation service is not running');
      return;
    }

    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    logger.info('Follow-up automation service stopped');
  }

  /**
   * Process follow-up emails for unscheduled leads
   */
  async processFollowUps() {
    const trackingId = generateTrackingId();

    try {
      logger.info('Starting follow-up automation processing...', { trackingId });

      // Get leads that need follow-up emails
      const unscheduledLeads = await this.getUnscheduledLeads();

      if (unscheduledLeads.length === 0) {
        logger.info('No leads need follow-up emails at this time', { trackingId });
        return;
      }

      logger.info(`Processing ${unscheduledLeads.length} leads for follow-up emails`, { trackingId });

      let successCount = 0;
      let errorCount = 0;

      for (const lead of unscheduledLeads) {
        try {
          await this.queueFollowUpEmail(lead, trackingId);
          successCount++;
        } catch (error) {
          errorCount++;
          logger.error('Failed to queue follow-up email', {
            trackingId,
            leadId: lead.id,
            error: error.message
          });
        }
      }

      logger.info('Follow-up automation processing completed', {
        trackingId,
        totalLeads: unscheduledLeads.length,
        successCount,
        errorCount
      });

    } catch (error) {
      logger.error('Error in follow-up automation processing', {
        trackingId,
        error: error.message,
        stack: error.stack
      });
    }
  }

  /**
   * Get leads that need follow-up emails
   */
  async getUnscheduledLeads() {
    const leadsData = await db
      .select({
        id: leads.id,
        email: leads.email,
        fullName: leads.fullName,
        createdAt: leads.createdAt,
        status: leads.status,
        scheduledAt: leads.scheduledAt,
        meetingScheduled: leads.meetingScheduled
      })
      .from(leads)
      .where(
        and(
          inArray(leads.status, ['new', 'contacted']),
          isNull(leads.scheduledAt),
          eq(leads.meetingScheduled, false), // Only leads who haven't confirmed meeting scheduled
          lt(leads.createdAt, new Date(Date.now() - 48 * 60 * 60 * 1000)), // 48 hours ago
          gt(leads.createdAt, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)) // 7 days ago
        )
      )
      .limit(50);

    // Filter out leads that already have recent follow-up emails
    const leadsWithoutRecentFollowUp = [];
    
    for (const lead of leadsData) {
      const hasRecentFollowUp = await this.hasRecentFollowUpEmail(lead.email);
      if (!hasRecentFollowUp) {
        leadsWithoutRecentFollowUp.push(lead);
      }
    }

    return leadsWithoutRecentFollowUp;
  }

  /**
   * Check if lead has received a recent follow-up email
   */
  async hasRecentFollowUpEmail(email) {
    try {
      const recentEmails = await db
        .select({ id: emailQueue.id })
        .from(emailQueue)
        .where(
          and(
            eq(emailQueue.toEmail, email),
            eq(emailQueue.emailType, 'follow_up'),
            gt(emailQueue.createdAt, new Date(Date.now() - 48 * 60 * 60 * 1000)) // 48 hours ago
          )
        )
        .limit(1);

      return recentEmails && recentEmails.length > 0;
    } catch (error) {
      logger.error('Error checking recent follow-up emails', {
        email,
        error: error.message
      });
      return false; // Assume no recent email if error
    }
  }

  /**
   * Queue follow-up email for a lead
   */
  async queueFollowUpEmail(lead, trackingId) {
    // Check if this lead has received a recent follow-up email
    const hasRecentEmail = await this.hasRecentFollowUpEmail(lead.email);
    
    if (hasRecentEmail) {
      logger.info('Skipping follow-up email - recent email already sent', {
        trackingId,
        leadId: lead.id,
        email: lead.email
      });
      return { skipped: true, reason: 'recent_email_exists' };
    }

    const calendlyLink = process.env.CALENDLY_BOOKING_URL || process.env.CALENDLY_LINK;

    const leadData = {
      id: lead.id,
      email: lead.email,
      full_name: lead.full_name || 'Valued Customer'
    };

    const result = await EmailTemplateService.queueFollowUpEmail(
      leadData,
      calendlyLink,
      trackingId
    );

    logger.info('Follow-up email queued for unscheduled lead', {
      trackingId,
      leadId: lead.id,
      email: lead.email,
      queueId: result.queueId
    });

    // Update lead status to indicate follow-up sent
    await this.updateLeadFollowUpStatus(lead.id);

    return result;
  }

  /**
   * Update lead status after follow-up email is queued
   */
  async updateLeadFollowUpStatus(leadId) {
    try {
      await db
        .update(leads)
        .set({
          status: 'contacted',
          updatedAt: new Date()
        })
        .where(
          and(
            eq(leads.id, leadId),
            eq(leads.status, 'new') // Only update if still 'new'
          )
        );
    } catch (error) {
      logger.error('Failed to update lead follow-up status', {
        leadId,
        error: error.message
      });
    }
  }

  /**
   * Get service status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      checkInterval: this.checkInterval,
      nextCheck: this.intervalId ? new Date(Date.now() + this.checkInterval) : null
    };
  }

  /**
   * Manual trigger for follow-up processing (for testing)
   */
  async triggerManualRun() {
    logger.info('Manual follow-up automation trigger initiated');
    await this.processFollowUps();
  }
}

export default new FollowUpAutomationService();