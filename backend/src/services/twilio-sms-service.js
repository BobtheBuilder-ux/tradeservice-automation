import twilio from 'twilio';
import logger from '../utils/logger.js';
import { hashForLogging } from '../utils/crypto.js';
import { buildLeadBookingReminderMessage } from './sms-message-builder.js';

/**
 * Twilio SMS Service - Handles SMS notifications for appointment reminders
 */
class TwilioSmsService {
  constructor(options = {}) {
    this.client = null;
    this.fromNumber = process.env.TWILIO_PHONE_NUMBER;
    if (options.initialize !== false) {
      this.initializeClient();
    }
  }

  static getTwilioAuthConfig() {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const apiKey = process.env.TWILIO_API_KEY;
    const apiSecret = process.env.TWILIO_API_SECRET;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    if (accountSid && apiKey && apiSecret) {
      return {
        username: apiKey,
        password: apiSecret,
        options: { accountSid },
        mode: 'api_key',
      };
    }

    if (accountSid && authToken) {
      return {
        username: accountSid,
        password: authToken,
        options: undefined,
        mode: 'auth_token',
      };
    }

    return null;
  }

  buildLeadBookingReminderMessage(lead = {}, bookingLink) {
    return buildLeadBookingReminderMessage(lead, bookingLink);
  }

  getSmsStatusCallbackUrl() {
    const baseUrl = process.env.CALL_PUBLIC_BASE_URL || process.env.BACKEND_URL;
    if (!baseUrl) return null;
    return new URL('/api/sms/status', baseUrl).toString();
  }

  buildMessagePayload(payload = {}) {
    const statusCallback = this.getSmsStatusCallbackUrl();
    return {
      ...payload,
      ...(statusCallback ? { statusCallback } : {}),
    };
  }

  async sendMessage({ to, body, trackingId, context = 'send_sms_message', metadata = {} }) {
    try {
      if (!this.client) {
        throw new Error('Twilio client not initialized');
      }

      if (!to) {
        throw new Error('SMS recipient phone number not available');
      }

      logger.logLeadProcessing(trackingId, 'sending_sms_message', {
        ...metadata,
        phone: hashForLogging(to),
        context,
      });

      const smsResult = await this.client.messages.create(this.buildMessagePayload({
        body,
        from: this.fromNumber,
        to,
      }));

      logger.logLeadProcessing(trackingId, 'sms_message_sent', {
        ...metadata,
        messageSid: smsResult.sid,
        status: smsResult.status,
        context,
      });

      return {
        success: true,
        messageSid: smsResult.sid,
        status: smsResult.status,
        message: body,
      };
    } catch (error) {
      logger.error(error.message, {
        context,
        trackingId,
        phone: to ? hashForLogging(to) : 'unknown',
        stack: error.stack,
        ...metadata,
      });

      return {
        success: false,
        error: error.message,
        message: 'Failed to send SMS message',
      };
    }
  }

  async sendLeadBookingReminder(lead, bookingLink, trackingId) {
    try {
      if (!this.client) {
        throw new Error('Twilio client not initialized');
      }

      if (!lead.phone) {
        throw new Error('Lead phone number not available');
      }

      const message = this.buildLeadBookingReminderMessage(lead, bookingLink);

      logger.logLeadProcessing(trackingId, 'sending_lead_booking_sms_reminder', {
        leadId: lead.id,
        phone: hashForLogging(lead.phone),
      });

      const smsResult = await this.client.messages.create(this.buildMessagePayload({
        body: message,
        from: this.fromNumber,
        to: lead.phone,
      }));

      logger.logLeadProcessing(trackingId, 'lead_booking_sms_reminder_sent', {
        leadId: lead.id,
        messageSid: smsResult.sid,
        status: smsResult.status,
      });

      return {
        success: true,
        messageSid: smsResult.sid,
        status: smsResult.status,
        message,
      };
    } catch (error) {
      logger.error(error.message, {
        context: 'send_lead_booking_sms_reminder',
        trackingId,
        leadId: lead?.id,
        phone: lead?.phone ? hashForLogging(lead.phone) : 'unknown',
        stack: error.stack,
      });

      return {
        success: false,
        error: error.message,
        message: 'Failed to send SMS booking reminder',
      };
    }
  }

