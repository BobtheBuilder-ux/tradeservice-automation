import { and, asc, eq, isNull, lte, or } from 'drizzle-orm';
import { db } from '../config/index.js';
import { bobActions, emailQueue, leadConversations, leads } from '../db/schema.js';
import logger from '../utils/logger.js';
import { generateTrackingId } from '../utils/crypto.js';
import leadConversationService from './lead-conversation-service.js';
import bobOrchestrator from './bob-orchestrator.js';
import leadAutomationService from './lead-automation-service.js';

class BobActionExecutor {
  constructor() {
    this.isRunning = false;
    this.intervalId = null;
    this.intervalMs = 60 * 1000;
    this.batchSize = 20;
  }

  start() {
    if (this.isRunning) {
      logger.info('Bob action executor already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting Bob action executor', {
      intervalMs: this.intervalMs,
      batchSize: this.batchSize,
    });

    this.processDueActions().catch((error) => {
      logger.logError(error, { context: 'bob_action_executor_initial_cycle' });
    });

    this.intervalId = setInterval(() => {
      this.processDueActions().catch((error) => {
        logger.logError(error, { context: 'bob_action_executor_cycle' });
      });
    }, this.intervalMs);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.isRunning = false;
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      intervalMs: this.intervalMs,
      batchSize: this.batchSize,
    };
  }

  buildBookingLink(lead, trackingId) {
    const baseUrl = process.env.BACKEND_URL || 'http://localhost:3001';
    const params = new URLSearchParams({
      name: lead.fullName || lead.firstName || '',
      email: lead.email || '',
      trackingId,
    });

    return `${baseUrl}/book-now?${params.toString()}`;
  }

