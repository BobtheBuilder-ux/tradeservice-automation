import logger from '../utils/logger.js';
import { generateTrackingId } from '../utils/crypto.js';
import leadConversationService from './lead-conversation-service.js';
import bobOrchestrator from './bob-orchestrator.js';
import twilioSmsService from './twilio-sms-service.js';
import insforgeDataService from './insforge-data-service.js';

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
    const configuredCalendlyUrl = process.env.CALENDLY_SCHEDULING_URL || process.env.CALENDLY_BOOKING_URL || process.env.CALENDLY_LINK;
    if (configuredCalendlyUrl) {
      const schedulingUrl = new URL(configuredCalendlyUrl);
      if (lead.fullName || lead.firstName) {
        schedulingUrl.searchParams.set('name', lead.fullName || [lead.firstName, lead.lastName].filter(Boolean).join(' '));
      }
      if (lead.email) {
        schedulingUrl.searchParams.set('email', lead.email);
      }
      schedulingUrl.searchParams.set('utm_source', 'bob_automation');
      schedulingUrl.searchParams.set('utm_medium', 'automation');
      schedulingUrl.searchParams.set('utm_campaign', 'lead_booking');
      schedulingUrl.searchParams.set('utm_content', lead.id || trackingId);
      schedulingUrl.searchParams.set('trackingId', trackingId);
      return schedulingUrl.toString();
    }

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
    const preferredWindow = lead.preferredMeetingWindow ? ` Preferred time window: ${lead.preferredMeetingWindow}.` : '';
    const serviceLine = lead.serviceInterest ? `I’d love to learn more about your interest in ${lead.serviceInterest}. ` : '';
    const locationLine = lead.locationSummary ? `I also noted your location as ${lead.locationSummary}. ` : '';

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
        conversationStatus: 'awaiting_reply',
      };
    }

    if (type === 'request_more_info') {
      return {
        subject: `A few quick questions before we book, ${firstName}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;line-height:1.6;color:#1f2937;">
            <h2 style="margin-bottom:12px;">Hi ${firstName},</h2>
            <p>${serviceLine}${locationLine}Before I point you to the best next step, I want to make sure we’re sending you in the right direction.</p>
            <p>Could you reply with these quick details?</p>
            <ul>
              <li>What service or outcome are you looking for?</li>
              <li>What timeline are you working with?</li>
              <li>Do you already know the best day/time for a call?${preferredWindow}</li>
            </ul>
            <p>Once I have that, I can help you get booked faster.</p>
            <p>Best,<br />Bob</p>
          </div>
        `,
        text: `Hi ${firstName},\n\n${serviceLine}Before I point you to the best next step, could you reply with:\n- what service or outcome you want\n- your timeline\n- the best day/time for a call${preferredWindow}\n\nOnce I have that, I can help you get booked faster.\n\nBest,\nBob`,
        template: 'qualification_request',
        conversationStatus: 'awaiting_reply',
        lastIntent: 'qualification_requested',
      };
    }

    if (type === 'send_booking_reminder') {
      return {
        subject: `Ready when you are, ${firstName}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;line-height:1.6;color:#1f2937;">
            <h2 style="margin-bottom:12px;">Hi ${firstName},</h2>
            <p>I’m checking back in because it looks like you’re still a good fit for a consultation, but your meeting isn’t booked yet.</p>
            <p>${serviceLine}${preferredWindow}</p>
            <p>You can reserve a time here:</p>
            <p style="margin:24px 0;">
              <a href="${bookingLink}" style="background:#111827;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;">Book my consultation</a>
            </p>
            <p>If you want me to help narrow down a time window first, just reply and I’ll help you sort it out.</p>
            <p>Best,<br />Bob</p>
          </div>
        `,
        text: `Hi ${firstName},\n\nIt looks like you're still a good fit for a consultation, but your meeting isn’t booked yet.\n\n${serviceLine}${preferredWindow}\n\nReserve a time here: ${bookingLink}\n\nIf you want help narrowing down a time window first, just reply and I’ll help.\n\nBest,\nBob`,
        template: 'booking_reminder',
        conversationStatus: 'ready_to_book',
        lastIntent: 'booking_reminder_sent',
      };
    }

    if (type === 'send_booking_invite') {
      return {
        subject: `Let’s get your consultation booked, ${firstName}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;line-height:1.6;color:#1f2937;">
            <h2 style="margin-bottom:12px;">Hi ${firstName},</h2>
            <p>Thanks for the details so far. The best next step is to get your consultation on the calendar.</p>
            <p>${serviceLine}${locationLine}${preferredWindow}</p>
            <p>You can book here:</p>
            <p style="margin:24px 0;">
              <a href="${bookingLink}" style="background:#111827;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;">Book my meeting</a>
            </p>
            <p>If you’d rather reply with your availability first, that works too.</p>
            <p>Best,<br />Bob</p>
          </div>
        `,
        text: `Hi ${firstName},\n\nThanks for the details so far. The best next step is to get your consultation on the calendar.\n\n${serviceLine}${locationLine}${preferredWindow}\n\nBook here: ${bookingLink}\n\nIf you’d rather reply with your availability first, that works too.\n\nBest,\nBob`,
        template: 'booking_invite',
        conversationStatus: 'ready_to_book',
        lastIntent: 'booking_invite_sent',
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
      conversationStatus: 'awaiting_reply',
    };
  }

  async getDueActions() {
    return insforgeDataService.getDueBobActions(this.batchSize, new Date());
  }

  async getLead(leadId) {
    return insforgeDataService.getLeadById(leadId);
  }

  async getConversation(conversationId) {
    if (!conversationId) return null;
    return insforgeDataService.getConversationById(conversationId);
  }

  async markAction(actionId, status, patch = {}) {
    return insforgeDataService.updateBobAction(actionId, {
      status,
      updatedAt: new Date(),
      ...patch,
    });
  }

  async assignLeadWithInsForge(lead, trackingId) {
    if (!lead?.id) {
      return { success: false, error: 'Lead not found', lead: null, agent: null };
    }

    if (lead.assignedAgentId) {
      return {
        success: true,
        message: 'Lead already assigned',
        lead,
        agent: null,
        alreadyAssigned: true,
      };
    }

    const [agents, leads] = await Promise.all([
      insforgeDataService.listAgents(),
      insforgeDataService.listRecentLeads(1000),
    ]);

    const activeAgents = agents.filter((agent) => agent.isActive !== false && ['agent', 'admin'].includes(agent.role || 'agent'));

    if (activeAgents.length === 0) {
      return { success: false, error: 'No active agents available for assignment', lead: null, agent: null };
    }

    const leadCounts = leads.reduce((acc, row) => {
      if (row.assignedAgentId) {
        acc[row.assignedAgentId] = (acc[row.assignedAgentId] || 0) + 1;
      }
      return acc;
    }, {});

    const selectedAgent = activeAgents
      .sort((a, b) => (leadCounts[a.id] || 0) - (leadCounts[b.id] || 0) || String(a.createdAt || '').localeCompare(String(b.createdAt || '')))[0];

    const updatedLead = await insforgeDataService.updateLead(lead.id, {
      assignedAgentId: selectedAgent.id,
      status: 'assigned',
      updatedAt: new Date(),
    });

    logger.info('✅ Lead assigned through InsForge data service', {
      trackingId,
      leadId: lead.id,
      agentId: selectedAgent.id,
      previousLeadCount: leadCounts[selectedAgent.id] || 0,
    });

    return {
      success: true,
      message: 'Lead automatically assigned successfully',
      lead: updatedLead,
      agent: {
        id: selectedAgent.id,
        agentId: selectedAgent.agentId,
        name: selectedAgent.fullName || selectedAgent.firstName || selectedAgent.name || 'Assigned agent',
        email: selectedAgent.email,
        previousLeadCount: leadCounts[selectedAgent.id] || 0,
      },
    };
  }

  async queueEmailAction(action, lead) {
    if (!lead.email) {
      await this.markAction(action.id, 'failed', {
        result: { error: 'Lead has no email address' },
      });
      return;
    }

    const trackingId = lead.trackingId || generateTrackingId();
    const draftPayload = action.actionType === 'send_fresh_email' ? action.payload : null;
    const email = draftPayload
      ? {
          subject: draftPayload.subject,
          html: draftPayload.bodyHtml,
          text: draftPayload.bodyText,
          template: draftPayload.emailGoal || 'fresh_email',
          conversationStatus: draftPayload.conversationStatus || 'awaiting_reply',
          lastIntent: draftPayload.emailGoal || 'fresh_email_sent',
        }
      : this.buildEmailContent(action.actionType, lead, trackingId, action.payload || {});

    if (!email.subject || !email.text) {
      await this.markAction(action.id, 'failed', {
        result: { error: 'Fresh email draft is missing a subject or body' },
      });
      return;
    }

    const { conversation, message } = await leadConversationService.logQueuedOutboundEmail({
      lead,
      subject: email.subject,
      bodyText: email.text,
      bodyHtml: email.html,
      metadata: {
        actionType: action.actionType,
        template: email.template,
        bobActionId: action.id,
        conversationStatus: email.conversationStatus,
        lastIntent: email.lastIntent,
      },
    });

    const queuedEmail = await insforgeDataService.createEmailQueue({
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
    });

    await leadConversationService.markMessageStatus(message.id, 'queued', {
      metadata: {
        ...(message.metadata || {}),
        emailQueueId: queuedEmail.id,
      },
    });

    await insforgeDataService.updateLead(lead.id, {
      status: ['send_booking_invite', 'send_booking_reminder'].includes(action.actionType) ? 'contacted' : lead.status,
      leadStage:
        action.actionType === 'request_more_info'
          ? 'awaiting_information'
          : ['send_booking_invite', 'send_booking_reminder'].includes(action.actionType)
            ? 'ready_to_book'
            : lead.leadStage,
      schedulingState:
        action.actionType === 'request_more_info'
          ? 'needs_follow_up'
          : ['send_booking_invite', 'send_booking_reminder'].includes(action.actionType)
            ? 'booking_invited'
            : lead.schedulingState,
      lastContactedAt: new Date(),
      nextContactAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      updatedAt: new Date(),
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

  async sendSmsReminder(action, lead, conversation) {
    if (!lead.phone) {
      await this.markAction(action.id, 'failed', {
        result: { error: 'Lead has no phone number' },
      });
      return;
    }

    const trackingId = lead.trackingId || generateTrackingId();
    const bookingLink = this.buildBookingLink(lead, trackingId);
    const conversationRecord = conversation || (await leadConversationService.ensurePrimaryConversation(lead, 'sms'));
    const existingMetadata = conversationRecord.metadata || {};

    if (lead.smsOptIn !== true && existingMetadata.smsOptIn !== true) {
      await this.markAction(action.id, 'failed', {
        result: { error: 'Lead has not explicitly opted into SMS outreach' },
      });
      return;
    }

    const smsCount = Number(existingMetadata.smsCount || 0) + 1;
    const smsResult = await twilioSmsService.sendLeadBookingReminder(lead, bookingLink, trackingId);
    const bodyText = smsResult.success
      ? smsResult.message
      : 'Bob attempted to send an SMS booking reminder, but the SMS provider is not ready.';

    await leadConversationService.logSystemEvent({
      lead,
      conversationId: conversationRecord.id,
      channel: 'sms',
      messageType: 'sms_reminder',
      subject: smsResult.success ? 'Bob sent an SMS booking reminder' : 'Bob could not send SMS booking reminder',
      bodyText,
      metadata: {
        bobActionId: action.id,
        providerMessageId: smsResult.messageSid || null,
        status: smsResult.status || null,
        success: smsResult.success,
      },
    });

    await leadConversationService.updateConversation(conversationRecord.id, {
      metadata: {
        ...existingMetadata,
        smsCount,
        lastSmsReminderAt: new Date().toISOString(),
        lastSmsReminderStatus: smsResult.success ? 'sent' : 'failed',
      },
      nextAction: smsResult.success ? 'queue_call_attempt' : 'manual_sms_review',
      nextActionAt: smsResult.success ? new Date(Date.now() + 24 * 60 * 60 * 1000) : null,
      lastIntent: 'booking_sms_reminder',
      lastIntentAt: new Date(),
      lastSummary: smsResult.success
        ? 'Bob sent an SMS reminder to encourage booking.'
        : 'Bob could not send the SMS reminder and kept the lead available for review.',
    });

    await insforgeDataService.updateLead(lead.id, {
      status: smsResult.success ? 'contacted' : lead.status,
      leadStage: smsResult.success ? 'nurturing' : lead.leadStage,
      schedulingState: smsResult.success ? 'needs_follow_up' : lead.schedulingState,
      nextContactAt: smsResult.success ? new Date(Date.now() + 24 * 60 * 60 * 1000) : lead.nextContactAt,
      updatedAt: new Date(),
    });

    await this.markAction(action.id, smsResult.success ? 'completed' : 'deferred', {
      executedAt: new Date(),
      scheduledFor: smsResult.success ? null : new Date(Date.now() + 60 * 60 * 1000),
      result: {
        smsCount,
        providerMessageId: smsResult.messageSid || null,
        status: smsResult.status || null,
        error: smsResult.success ? null : smsResult.error,
      },
    });
  }

  async sendMeetingSmsReminder(action, lead, conversation) {
    if (!lead.phone) {
      await this.markAction(action.id, 'failed', {
        result: { error: 'Lead has no phone number' },
      });
      return;
    }

    const trackingId = lead.trackingId || action.payload?.trackingId || generateTrackingId();
    const conversationRecord = conversation || (await leadConversationService.ensurePrimaryConversation(lead, 'sms'));
    const meeting = {
      id: action.payload?.calendlyEventUri || action.id,
      start_time: action.payload?.startTime || lead.scheduledAt,
      location: action.payload?.location || lead.meetingLocation || null,
      meeting_url: action.payload?.meetingUrl || null,
    };

    if (!meeting.start_time) {
      await this.markAction(action.id, 'failed', {
        result: { error: 'Meeting reminder is missing a start time' },
      });
      return;
    }

    const smsResult = await twilioSmsService.sendAppointmentReminder(lead, meeting, trackingId);

    await leadConversationService.logSystemEvent({
      lead,
      conversationId: conversationRecord.id,
      channel: 'sms',
      messageType: 'meeting_sms_reminder',
      subject: smsResult.success ? 'Bob sent a meeting SMS reminder' : 'Bob could not send meeting SMS reminder',
      bodyText: smsResult.success ? smsResult.message : `Meeting SMS reminder failed: ${smsResult.error}`,
      metadata: {
        bobActionId: action.id,
        calendlyEventUri: action.payload?.calendlyEventUri || null,
        providerMessageId: smsResult.messageSid || null,
        status: smsResult.status || null,
        success: smsResult.success,
      },
    });

    await leadConversationService.updateConversation(conversationRecord.id, {
      nextAction: smsResult.success ? 'monitor_meeting' : 'manual_sms_review',
      nextActionAt: null,
      lastIntent: 'meeting_sms_reminder',
      lastIntentAt: new Date(),
      lastSummary: smsResult.success
        ? 'Bob sent the post-booking SMS meeting reminder.'
        : 'Bob could not send the post-booking SMS meeting reminder.',
    });

    await this.markAction(action.id, smsResult.success ? 'completed' : 'deferred', {
      executedAt: new Date(),
      scheduledFor: smsResult.success ? null : new Date(Date.now() + 60 * 60 * 1000),
      result: {
        providerMessageId: smsResult.messageSid || null,
        status: smsResult.status || null,
        error: smsResult.success ? null : smsResult.error,
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

    await insforgeDataService.updateLead(lead.id, {
      status: lead.phone ? 'contacted' : lead.status,
      leadStage: lead.phone ? 'nurturing' : 'escalated',
      schedulingState: lead.phone ? 'needs_follow_up' : lead.schedulingState,
      requiresHumanReview: !lead.phone,
      escalationReason: !lead.phone ? 'missing_phone_for_call_attempt' : lead.escalationReason,
      nextContactAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      updatedAt: new Date(),
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
        const result = await this.assignLeadWithInsForge(lead, trackingId);

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
      case 'request_more_info':
      case 'send_booking_invite':
      case 'send_booking_reminder':
      case 'send_fresh_email':
        await this.queueEmailAction(action, lead);
        return;
      case 'send_sms_reminder':
        await this.sendSmsReminder(action, lead, conversation);
        return;
      case 'send_meeting_sms_reminder':
        await this.sendMeetingSmsReminder(action, lead, conversation);
        return;
      case 'queue_call_attempt':
        await this.queueCallAttempt(action, lead, conversation);
        return;
      case 'mark_ready_for_human': {
        await leadConversationService.logSystemEvent({
          lead,
          conversationId: action.conversationId,
          channel: 'system',
          messageType: 'human_review',
          subject: 'Lead marked for human review',
          bodyText: action.reason || 'Bob marked this lead for human review.',
          metadata: {
            bobActionId: action.id,
            humanReviewRequired: true,
            conversationStatus: 'needs_human_review',
            lastIntent: 'human_review_requested',
          },
        });

        await insforgeDataService.updateLead(lead.id, {
          requiresHumanReview: true,
          leadStage: 'escalated',
          escalationReason: action.payload?.escalationReason || lead.escalationReason || action.reason || null,
          updatedAt: new Date(),
        });

        await this.markAction(action.id, 'awaiting_human', {
          executedAt: new Date(),
          result: {
            escalationReason: action.payload?.escalationReason || lead.escalationReason || null,
          },
        });
        return;
      }
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