  async sendCallbackConfirmation(lead, bookingLink, trackingId) {
    const firstName = lead?.first_name || lead?.firstName || lead?.full_name || lead?.fullName || 'there';
    const linkText = bookingLink ? ` You can also choose a time here: ${bookingLink}` : '';
    return this.sendMessage({
      to: lead?.phone,
      body: `Hi ${firstName}, this is Bob from 9QC Inc. Thanks for speaking with me. A team member will follow up for a better time.${linkText}`,
      trackingId,
      context: 'send_callback_confirmation_sms',
      metadata: { leadId: lead?.id },
    });
  }

  /**
   * Initialize Twilio client
   */
  initializeClient() {
    try {
      const authConfig = TwilioSmsService.getTwilioAuthConfig();
      if (!authConfig) {
        logger.error('Twilio credentials not configured', {
          context: 'twilio_initialization'
        });
        return;
      }

      this.client = authConfig.options
        ? twilio(authConfig.username, authConfig.password, authConfig.options)
        : twilio(authConfig.username, authConfig.password);
      this.fromNumber = process.env.TWILIO_PHONE_NUMBER;
      logger.info('Twilio SMS service initialized successfully', { authMode: authConfig.mode });
    } catch (error) {
      logger.error(error.message, { context: 'twilio_initialization', stack: error.stack });
    }
  }

  /**
   * Reinitialize the Twilio client (useful for testing)
   */
  reinitialize() {
    this.initializeClient();
  }

  /**
   * Send appointment reminder SMS
   * @param {Object} lead - Lead information
   * @param {Object} meeting - Meeting details
   * @param {string} trackingId - Tracking ID for logging
   * @returns {Object} SMS sending result
   */
  async sendAppointmentReminder(lead, meeting, trackingId) {
    try {
      if (!this.client) {
        throw new Error('Twilio client not initialized');
      }

      if (!lead.phone) {
        throw new Error('Lead phone number not available');
      }

      const meetingDate = new Date(meeting.start_time);
      const formattedDate = meetingDate.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
      const formattedTime = meetingDate.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });

      const message = `Hi ${lead.first_name || lead.full_name || 'there'}! This is a reminder about your upcoming appointment on ${formattedDate} at ${formattedTime}. ${meeting.location ? `Location: ${meeting.location}` : ''} ${meeting.meeting_url ? `Join here: ${meeting.meeting_url}` : ''} - NASCO Canada Trade Services`;

      logger.logLeadProcessing(trackingId, 'sending_sms_reminder', {
        leadId: lead.id,
        phone: hashForLogging(lead.phone),
        meetingId: meeting.id,
        meetingTime: meeting.start_time
      });

      const smsResult = await this.client.messages.create(this.buildMessagePayload({
        body: message,
        from: this.fromNumber,
        to: lead.phone
      }));

      logger.logLeadProcessing(trackingId, 'sms_reminder_sent', {
        leadId: lead.id,
        messageSid: smsResult.sid,
        status: smsResult.status
      });

