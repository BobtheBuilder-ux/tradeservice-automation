import logger from '../utils/logger.js';

class BobDecisionEngine {
  buildLeadContext(lead, conversation = null) {
    const createdAt = lead?.createdAt ? new Date(lead.createdAt) : null;
    const lastOutboundAt = conversation?.lastOutboundAt ? new Date(conversation.lastOutboundAt) : null;
    const ageHours = createdAt ? (Date.now() - createdAt.getTime()) / (1000 * 60 * 60) : null;
    const hoursSinceLastOutbound = lastOutboundAt ? (Date.now() - lastOutboundAt.getTime()) / (1000 * 60 * 60) : null;
    const metadata = conversation?.metadata || {};

    return {
      lead,
      conversation,
      metadata,
      ageHours,
      hoursSinceLastOutbound,
      outboundCount: Number(metadata.outboundCount || 0),
      hasMeeting: Boolean(lead?.scheduledAt || lead?.meetingScheduled),
      isAssigned: Boolean(lead?.assignedAgentId),
      isOptedOut: Boolean(conversation?.optedOut),
      hasRecentOutbound: Boolean(conversation?.lastOutboundAt),
      callQueued: Boolean(metadata.callQueuedAt),
    };
  }

  decideNextAction(context) {
    const { lead, conversation, ageHours, hoursSinceLastOutbound, outboundCount, hasMeeting, isAssigned, isOptedOut, callQueued } = context;

    if (!lead) {
      return {
        actionType: 'noop',
        channel: 'system',
        reason: 'Lead context missing',
        scheduledFor: null,
        payload: {},
      };
    }

    if (isOptedOut) {
      return {
        actionType: 'hold',
        channel: conversation?.channel || 'email',
        reason: 'Lead opted out of communication',
        scheduledFor: null,
        payload: { status: 'do_not_contact' },
      };
    }

    if (hasMeeting) {
      return {
        actionType: 'monitor_meeting',
        channel: 'system',
        reason: 'Lead already has a meeting scheduled; monitor reminders and follow-up only',
        scheduledFor: null,
        payload: { status: lead.status || 'scheduled' },
      };
    }

    if (!isAssigned) {
      return {
        actionType: 'assign_lead',
        channel: 'system',
        reason: 'Lead must be assigned before Bob can personalize outreach',
        scheduledFor: new Date(),
        payload: { currentStatus: lead.status || 'new' },
      };
    }

    if (callQueued) {
      return {
        actionType: 'wait',
        channel: conversation?.channel || 'phone',
        reason: 'A phone follow-up is already queued for this lead',
        scheduledFor: null,
        payload: {
          leadStatus: lead.status || 'pending_call',
        },
      };
    }

    if (!conversation?.lastOutboundAt) {
      return {
        actionType: 'send_intro_email',
        channel: 'email',
        reason: 'No outbound contact has been logged yet',
        scheduledFor: new Date(),
        payload: {
          template: 'welcome_booking',
          leadStatus: lead.status || 'new',
        },
      };
    }

    if (hoursSinceLastOutbound !== null && hoursSinceLastOutbound < 20) {
      return {
        actionType: 'wait',
        channel: conversation?.channel || 'email',
        reason: 'Most recent outbound contact is still within the active response window',
        scheduledFor: null,
        payload: {
          leadStatus: lead.status || 'contacted',
        },
      };
    }

    if (outboundCount <= 1 && hoursSinceLastOutbound !== null && hoursSinceLastOutbound >= 24) {
      return {
        actionType: 'send_follow_up_email',
        channel: 'email',
        reason: 'Lead has not booked within 24 hours of the initial outreach',
        scheduledFor: new Date(),
        payload: {
          template: 'follow_up_booking',
          leadStatus: lead.status || 'contacted',
          outboundCount,
        },
      };
    }

    if (outboundCount >= 2 && ageHours !== null && ageHours >= 72) {
      return {
        actionType: 'queue_call_attempt',
        channel: 'phone',
        reason: 'Lead remains unscheduled after the email nurture window; phone outreach is the next best action',
        scheduledFor: new Date(),
        payload: {
          script: 'qualification_and_booking',
          requiresPhone: Boolean(lead.phone),
          outboundCount,
        },
      };
    }

    return {
      actionType: 'wait',
      channel: conversation?.channel || 'email',
      reason: 'Lead is in active nurture window; no immediate action required',
      scheduledFor: null,
      payload: {
        leadStatus: lead.status || 'new',
      },
    };
  }

  summarizeDecision(lead, decision) {
    const leadName = lead?.fullName || lead?.firstName || lead?.email || lead?.id;
    return `${leadName}: ${decision.actionType} via ${decision.channel} — ${decision.reason}`;
  }

  logDecision(lead, decision) {
    logger.info('Bob decision computed', {
      leadId: lead?.id,
      actionType: decision.actionType,
      channel: decision.channel,
      reason: decision.reason,
    });
  }
}

const bobDecisionEngine = new BobDecisionEngine();
export default bobDecisionEngine;
export { BobDecisionEngine };
