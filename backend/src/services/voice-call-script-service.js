const STOP_PATTERNS = [/\bstop\b/i, /unsubscribe/i, /do not contact/i, /don't call/i, /not interested/i];
const YES_PATTERNS = [/\byes\b/i, /sure/i, /okay/i, /ok\b/i, /go ahead/i, /send/i, /book/i];
const NO_PATTERNS = [/\bno\b/i, /not now/i, /busy/i, /later/i, /callback/i, /call back/i];

class VoiceCallScriptService {
  constructor(options = {}) {
    this.bookingLink = options.bookingLink || process.env.CALENDLY_SCHEDULING_URL || process.env.CALENDLY_BOOKING_URL || process.env.CALENDLY_LINK || '';
    this.voiceName = options.voiceName || process.env.TWILIO_VOICE_NAME || 'Polly.Joanna-Neural';
    this.language = options.language || process.env.TWILIO_VOICE_LANGUAGE || 'en-US';
  }

  getSayOptions() {
    return {
      voice: this.voiceName,
      language: this.language,
    };
  }

  getFirstName(lead = {}) {
    return lead.firstName || lead.first_name || lead.fullName || lead.full_name || 'there';
  }

  normalizeReply(reply = '') {
    return String(reply || '').trim();
  }

  isStop(reply) {
    return STOP_PATTERNS.some((pattern) => pattern.test(reply));
  }

  isYes(reply) {
    return YES_PATTERNS.some((pattern) => pattern.test(reply));
  }

  isNo(reply) {
    return NO_PATTERNS.some((pattern) => pattern.test(reply));
  }

  initialStep(lead = {}) {
    const firstName = this.getFirstName(lead);
    return {
      step: 'permission',
      done: false,
      prompt: `Hi ${firstName}, this is Bob from 9QC Inc. I’m following up because you requested support. Is now a good time for two quick questions?`,
    };
  }

  nextStep(currentStep, reply, context = {}) {
    const normalized = this.normalizeReply(reply);

    if (this.isStop(normalized)) {
      return {
        step: 'opt_out',
        done: true,
        outcome: 'opted_out',
        prompt: 'Understood. We’ll stop follow-up calls and messages. Thank you, and have a good day.',
        extracted: { optedOut: true },
      };
    }

    switch (currentStep) {
      case 'permission':
        if (this.isNo(normalized)) {
          return {
            step: 'callback_requested',
            done: true,
            outcome: 'callback_requested',
          prompt: 'No problem. I’ll make a note that a callback is better and text the Calendly link if available. Thank you.',
            extracted: { callbackRequested: true },
          };
        }
        return {
          step: 'service_interest',
          done: false,
          prompt: 'Great, thank you. What service or outcome are you interested in getting help with?',
        };
      case 'service_interest':
        return {
          step: 'timeline',
          done: false,
          prompt: 'Thanks. Are you looking to get started soon, or are you still exploring options?',
          extracted: { serviceInterest: normalized },
        };
      case 'timeline':
        return {
          step: 'location',
          done: false,
          prompt: 'Got it. What city, province, or country are you located in?',
          extracted: { timeline: normalized },
        };
      case 'location':
        return {
          step: 'booking_offer',
          done: false,
          prompt: 'Thanks for sharing that. The best next step is a short Zoom consultation. Would you like me to help book a day and time now?',
          extracted: { locationSummary: normalized },
        };
      case 'booking_offer':
        if (this.isYes(normalized)) {
          return {
            step: 'booking_time',
            done: false,
            prompt: 'Perfect. What day and time works best for you? For example, you can say tomorrow at 3 PM, or Friday at 10 AM.',
            extracted: { wantsDirectBooking: true },
          };
        }
        return {
          step: 'human_review',
          done: true,
          outcome: 'needs_human_review',
          prompt: 'No problem. I’ll pass this to the team so they can follow up with the best next step. Thank you.',
          extracted: { needsHumanReview: true },
        };
      case 'booking_time':
        return {
          step: 'direct_booking_requested',
          done: true,
          outcome: 'direct_booking_requested',
          prompt: 'Thank you. I’ll check that time now.',
          extracted: { preferredBookingTimeText: normalized },
        };
      default:
        return this.initialStep(context.lead || {});
    }
  }
}

const voiceCallScriptService = new VoiceCallScriptService();
export default voiceCallScriptService;
export { VoiceCallScriptService };
