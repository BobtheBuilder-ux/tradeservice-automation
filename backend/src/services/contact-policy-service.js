const DEFAULT_POLICY = {
  minimumHoursBetweenOutreach: 20,
  maxEmailAttempts: 4,
  maxSmsAttempts: 2,
  maxCallAttempts: 2,
  quietHoursEnabled: false,
  quietHoursStart: 21,
  quietHoursEnd: 8,
};

const SYSTEM_CHANNELS = new Set(['system']);
const EMAIL_CHANNELS = new Set(['email']);
const SMS_CHANNELS = new Set(['sms', 'text']);
const PHONE_CHANNELS = new Set(['phone', 'call']);

class ContactPolicyService {
  constructor(overrides = {}) {
    this.config = {
      ...DEFAULT_POLICY,
      ...overrides,
    };
  }

  evaluate(context = {}, action = {}) {
    const now = action.now || new Date();
    const channel = action.channel || context.preferredContactChannel || context.conversation?.channel || 'email';

    if (SYSTEM_CHANNELS.has(channel)) {
      return this.allow();
    }

    if (!context.lead) {
      return this.block('missing_lead', 'Lead context is missing');
    }

    if (context.isOptedOut || context.conversation?.optedOut) {
      return this.block('opted_out', 'Lead has opted out of communication');
    }

    if (context.automationPaused || context.lead?.automationPaused) {
      return this.block('automation_paused', 'Automation is paused for this lead');
    }

    if (context.requiresHumanReview || context.lead?.requiresHumanReview || context.conversation?.humanReviewRequired) {
      return this.block('human_review_required', 'Lead requires human review before more outreach');
    }

    if (context.hasMeeting || context.lead?.scheduledAt || context.lead?.meetingScheduled) {
      return this.block('meeting_scheduled', 'Lead already has a meeting scheduled');
    }

    const nextContactAt = this.toDate(context.lead?.nextContactAt);
    if (nextContactAt && nextContactAt.getTime() > now.getTime()) {
      return this.block('next_contact_not_due', 'Lead is not due for contact yet', nextContactAt);
    }

    if (this.isQuietHours(now)) {
      return this.block('quiet_hours', 'Current time falls inside configured quiet hours');
    }

    if (this.isContactChannel(channel) && this.isInsideSpacingWindow(context)) {
      return this.block('contact_spacing', 'Most recent outbound contact is inside the minimum spacing window');
    }

    if (EMAIL_CHANNELS.has(channel) && Number(context.outboundCount || 0) >= this.config.maxEmailAttempts) {
      return this.block('max_email_attempts', 'Maximum email attempts reached');
    }

    if (SMS_CHANNELS.has(channel)) {
      if (context.lead?.smsOptIn !== true && context.metadata?.smsOptIn !== true) {
        return this.block('sms_not_allowed', 'Lead has not explicitly opted into SMS outreach');
      }

      if (Number(context.metadata?.smsCount || 0) >= this.config.maxSmsAttempts) {
        return this.block('max_sms_attempts', 'Maximum SMS attempts reached');
      }
    }

    if (PHONE_CHANNELS.has(channel)) {
      if (context.callQueued || context.metadata?.callQueuedAt) {
        return this.block('call_already_queued', 'A call is already queued for this lead');
      }

      const callAttemptCount = Number(context.metadata?.callCount || context.metadata?.callQueueCount || 0);
      if (callAttemptCount >= this.config.maxCallAttempts) {
        return this.block('max_call_attempts', 'Maximum call attempts reached');
      }
    }

    return this.allow();
  }

  isContactChannel(channel) {
    return EMAIL_CHANNELS.has(channel) || SMS_CHANNELS.has(channel) || PHONE_CHANNELS.has(channel);
  }

  isInsideSpacingWindow(context) {
    if (context.hoursSinceLastOutbound === null || context.hoursSinceLastOutbound === undefined) {
      return false;
    }

    return Number(context.hoursSinceLastOutbound) < this.config.minimumHoursBetweenOutreach;
  }

  isQuietHours(now) {
    if (!this.config.quietHoursEnabled) {
      return false;
    }

    const hour = now.getHours();
    const start = this.config.quietHoursStart;
    const end = this.config.quietHoursEnd;

    if (start === end) {
      return false;
    }

    if (start < end) {
      return hour >= start && hour < end;
    }

    return hour >= start || hour < end;
  }

  toDate(value) {
    if (!value) {
      return null;
    }

    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  allow() {
    return {
      allowed: true,
      reasonCode: null,
      reason: null,
      scheduledFor: null,
    };
  }

  block(reasonCode, reason, scheduledFor = null) {
    return {
      allowed: false,
      reasonCode,
      reason,
      scheduledFor,
    };
  }
}

const contactPolicyService = new ContactPolicyService();
export default contactPolicyService;
export { ContactPolicyService };