  buildEmailContent(type, lead, trackingId) {
    const bookingLink = this.buildBookingLink(lead, trackingId);
    const firstName = lead.firstName || lead.fullName || 'there';

    if (type === 'send_follow_up_email') {
      return {
        subject: `Quick follow-up, ${firstName}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;line-height:1.6;color:#1f2937;">
            <h2 style="margin-bottom:12px;">Hi ${firstName},</h2>
            <p>I wanted to follow up in case you still want help getting your consultation booked.</p>
            <p>If you're still interested, you can grab a time that works best for you here:</p>
            <p style="margin:24px 0;">
              <a href="${bookingLink}" style="background:#111827;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;">Schedule my meeting</a>
            </p>
            <p>If you'd rather reply with a few times that work for you, that's fine too.</p>
            <p>Best,<br />Bob</p>
          </div>
        `,
        text: `Hi ${firstName},\n\nI wanted to follow up in case you still want help getting your consultation booked.\n\nBook here: ${bookingLink}\n\nIf you'd rather reply with a few times that work for you, that's fine too.\n\nBest,\nBob`,
        template: 'follow_up_booking',
      };
    }

    return {
      subject: `Welcome ${firstName} — let's get your meeting booked`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;line-height:1.6;color:#1f2937;">
          <h2 style="margin-bottom:12px;">Hi ${firstName},</h2>
          <p>Thanks for reaching out. I’d be happy to help you take the next step.</p>
          <p>You can book your consultation here:</p>
          <p style="margin:24px 0;">
            <a href="${bookingLink}" style="background:#111827;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;">Book my meeting</a>
          </p>
          <p>If you have questions before booking, just reply and I’ll help.</p>
          <p>Best,<br />Bob</p>
        </div>
      `,
      text: `Hi ${firstName},\n\nThanks for reaching out. I’d be happy to help you take the next step.\n\nBook your consultation here: ${bookingLink}\n\nIf you have questions before booking, just reply and I’ll help.\n\nBest,\nBob`,
      template: 'welcome_booking',
    };
  }

  async getDueActions() {
    return db
      .select()
      .from(bobActions)
      .where(
        and(
          or(eq(bobActions.status, 'pending'), eq(bobActions.status, 'deferred')),
          or(lte(bobActions.scheduledFor, new Date()), isNull(bobActions.scheduledFor))
        )
      )
      .orderBy(asc(bobActions.scheduledFor), asc(bobActions.createdAt))
      .limit(this.batchSize);
  }

  async getLead(leadId) {
    const rows = await db
      .select({
        id: leads.id,
        email: leads.email,
        firstName: leads.firstName,
        fullName: leads.fullName,
        phone: leads.phone,
        source: leads.source,
        status: leads.status,
        assignedAgentId: leads.assignedAgentId,
        scheduledAt: leads.scheduledAt,
        meetingScheduled: leads.meetingScheduled,
        createdAt: leads.createdAt,
        updatedAt: leads.updatedAt,
        trackingId: leads.trackingId,
      })
      .from(leads)
      .where(eq(leads.id, leadId))
      .limit(1);

    return rows[0] || null;
  }

  async getConversation(conversationId) {
    if (!conversationId) return null;

    const rows = await db
      .select()
      .from(leadConversations)
      .where(eq(leadConversations.id, conversationId))
      .limit(1);

    return rows[0] || null;
  }

  async markAction(actionId, status, patch = {}) {
    const [updated] = await db
      .update(bobActions)
      .set({
        status,
        updatedAt: new Date(),
        ...patch,
      })
      .where(eq(bobActions.id, actionId))
      .returning();

    return updated;
  }

  async queueEmailAction(action, lead) {
    if (!lead.email) {
      await this.markAction(action.id, 'failed', {
        result: { error: 'Lead has no email address' },
      });
      return;
    }

    const trackingId = lead.trackingId || generateTrackingId();
    const email = this.buildEmailContent(action.actionType, lead, trackingId);
    const { conversation, message } = await leadConversationService.logQueuedOutboundEmail({
      lead,
      subject: email.subject,
      bodyText: email.text,
      bodyHtml: email.html,
      metadata: {
        actionType: action.actionType,
        template: email.template,
        bobActionId: action.id,
      },
    });

    const [queuedEmail] = await db
      .insert(emailQueue)
      .values({
        leadId: lead.id,
        toEmail: lead.email,
        fromEmail: process.env.EMAIL_FROM || 'noreply@tradeservice-automation.com',
        subject: email.subject,
        htmlContent: email.html,
        textContent: email.text,
        emailType: email.template,
        status: 'scheduled',
        scheduledFor: new Date().toISOString(),
        trackingId,
        metadata: {
          source: 'bob_phase_1',
          bobActionId: action.id,
          conversationId: conversation.id,
          conversationMessageId: message.id,
          template: email.template,
        },
      })
      .returning();

    await leadConversationService.markMessageStatus(message.id, 'queued', {
      metadata: {
        ...(message.metadata || {}),
        emailQueueId: queuedEmail.id,
      },
    });

    await this.markAction(action.id, 'completed', {
      executedAt: new Date(),
      result: {
        queueId: queuedEmail.id,
        conversationId: conversation.id,
        messageId: message.id,
        template: email.template,
      },
    });
  }

  async queueCallAttempt(action, lead, conversation) {
    const conversationRecord = conversation || (await leadConversationService.ensurePrimaryConversation(lead, 'email'));
    const existingMetadata = conversationRecord.metadata || {};
    const callQueueCount = Number(existingMetadata.callQueueCount || 0) + 1;

    await leadConversationService.logSystemEvent({
      lead,
      conversationId: conversationRecord.id,
      channel: 'phone',
      messageType: 'call_queue',
      subject: 'Bob queued a phone follow-up',
      bodyText: lead.phone
        ? 'Lead has not booked after email follow-up. Phone outreach has been queued for manual/Phase 2 voice handling.'
        : 'Lead is due for phone outreach, but no phone number is available yet.',
      metadata: {
        bobActionId: action.id,
        requiresPhone: Boolean(lead.phone),
      },
    });

    await leadConversationService.updateConversation(conversationRecord.id, {
      metadata: {
        ...existingMetadata,
        callQueuedAt: new Date().toISOString(),
        callQueueCount,
      },
      nextAction: 'queue_call_attempt',
      nextActionAt: null,
      lastSummary: lead.phone
        ? 'Bob queued a phone outreach attempt for this lead.'
        : 'Bob flagged this lead for phone outreach but no phone number is available.',
    });

    await this.markAction(action.id, 'awaiting_call', {
      executedAt: new Date(),
      result: {
        queueState: lead.phone ? 'ready_for_calling' : 'missing_phone_number',
        callQueueCount,
      },
    });
  }

  async executeAction(action) {
    const lead = await this.getLead(action.leadId);
    if (!lead) {
      await this.markAction(action.id, 'failed', {
        result: { error: 'Lead not found' },
      });
      return;
    }

    const conversation = await this.getConversation(action.conversationId);

    switch (action.actionType) {
      case 'assign_lead': {
        const trackingId = lead.trackingId || generateTrackingId();
        const result = await leadAutomationService.autoAssignLead(lead.id, trackingId);

        if (!result.success) {
          await this.markAction(action.id, 'deferred', {
            scheduledFor: new Date(Date.now() + 15 * 60 * 1000),
            result: { error: result.error || 'Lead assignment failed' },
          });
          return;
        }

        await leadConversationService.logSystemEvent({
          lead,
          conversationId: action.conversationId,
          channel: 'system',
          messageType: 'assignment',
          subject: 'Lead assigned',
          bodyText: `Lead was auto-assigned to ${result.agent?.name || 'an agent'}.`,
          metadata: {
            bobActionId: action.id,
            assignedAgentId: result.agent?.id,
          },
        });

        await this.markAction(action.id, 'completed', {
          executedAt: new Date(),
          result: {
            assignedAgentId: result.agent?.id,
            assignedAgentName: result.agent?.name,
          },
        });

        const refreshedLead = await this.getLead(lead.id);
        if (refreshedLead) {
          await bobOrchestrator.syncLead(refreshedLead);
        }
        return;
      }
      case 'send_intro_email':
      case 'send_follow_up_email':
        await this.queueEmailAction(action, lead);
        return;
      case 'queue_call_attempt':
        await this.queueCallAttempt(action, lead, conversation);
        return;
      case 'monitor_meeting':
      case 'hold':
      case 'wait':
      case 'noop':
        await this.markAction(action.id, 'completed', {
          executedAt: new Date(),
          result: { note: 'No execution required for this action type' },
        });
        return;
      default:
        await this.markAction(action.id, 'failed', {
          result: { error: `Unsupported action type: ${action.actionType}` },
        });
    }
  }

  async processDueActions() {
    const actions = await this.getDueActions();
    if (actions.length === 0) {
      return [];
    }

    const results = [];
    for (const action of actions) {
      try {
        await this.markAction(action.id, 'processing');
        await this.executeAction(action);
        results.push({ actionId: action.id, actionType: action.actionType, success: true });
      } catch (error) {
        logger.logError(error, {
          context: 'bob_action_execution',
          actionId: action.id,
          actionType: action.actionType,
          leadId: action.leadId,
        });

        await this.markAction(action.id, 'failed', {
          result: { error: error.message },
        });
        results.push({ actionId: action.id, actionType: action.actionType, success: false, error: error.message });
      }
    }

    logger.info('Bob action executor processed actions', {
      processed: results.length,
      successes: results.filter((item) => item.success).length,
      failures: results.filter((item) => !item.success).length,
    });

    return results;
  }
}

const bobActionExecutor = new BobActionExecutor();
export default bobActionExecutor;
export { BobActionExecutor };
