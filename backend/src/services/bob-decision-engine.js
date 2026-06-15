import logger from '../utils/logger.js';
import contactPolicyService from './contact-policy-service.js';

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
      hasMeeting: Boolean(lead?.scheduledAt || lead?.meetingScheduled || lead?.status === 'scheduled' || lead?.leadStage === 'booked' || lead?.schedulingState === 'scheduled'),
      isAssigned: Boolean(lead?.assignedAgentId),
      isOptedOut: Boolean(conversation?.optedOut),
      callQueued: Boolean(metadata.callQueuedAt),
      automationPaused: Boolean(lead?.automationPaused),
      requiresHumanReview: Boolean(lead?.requiresHumanReview || conversation?.humanReviewRequired),
      qualificationStatus: lead?.qualificationStatus || 'unqualified',
      leadStage: lead?.leadStage || 'new_inquiry',
      schedulingState: lead?.schedulingState || 'not_started',
      conversationStatus: conversation?.conversationStatus || 'active_nurture',
      preferredContactChannel: lead?.preferredContactChannel || 'email',
    };
  }

  decideNextAction(context) {
    const decision = this.computeNextAction(context);
    return this.applyContactPolicy(context, decision);
  }

  computeNextAction(context) {
    const {
      lead,
      conversation,
      ageHours,
      hoursSinceLastOutbound,
      outboundCount,
      hasMeeting,
      isAssigned,
      isOptedOut,
      callQueued,
      automationPaused,
      requiresHumanReview,
      qualificationStatus,
      leadStage,
      schedulingState,
      conversationStatus,
      preferredContactChannel,
    } = context;

    if (!lead) {
      return {
        actionType: 'noop',
        channel: 'system',
        reason: 'Lead context missing',
        scheduledFor: null,
        payload: {},
      };
    }

    if (lead.status === 'closed' || lead.leadStage === 'closed_lost' || schedulingState === 'not_interested') {
      return {
        actionType: 'hold',
        channel: 'system',
        reason: 'Lead is closed or not interested; no further automation should run',
        scheduledFor: null,
        payload: { status: lead.status || 'closed', leadStage, schedulingState },
      };
    }

    if (isOptedOut) {
      return {
        actionType: 'hold',
        channel: conversation?.channel || preferredContactChannel,
        reason: 'Lead opted out of communication',
        scheduledFor: null,
        payload: { status: 'do_not_contact' },
      };
    }

    if (automationPaused) {
      return {
        actionType: 'hold',
        channel: conversation?.channel || preferredContactChannel,
        reason: 'Automation is paused for this lead',
        scheduledFor: null,
        payload: { status: 'paused' },
      };
    }

    if (requiresHumanReview) {
      return {
        actionType: 'mark_ready_for_human',
        channel: 'system',
        reason: lead?.escalationReason || 'Lead requires human review before more automation runs',
        scheduledFor: new Date(),
        payload: {
          escalationReason: lead?.escalationReason || null,
          qualificationStatus,
          leadStage,
        },
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
        channel: preferredContactChannel,
        reason: 'A phone follow-up is already queued for this lead',
        scheduledFor: null,
        payload: {
          leadStatus: lead.status || 'pending_call',
          schedulingState,
        },
      };
    }

    if (!conversation?.lastOutboundAt) {
      return {
        actionType: qualificationStatus === 'unqualified' ? 'request_more_info' : 'send_booking_invite',
        channel: 'email',
        reason:
          qualificationStatus === 'unqualified'
            ? 'Lead is missing qualification detail, so the first outreach should gather context'
            : 'Qualified lead has not received a booking invite yet',
        scheduledFor: new Date(),
        payload: {
          template: qualificationStatus === 'unqualified' ? 'qualification_request' : 'booking_invite',
          leadStatus: lead.status || 'new',
          qualificationStatus,
          leadStage,
        },
      };
    }

    if (hoursSinceLastOutbound !== null && hoursSinceLastOutbound < 20) {
      return {
        actionType: 'wait',
        channel: conversation?.channel || preferredContactChannel,
        reason: 'Most recent outbound contact is still within the active response window',
        scheduledFor: null,
        payload: {
          leadStatus: lead.status || 'contacted',
          conversationStatus,
        },
      };
    }

    if (qualificationStatus === 'unqualified' || leadStage === 'awaiting_information') {
      return {
        actionType: 'request_more_info',
        channel: 'email',
        reason: 'Lead still needs qualification before scheduling should be pushed harder',
        scheduledFor: new Date(),
        payload: {
          template: 'qualification_request',
          qualificationStatus,
          leadStage,
        },
      };
    }

    if (outboundCount >= 2 && ageHours !== null && ageHours >= 72) {
      if (lead.phone && Number(context.metadata?.smsCount || 0) === 0 && context.metadata?.smsOptIn === true) {
        return {
          actionType: 'send_sms_reminder',
          channel: 'sms',
          reason: 'Lead remains unscheduled after the email nurture window; SMS reminder is the next respectful step before phone outreach',
          scheduledFor: new Date(),
          payload: {
            template: 'booking_sms_reminder',
            requiresPhone: true,
            outboundCount,
            qualificationStatus,
          },
        };
      }

      if (lead.phone) {
        return {
          actionType: 'queue_call_attempt',
          channel: 'phone',
          reason: 'Lead remains unscheduled after the email nurture window; phone outreach is the next best action',
          scheduledFor: new Date(),
          payload: {
            script: 'qualification_and_booking',
            requiresPhone: true,
            outboundCount,
            qualificationStatus,
          },
        };
      }

      return {
        actionType: 'mark_ready_for_human',
        channel: 'system',
        reason: 'Lead needs a higher-touch follow-up, but no phone number is available for an automated call queue',
        scheduledFor: new Date(),
        payload: {
          escalationReason: 'needs_phone_or_manual_follow_up',
          qualificationStatus,
          leadStage,
        },
      };
    }

    if (['qualified', 'partially_qualified'].includes(qualificationStatus) && ['not_started', 'needs_follow_up'].includes(schedulingState)) {
      return {
        actionType: outboundCount === 0 ? 'send_booking_invite' : 'send_booking_reminder',
        channel: 'email',
        reason:
          outboundCount === 0
            ? 'Qualified lead is ready for the first booking invite'
            : 'Qualified lead still has not booked and should receive a booking reminder',
        scheduledFor: new Date(),
        payload: {
          template: outboundCount === 0 ? 'booking_invite' : 'booking_reminder',
          qualificationStatus,
          schedulingState,
          leadStage,
        },
      };
    }

    if (conversationStatus === 'ready_to_book') {
      return {
        actionType: 'send_booking_reminder',
        channel: 'email',
        reason: 'Conversation is marked ready to book, so Bob should send a direct booking reminder',
        scheduledFor: new Date(),
        payload: {
          template: 'booking_reminder',
          schedulingState,
        },
      };
    }

    return {
      actionType: 'wait',
      channel: conversation?.channel || preferredContactChannel,
      reason: 'Lead is in an active nurture window and no immediate phase-two action is required',
      scheduledFor: null,
      payload: {
        leadStatus: lead.status || 'new',
        qualificationStatus,
        schedulingState,
      },
    };
  }

  applyContactPolicy(context, decision) {
    if (!this.isOutreachDecision(decision)) {
      return decision;
    }

    const policyResult = contactPolicyService.evaluate(context, decision);

    if (policyResult.allowed) {
      return decision;
    }

    if (policyResult.reasonCode === 'max_email_attempts' || policyResult.reasonCode === 'max_sms_attempts' || policyResult.reasonCode === 'max_call_attempts') {
      return {
        actionType: 'mark_ready_for_human',
        channel: 'system',
        reason: policyResult.reason,
        scheduledFor: new Date(),
        payload: {
          escalationReason: policyResult.reasonCode,
          blockedActionType: decision.actionType,
          blockedChannel: decision.channel,
        },
      };
    }

    return {
      actionType: 'wait',
      channel: decision.channel,
      reason: policyResult.reason,
      scheduledFor: policyResult.scheduledFor,
      payload: {
        reasonCode: policyResult.reasonCode,
        blockedActionType: decision.actionType,
        blockedChannel: decision.channel,
      },
    };
  }

  isOutreachDecision(decision) {
    return [
      'request_more_info',
      'send_booking_invite',
      'send_booking_reminder',
      'send_sms_reminder',
      'queue_call_attempt',
    ].includes(decision?.actionType);
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
