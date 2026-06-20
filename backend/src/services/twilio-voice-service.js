import twilio from 'twilio';
import logger from '../utils/logger.js';
import { TwilioSmsService } from './twilio-sms-service.js';

class TwilioVoiceService {
  constructor(options = {}) {
    this.client = options.client || null;
    this.fromNumber = options.fromNumber || process.env.TWILIO_PHONE_NUMBER;
    if (!this.client && options.initialize !== false) {
      this.initializeClient();
    }
  }

  static getTwilioAuthConfig() {
    return TwilioSmsService.getTwilioAuthConfig();
  }

  initializeClient() {
    const authConfig = TwilioVoiceService.getTwilioAuthConfig();
    if (!authConfig) {
      logger.error('Twilio voice credentials not configured', { context: 'twilio_voice_initialization' });
      return;
    }

    this.client = authConfig.options
      ? twilio(authConfig.username, authConfig.password, authConfig.options)
      : twilio(authConfig.username, authConfig.password);
    this.fromNumber = process.env.TWILIO_PHONE_NUMBER;
    logger.info('Twilio voice service initialized successfully', { authMode: authConfig.mode });
  }

  getPublicBaseUrl() {
    return process.env.INSFORGE_FUNCTION_BASE_URL || process.env.CALL_PUBLIC_BASE_URL || process.env.BACKEND_URL || 'http://localhost:3001';
  }

  buildFunctionCallbackUrl(mode, params = {}) {
    return this.buildCallbackUrl('/twilio-voice-webhook', { mode, ...params });
  }

  buildCallbackUrl(path, params = {}) {
    const url = new URL(path, this.getPublicBaseUrl());
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, value);
      }
    });
    return url.toString();
  }

  resolveFromNumber({ action, lead, from } = {}) {
    return from
      || action?.tenantPhoneNumber
      || action?.tenant_phone_number
      || lead?.tenantPhoneNumber
      || lead?.tenant_phone_number
      || this.fromNumber;
  }

  async startOutboundCall({ action, lead, from }) {
    try {
      if (process.env.VOICE_CALLING_ENABLED !== 'true') {
        throw new Error('Voice calling is disabled');
      }

      if (!this.client) {
        throw new Error('Twilio voice client not initialized');
      }
      const fromNumber = this.resolveFromNumber({ action, lead, from });
      if (!fromNumber) {
        throw new Error('Tenant caller phone number is not configured');
      }
      if (!lead?.phone) {
        throw new Error('Lead phone number not available');
      }

      const call = await this.client.calls.create({
        to: lead.phone,
        from: fromNumber,
        url: process.env.INSFORGE_FUNCTION_BASE_URL ? this.buildFunctionCallbackUrl('intro', {
          actionId: action.id,
          leadId: lead.id,
          conversationId: action.conversationId,
        }) : this.buildCallbackUrl('/api/voice/twiml/intro', {
          actionId: action.id,
          leadId: lead.id,
          conversationId: action.conversationId,
        }),
        method: 'POST',
        statusCallback: process.env.INSFORGE_FUNCTION_BASE_URL ? this.buildFunctionCallbackUrl('status', {
          actionId: action.id,
          leadId: lead.id,
          conversationId: action.conversationId,
        }) : this.buildCallbackUrl('/api/voice/status', {
          actionId: action.id,
          leadId: lead.id,
          conversationId: action.conversationId,
        }),
        statusCallbackMethod: 'POST',
        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      });

      return {
        success: true,
        callSid: call.sid,
        status: call.status,
      };
    } catch (error) {
      logger.error(error.message, {
        context: 'twilio_voice_start_outbound_call',
        actionId: action?.id,
        leadId: lead?.id,
        stack: error.stack,
      });
      return { success: false, error: error.message };
    }
  }
}

const twilioVoiceService = new TwilioVoiceService();
export default twilioVoiceService;
export { TwilioVoiceService };