      return {
        success: true,
        messageSid: smsResult.sid,
        status: smsResult.status,
        message: 'SMS reminder sent successfully'
      };

    } catch (error) {
      logger.error(error.message, {
        context: 'send_sms_reminder',
        trackingId,
        leadId: lead?.id,
        phone: lead?.phone ? hashForLogging(lead.phone) : 'unknown',
        stack: error.stack
      });

      return {
        success: false,
        error: error.message,
        message: 'Failed to send SMS reminder'
      };
    }
  }

  /**
   * Send 24-hour reminder SMS
   * @param {Object} lead - Lead information
   * @param {Object} meeting - Meeting details
   * @param {string} trackingId - Tracking ID for logging
   * @returns {Object} SMS sending result
   */
  async send24HourReminder(lead, meeting, trackingId) {
    try {
      if (!this.client) {
        throw new Error('Twilio client not initialized');
      }

      if (!lead.phone) {
        throw new Error('Lead phone number not available');
      }

      const meetingDate = new Date(meeting.start_time);
      const formattedDate = meetingDate.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric'
      });
      const formattedTime = meetingDate.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });

      const message = `Hi ${lead.first_name || lead.full_name || 'there'}! Your appointment with NASCO Canada Trade Services is tomorrow (${formattedDate}) at ${formattedTime}. Please confirm your attendance or reschedule if needed. ${meeting.meeting_url ? `Join here: ${meeting.meeting_url}` : ''}`;

      logger.logLeadProcessing(trackingId, 'sending_24h_sms_reminder', {
        leadId: lead.id,
        phone: hashForLogging(lead.phone),
        meetingId: meeting.id
      });

      const smsResult = await this.client.messages.create(this.buildMessagePayload({
        body: message,
        from: this.fromNumber,
        to: lead.phone
      }));

      return {
        success: true,
        messageSid: smsResult.sid,
        status: smsResult.status,
        message: '24-hour SMS reminder sent successfully'
      };

    } catch (error) {
      logger.error(error.message, {
        context: 'send_24h_sms_reminder',
        trackingId,
        leadId: lead?.id,
        stack: error.stack
      });

      return {
        success: false,
        error: error.message,
        message: 'Failed to send 24-hour SMS reminder'
      };
    }
  }

  /**
   * Send 1-hour reminder SMS
   * @param {Object} lead - Lead information
   * @param {Object} meeting - Meeting details
   * @param {string} trackingId - Tracking ID for logging
   * @returns {Object} SMS sending result
   */
  async send1HourReminder(lead, meeting, trackingId) {
    try {
      if (!this.client) {
        throw new Error('Twilio client not initialized');
      }

      if (!lead.phone) {
        throw new Error('Lead phone number not available');
      }

      const meetingDate = new Date(meeting.start_time);
      const formattedTime = meetingDate.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });

      const message = `Reminder: Your appointment with NASCO Canada Trade Services starts in 1 hour at ${formattedTime}. ${meeting.meeting_url ? `Join here: ${meeting.meeting_url}` : ''} See you soon!`;

      logger.logLeadProcessing(trackingId, 'sending_1h_sms_reminder', {
        leadId: lead.id,
        phone: hashForLogging(lead.phone),
        meetingId: meeting.id
      });

      const smsResult = await this.client.messages.create(this.buildMessagePayload({
        body: message,
        from: this.fromNumber,
        to: lead.phone
      }));

      return {
        success: true,
        messageSid: smsResult.sid,
        status: smsResult.status,
        message: '1-hour SMS reminder sent successfully'
      };

    } catch (error) {
      logger.error(error.message, {
        context: 'send_1h_sms_reminder',
        trackingId,
        leadId: lead?.id,
        stack: error.stack
      });

      return {
        success: false,
        error: error.message,
        message: 'Failed to send 1-hour SMS reminder'
      };
    }
  }

  /**
   * Get SMS delivery status
   * @param {string} messageSid - Twilio message SID
   * @returns {Object} Message status
   */
  async getMessageStatus(messageSid) {
    try {
      if (!this.client) {
        throw new Error('Twilio client not initialized');
      }

      const message = await this.client.messages(messageSid).fetch();
      
      return {
        success: true,
        status: message.status,
        errorCode: message.errorCode,
        errorMessage: message.errorMessage,
        dateCreated: message.dateCreated,
        dateSent: message.dateSent,
        dateUpdated: message.dateUpdated
      };

    } catch (error) {
      logger.error(error.message, {
        context: 'get_sms_status',
        messageSid,
        stack: error.stack
      });

      return {
        success: false,
        error: error.message
      };
    }
  }
}

export default new TwilioSmsService();
export { TwilioSmsService };
