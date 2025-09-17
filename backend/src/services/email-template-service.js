import logger from '../utils/logger.js';
import { hashForLogging } from '../utils/crypto.js';
import { db } from '../config/index.js';
import { emailQueue } from '../db/schema.js';

/**
 * Service for generating email templates and queuing emails
 * Integrates with the email_queue system for automated email processing
 */
class EmailTemplateService {
  /**
   * Queue appointment scheduling email
   * @param {Object} leadData - Lead information
   * @param {string} calendlyLink - Calendly booking link
   * @param {string} trackingId - Tracking ID for logging
   * @returns {Object} Queue result
   */
  async queueAppointmentEmail(leadData, calendlyLink, trackingId) {
    try {
      logger.logLeadProcessing(trackingId, 'queuing_appointment_email', {
        leadId: leadData.id,
        email: leadData.email ? hashForLogging(leadData.email) : '[MISSING]',
        calendlyLink: calendlyLink ? '[PROVIDED]' : '[MISSING]'
      });

      const subject = `Schedule Your Consultation - ${leadData.full_name || 'Valued Lead'}`;
      
      const html = this.generateAppointmentEmailTemplate(leadData, calendlyLink);
      const text = this.generateAppointmentEmailText(leadData, calendlyLink, trackingId);

      const result = await this.queueEmail({
        to: leadData.email,
        subject,
        html,
        text,
        template_type: 'appointment_scheduling',
        lead_id: leadData.id,
        tracking_id: trackingId,
        metadata: {
          calendly_link: calendlyLink,
          campaign_name: leadData.source || 'HubSpot CRM',
    lead_source: 'hubspot_crm'
        }
      });

      if (result.success) {
        logger.logLeadProcessing(trackingId, 'appointment_email_queued', {
          leadId: leadData.id,
          email: leadData.email ? hashForLogging(leadData.email) : '[MISSING]',
          queueId: result.queueId
        });
      }

      return result;
    } catch (error) {
      logger.logError(error, {
        context: 'queue_appointment_email',
        trackingId,
        leadId: leadData.id
      });
      throw error;
    }
  }

  /**
   * Queue follow-up email for unscheduled leads
   * @param {Object} leadData - Lead information
   * @param {string} calendlyLink - Calendly booking link
   * @param {string} trackingId - Tracking ID for logging
   * @returns {Object} Queue result
   */
  async queueFollowUpEmail(leadData, calendlyLink, trackingId) {
    try {
      logger.logLeadProcessing(trackingId, 'queuing_followup_email', {
        leadId: leadData.id,
        email: leadData.email ? hashForLogging(leadData.email) : '[MISSING]'
      });

      const subject = `Don't Miss Out - Schedule Your Free Consultation`;
      
      const html = this.generateFollowUpEmailTemplate(leadData, calendlyLink, trackingId);
      const text = this.generateFollowUpEmailText(leadData, calendlyLink, trackingId);

      const result = await this.queueEmail({
        to: leadData.email,
        subject,
        html,
        text,
        template_type: 'follow_up',
        lead_id: leadData.id,
        tracking_id: trackingId,
        metadata: {
          calendly_link: calendlyLink,
          follow_up_type: 'unscheduled_lead'
        }
      });

      if (result.success) {
        logger.logLeadProcessing(trackingId, 'followup_email_queued', {
          leadId: leadData.id,
          email: leadData.email ? hashForLogging(leadData.email) : '[MISSING]',
          queueId: result.queueId
        });
      }

      return result;
    } catch (error) {
      logger.logError(error, {
        context: 'queue_followup_email',
        trackingId,
        leadId: leadData.id
      });
      throw error;
    }
  }

  /**
   * Queue scheduling reminder emails
   * @param {string} email - Lead email address
   * @param {string} name - Lead name
   * @param {string} reminderType - Type of reminder (first, second, final)
   * @param {string} trackingId - Tracking ID for logging
   * @param {number} leadId - Lead ID
   * @returns {Object} Queue result
   */
  async queueSchedulingReminder(email, name, reminderType, trackingId, leadId = null) {
    try {
      logger.info(`Queuing ${reminderType} scheduling reminder`, {
        trackingId: trackingId,
        email: hashForLogging(email),
        reminderType: reminderType
      });

      const reminderConfig = {
        first: {
          subject: `Reminder: Schedule Your Free Consultation - ${name}`,
          urgency: 'gentle'
        },
        second: {
          subject: `Don't Miss Out: Your Free Consultation Awaits - ${name}`,
          urgency: 'moderate'
        },
        final: {
          subject: `Final Reminder: Schedule Before We're Fully Booked - ${name}`,
          urgency: 'urgent'
        }
      };

      const config = reminderConfig[reminderType] || reminderConfig.first;
      
      const html = this.generateSchedulingReminderTemplate(name, reminderType, trackingId);
      const text = this.generateSchedulingReminderText(name, reminderType, trackingId);

      const result = await this.queueEmail({
        to: email,
        subject: config.subject,
        html,
        text,
        template_type: 'scheduling_reminder',
        lead_id: leadId,
        tracking_id: trackingId,
        metadata: {
          reminder_type: reminderType,
          urgency: config.urgency
        }
      });

      return result;
    } catch (error) {
      logger.error(error.message, {
        context: 'queue_scheduling_reminder',
        trackingId,
        email: hashForLogging(email),
        reminderType,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Queue meeting reminder email
   * @param {Object} leadData - Lead data object
   * @param {string} reminderType - Type of reminder ('24h' or '1h')
   * @param {string} trackingId - Tracking ID for logging
   * @returns {Object} Queue result
   */
  async queueMeetingReminderEmail(leadData, reminderType, trackingId) {
    try {
      logger.info('Queuing meeting reminder email', {
        trackingId,
        leadId: leadData.id,
        email: hashForLogging(leadData.email),
        reminderType
      });

      const reminderConfig = {
        '24h': {
          subject: `Reminder: Your Meeting Tomorrow - ${leadData.firstName || 'Valued Client'}`,
          timeframe: '24 hours'
        },
        '1h': {
          subject: `Meeting Starting Soon - ${leadData.firstName || 'Valued Client'}`,
          timeframe: '1 hour'
        }
      };

      const config = reminderConfig[reminderType] || reminderConfig['24h'];
      
      const html = this.generateMeetingReminderTemplate(leadData, reminderType, trackingId);
      const text = this.generateMeetingReminderText(leadData, reminderType, trackingId);

      const result = await this.queueEmail({
        to: leadData.email,
        subject: config.subject,
        html,
        text,
        template_type: 'meeting_reminder',
        lead_id: leadData.id,
        tracking_id: trackingId,
        metadata: {
          reminder_type: reminderType,
          timeframe: config.timeframe,
          meeting_scheduled_at: leadData.scheduledAt
        }
      });

      logger.info('Meeting reminder email queued successfully', {
        trackingId,
        leadId: leadData.id,
        email: hashForLogging(leadData.email),
        queueId: result.queueId
      });

      return result;
    } catch (error) {
      logger.logError(error, {
        context: 'queue_meeting_reminder_email',
        trackingId,
        leadId: leadData.id,
        reminderType
      });
      throw error;
    }
  }

  /**
   * Queue welcome email for new leads
   * @param {number} leadId - Lead ID
   * @param {string} email - Lead email
   * @param {string} name - Lead name
   * @param {Object} metadata - Additional metadata
   * @returns {Object} Queue result
   */
  async queueWelcomeEmail(leadId, email, name, metadata) {
    try {
      logger.info('Queuing welcome email', {
        leadId,
        email: hashForLogging(email),
        trackingId: metadata.trackingId
      });

      const subject = `Welcome - Let's Schedule Your Call`;
      const html = this.generateWelcomeEmailTemplate(name, metadata.trackingId);
      const text = this.generateWelcomeEmailText(name, metadata.trackingId);

      const result = await this.queueEmail({
        to: email,
        subject,
        html,
        text,
        template_type: 'welcome',
        lead_id: leadId,
        tracking_id: metadata.trackingId,
        metadata: metadata
      });

      return result;
    } catch (error) {
      logger.logError(error, {
        context: 'queue_welcome_email',
        leadId,
        trackingId: metadata.trackingId
      });
      throw error;
    }
  }

  /**
   * Queue scheduling email for leads
   * @param {number} leadId - Lead ID
   * @param {string} email - Lead email
   * @param {string} name - Lead name
   * @param {Object} metadata - Additional metadata
   * @returns {Object} Queue result
   */
  async queueSchedulingEmail(leadId, email, name, metadata) {
    try {
      logger.info('Queuing scheduling email', {
        leadId,
        email: hashForLogging(email),
        trackingId: metadata.trackingId
      });

      const subject = `Schedule Your Call - Next Steps`;
      const html = this.generateSchedulingEmailTemplate(name, metadata.trackingId);
      const text = this.generateSchedulingEmailText(name, metadata.trackingId);

      const result = await this.queueEmail({
        to: email,
        subject,
        html,
        text,
        template_type: 'scheduling',
        lead_id: leadId,
        tracking_id: metadata.trackingId,
        metadata: metadata
      });

      return result;
    } catch (error) {
      logger.logError(error, {
        context: 'queue_scheduling_email',
        leadId,
        trackingId: metadata.trackingId
      });
      throw error;
    }
  }

  /**
   * Queue scheduling reminder email
   * @param {number} leadId - Lead ID
   * @param {string} email - Lead email
   * @param {string} name - Lead name
   * @param {string} reminderType - Type of reminder (first, second, final)
   * @param {Object} metadata - Additional metadata
   * @returns {Object} Queue result
   */
  async queueSchedulingReminderEmail(leadId, email, name, reminderType, metadata) {
    try {
      logger.info(`Queuing ${reminderType} scheduling reminder`, {
        leadId,
        email: hashForLogging(email),
        reminderType,
        trackingId: metadata.trackingId
      });

      const reminderConfig = {
        first: { subject: 'Reminder: Schedule Your Call' },
        second: { subject: 'Second Reminder: Schedule Your Call' },
        final: { subject: 'Final Reminder: Schedule Your Call' }
      };

      const config = reminderConfig[reminderType] || reminderConfig.first;
      const html = this.generateSchedulingReminderTemplate(name, reminderType, metadata.trackingId);
      const text = this.generateSchedulingReminderText(name, reminderType, metadata.trackingId);

      const result = await this.queueEmail({
        to: email,
        subject: config.subject,
        html,
        text,
        template_type: `scheduling_reminder_${reminderType}`,
        lead_id: leadId,
        tracking_id: metadata.trackingId,
        metadata: { ...metadata, reminder_type: reminderType }
      });

      return result;
    } catch (error) {
      logger.logError(error, {
        context: 'queue_scheduling_reminder_email',
        leadId,
        reminderType,
        trackingId: metadata.trackingId
      });
      throw error;
    }
  }

  /**
   * Queue meeting reminder email
   * @param {number} leadId - Lead ID
   * @param {string} email - Lead email
   * @param {string} name - Lead name
   * @param {string} reminderType - Type of reminder (24h, 1h)
   * @param {Object} meetingData - Meeting details
   * @param {Date} scheduledFor - When to send the reminder
   * @param {string} trackingId - Tracking ID
   * @returns {Object} Queue result
   */
  async queueMeetingReminderEmail(leadId, email, name, reminderType, meetingData, scheduledFor, trackingId) {
    try {
      logger.info(`Queuing ${reminderType} meeting reminder`, {
        leadId,
        email: hashForLogging(email),
        reminderType,
        scheduledFor,
        trackingId
      });

      const timeLabel = reminderType === '24h' ? '24 hours' : '1 hour';
      const subject = reminderType === '24h' ? 'Meeting Reminder - Tomorrow' : 'Meeting Reminder - Starting Soon';
      
      const leadData = { full_name: name, email };
      const meetingDataForTemplate = {
        start_time: meetingData.meeting_time,
        join_url: meetingData.meeting_url
      };
      
      const html = this.generateMeetingReminderTemplate(
        leadData,
        meetingDataForTemplate,
        reminderType === '24h' ? '24_hour' : '1_hour',
        trackingId
      );
      
      const text = this.generateMeetingReminderText(
        leadData,
        meetingDataForTemplate,
        reminderType === '24h' ? '24_hour' : '1_hour',
        trackingId
      );

      const result = await this.queueEmail({
        to: email,
        subject,
        html,
        text,
        template_type: `meeting_reminder_${reminderType}`,
        lead_id: leadId,
        tracking_id: trackingId,
        scheduled_for: scheduledFor.toISOString(),
        metadata: {
          reminder_type: reminderType,
          meeting_time: meetingData.meeting_time,
          meeting_title: meetingData.meeting_title,
          meeting_url: meetingData.meeting_url,
          location: meetingData.location
        }
      });

      return result;
    } catch (error) {
      logger.logError(error, {
        context: 'queue_meeting_reminder_email',
        leadId,
        reminderType,
        trackingId
      });
      throw error;
    }
  }

  /**
   * Queue meeting reminder emails
   * @param {Object} leadData - Lead information
   * @param {Object} meetingData - Meeting details
   * @param {string} reminderType - Type of reminder (24_hour, 1_hour)
   * @param {string} trackingId - Tracking ID for logging
   * @returns {Object} Queue result
   */
  async queueMeetingReminder(leadData, meetingData, reminderType, trackingId) {
    try {
      logger.logLeadProcessing(trackingId, 'queuing_meeting_reminder', {
        leadId: leadData.id,
        email: leadData.email ? hashForLogging(leadData.email) : '[MISSING]',
        reminderType,
        meetingTime: meetingData.start_time
      });

      const meetingDate = new Date(meetingData.start_time);
      const timeUntil = reminderType === '24_hour' ? '24 hours' : '1 hour';
      const subject = `Reminder: Your consultation in ${timeUntil} - ${meetingDate.toLocaleDateString()}`;
      
      const html = this.generateMeetingReminderTemplate(leadData, meetingData, reminderType, trackingId);
      const text = this.generateMeetingReminderText(leadData, meetingData, reminderType, trackingId);

      const result = await this.queueEmail({
        to: leadData.email,
        subject,
        html,
        text,
        template_type: 'meeting_reminder',
        lead_id: leadData.id,
        tracking_id: trackingId,
        metadata: {
          reminder_type: reminderType,
          meeting_time: meetingData.start_time,
          meeting_link: meetingData.join_url
        }
      });

      if (result.success) {
        logger.logLeadProcessing(trackingId, 'meeting_reminder_queued', {
          leadId: leadData.id,
          email: leadData.email ? hashForLogging(leadData.email) : '[MISSING]',
          reminderType,
          queueId: result.queueId
        });
      }

      return result;
    } catch (error) {
      logger.logError(error, {
        context: 'queue_meeting_reminder',
        trackingId,
        leadId: leadData.id,
        reminderType
      });
      throw error;
    }
  }

  /**
   * Helper method to queue emails in the database
   * @param {Object} emailData - Email data to queue
   * @returns {Object} Queue result
   */
  async queueEmail(emailData) {
    try {
      const [data] = await db
        .insert(emailQueue)
        .values({
          toEmail: emailData.to,
          fromEmail: emailData.from_email || 'noreply@tradeservice-automation.com',
          subject: emailData.subject,
          htmlContent: emailData.html,
          textContent: emailData.text,
          templateType: emailData.template_type,
          emailType: emailData.email_type || 'transactional',
          leadId: emailData.lead_id,
          trackingId: emailData.tracking_id,
          metadata: emailData.metadata,
          status: 'scheduled',
          priority: emailData.priority || 'normal',
          scheduledFor: emailData.scheduled_for || new Date().toISOString()
        })
        .returning();

      logger.info('Email queued successfully', {
        queueId: data.id,
        to: hashForLogging(emailData.to),
        template_type: emailData.template_type,
        tracking_id: emailData.tracking_id
      });

      return { success: true, queueId: data.id, data };
    } catch (error) {
      logger.logError(error, {
        context: 'queue_email_service_error',
        emailData: {
          to: hashForLogging(emailData.to),
          template_type: emailData.template_type,
          tracking_id: emailData.tracking_id
        }
      });
      return { success: false, error: error.message };
    }
  }

  // Template generation methods
  generateWelcomeEmailTemplate(name, trackingId) {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #2c3e50; margin-bottom: 10px;">🎉 Welcome!</h1>
          <p style="color: #7f8c8d; font-size: 16px;">Let's get started with your consultation</p>
        </div>
        
        <div style="background-color: #f8f9fa; padding: 25px; border-radius: 10px; margin: 20px 0;">
          <h2 style="color: #2c3e50; margin-top: 0;">Hello ${name}! 👋</h2>
          <p style="color: #34495e; line-height: 1.6;">Welcome to our lead automation system! We're excited to help you achieve your goals.</p>
          
          <p style="color: #34495e; line-height: 1.6;">Our team will be in touch soon to schedule your free consultation where we'll discuss:</p>
          
          <ul style="color: #34495e; line-height: 1.8; padding-left: 20px;">
            <li>Your specific needs and objectives</li>
            <li>How our solutions can help you</li>
            <li>Next steps to get started</li>
            <li>Any questions you might have</li>
          </ul>
        </div>
        
        <div style="text-align: center; margin: 40px 0;">
          <a href="${process.env.CALENDLY_LINK || '#'}" 
             style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                    color: white; 
                    padding: 18px 35px; 
                    text-decoration: none; 
                    border-radius: 50px; 
                    font-weight: bold; 
                    font-size: 18px; 
                    display: inline-block; 
                    box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);">
            📅 Schedule Your Call Now
          </a>
        </div>
        
        <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #ecf0f1;">
          <p style="color: #7f8c8d; font-size: 12px; margin: 5px 0;">Tracking ID: ${trackingId}</p>
          <p style="color: #7f8c8d; font-size: 12px; margin: 5px 0;">Best regards,<br>Your Lead Automation Team</p>
        </div>
      </div>
    `;
  }

  generateWelcomeEmailText(name, trackingId) {
    return `
Welcome!

Hello ${name}!

Welcome to our lead automation system! We're excited to help you achieve your goals.

Our team will be in touch soon to schedule your free consultation.

Schedule your call: ${process.env.CALENDLY_LINK || 'Contact us for scheduling'}

What we'll discuss:
- Your specific needs and objectives
- How our solutions can help you
- Next steps to get started
- Any questions you might have

Best regards,
Your Lead Automation Team

Tracking ID: ${trackingId}
    `;
  }

  generateSchedulingEmailTemplate(name, trackingId) {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #2c3e50; margin-bottom: 10px;">📅 Ready to Schedule?</h1>
          <p style="color: #7f8c8d; font-size: 16px;">Let's set up your consultation call</p>
        </div>
        
        <div style="background-color: #f8f9fa; padding: 25px; border-radius: 10px; margin: 20px 0;">
          <h2 style="color: #2c3e50; margin-top: 0;">Hi ${name}! 👋</h2>
          <p style="color: #34495e; line-height: 1.6;">It's time to take the next step! We're ready to schedule your personalized consultation.</p>
          
          <p style="color: #34495e; line-height: 1.6;">During our call, we'll cover:</p>
          
          <ul style="color: #34495e; line-height: 1.8; padding-left: 20px;">
            <li>Your current challenges and goals</li>
            <li>Customized solutions for your needs</li>
            <li>Implementation timeline and process</li>
            <li>Investment options and next steps</li>
          </ul>
        </div>
        
        <div style="text-align: center; margin: 40px 0;">
          <a href="${process.env.CALENDLY_LINK || '#'}" 
             style="background: linear-gradient(135deg, #27ae60 0%, #2ecc71 100%); 
                    color: white; 
                    padding: 18px 35px; 
                    text-decoration: none; 
                    border-radius: 50px; 
                    font-weight: bold; 
                    font-size: 18px; 
                    display: inline-block; 
                    box-shadow: 0 4px 15px rgba(39, 174, 96, 0.3);">
            🗓️ Schedule My Call
          </a>
        </div>
        
        <div style="background-color: #e8f5e8; border-left: 4px solid #27ae60; padding: 20px; margin: 25px 0; border-radius: 5px;">
          <h3 style="color: #27ae60; margin-top: 0; font-size: 16px;">✅ What to Expect:</h3>
          <ul style="color: #2c3e50; margin: 10px 0; padding-left: 20px; line-height: 1.6;">
            <li><strong>Duration:</strong> 30-45 minutes</li>
            <li><strong>Format:</strong> Video call or phone</li>
            <li><strong>Preparation:</strong> We'll have your info ready</li>
            <li><strong>Outcome:</strong> Clear next steps</li>
          </ul>
        </div>
        
        <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #ecf0f1;">
          <p style="color: #7f8c8d; font-size: 12px; margin: 5px 0;">Tracking ID: ${trackingId}</p>
          <p style="color: #7f8c8d; font-size: 12px; margin: 5px 0;">Best regards,<br>Your Lead Automation Team</p>
        </div>
      </div>
    `;
  }

  generateSchedulingEmailText(name, trackingId) {
    return `
Ready to Schedule?

Hi ${name}!

It's time to take the next step! We're ready to schedule your personalized consultation.

Schedule your call: ${process.env.CALENDLY_LINK || 'Contact us for scheduling'}

What we'll cover:
- Your current challenges and goals
- Customized solutions for your needs
- Implementation timeline and process
- Investment options and next steps

What to expect:
- Duration: 30-45 minutes
- Format: Video call or phone
- Preparation: We'll have your info ready
- Outcome: Clear next steps

Best regards,
Your Lead Automation Team

Tracking ID: ${trackingId}
    `;
  }

  generateAppointmentEmailTemplate(leadData, calendlyLink) {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #2c3e50; margin-bottom: 10px;">📅 Schedule Your Free Consultation</h1>
          <p style="color: #7f8c8d; font-size: 16px;">Let's discuss how we can help you achieve your goals</p>
        </div>
        
        <div style="background-color: #f8f9fa; padding: 25px; border-radius: 10px; margin: 20px 0;">
          <h2 style="color: #2c3e50; margin-top: 0;">Hello ${leadData.full_name || 'there'}! 👋</h2>
          <p style="color: #34495e; line-height: 1.6;">Thank you for your interest in our services. We're excited to connect with you and learn more about your needs.</p>
          
          <p style="color: #34495e; line-height: 1.6;">We've received your information from our HubSpot CRM and would love to schedule a personalized consultation to discuss:</p>
          
          <ul style="color: #34495e; line-height: 1.8; padding-left: 20px;">
            <li>Your specific goals and challenges</li>
            <li>How our solutions can benefit you</li>
            <li>Next steps for getting started</li>
            <li>Any questions you might have</li>
          </ul>
        </div>
        
        <div style="text-align: center; margin: 40px 0;">
          <a href="${calendlyLink}" 
             style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                    color: white; 
                    padding: 18px 35px; 
                    text-decoration: none; 
                    border-radius: 50px; 
                    font-weight: bold; 
                    font-size: 18px; 
                    display: inline-block; 
                    box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3); 
                    transition: all 0.3s ease;">
            🗓️ Schedule My Free Consultation
          </a>
        </div>
        
        <div style="background-color: #e8f5e8; border-left: 4px solid #27ae60; padding: 20px; margin: 25px 0; border-radius: 5px;">
          <h3 style="color: #27ae60; margin-top: 0; font-size: 16px;">✅ What to Expect:</h3>
          <ul style="color: #2c3e50; margin: 10px 0; padding-left: 20px; line-height: 1.6;">
            <li><strong>Duration:</strong> 30-45 minutes</li>
            <li><strong>Format:</strong> Video call or phone (your choice)</li>
            <li><strong>Cost:</strong> Completely FREE, no obligations</li>
            <li><strong>Outcome:</strong> Clear action plan tailored to your needs</li>
          </ul>
        </div>
        
        ${leadData.phone ? `
        <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <p style="margin: 0; color: #856404; font-size: 14px;">
            <strong>📞 Prefer to talk now?</strong> Feel free to call us at your convenience. 
            We have your number on file: <strong>${leadData.phone}</strong>
          </p>
        </div>
        ` : ''}
        
        <div style="border-top: 2px solid #ecf0f1; padding-top: 20px; margin-top: 30px;">
          <h3 style="color: #2c3e50; margin-bottom: 15px;">Your Information Summary:</h3>
          <table style="width: 100%; border-collapse: collapse; background-color: #f8f9fa; border-radius: 5px;">
            <tr><td style="padding: 12px; font-weight: bold; color: #2c3e50;">Name:</td><td style="padding: 12px; color: #34495e;">${leadData.full_name || 'Not provided'}</td></tr>
            <tr><td style="padding: 12px; font-weight: bold; color: #2c3e50;">Email:</td><td style="padding: 12px; color: #34495e;">${leadData.email || 'Not provided'}</td></tr>
            ${leadData.phone ? `<tr><td style="padding: 12px; font-weight: bold; color: #2c3e50;">Phone:</td><td style="padding: 12px; color: #34495e;">${leadData.phone}</td></tr>` : ''}
            ${leadData.company ? `<tr><td style="padding: 12px; font-weight: bold; color: #2c3e50;">Company:</td><td style="padding: 12px; color: #34495e;">${leadData.company}</td></tr>` : ''}
            <tr><td style="padding: 12px; font-weight: bold; color: #2c3e50;">Source:</td><td style="padding: 12px; color: #34495e;">HubSpot CRM</td></tr>
            <tr><td style="padding: 12px; font-weight: bold; color: #2c3e50;">Received:</td><td style="padding: 12px; color: #34495e;">${new Date().toLocaleDateString()}</td></tr>
          </table>
        </div>
        
        <div style="text-align: center; margin: 30px 0; padding: 20px; background-color: #f1f2f6; border-radius: 10px;">
          <p style="color: #2c3e50; margin: 0; font-size: 14px; line-height: 1.6;">
            <strong>Questions or need help scheduling?</strong><br>
            Reply to this email or contact our support team.<br>
            We're here to help! 🤝
          </p>
        </div>
      </div>
    `;
  }

  generateAppointmentEmailText(leadData, calendlyLink, trackingId) {
    return `
Schedule Your Free Consultation

Hello ${leadData.full_name || 'there'}!

Thank you for your interest in our services. We're excited to connect with you!

We'd love to schedule a personalized consultation to discuss:
- Your specific goals and challenges
- How our solutions can benefit you
- Next steps for getting started
- Any questions you might have

Schedule your appointment here: ${calendlyLink}

What to expect:
- Duration: 30-45 minutes
- Format: Video call or phone
- Cost: Completely FREE
- Outcome: Clear action plan for your needs

${leadData.phone ? `Prefer to talk now? Call us - we have your number: ${leadData.phone}` : ''}

Questions? Reply to this email or contact our support team.

Best regards,
Your Lead Automation Team

Tracking ID: ${trackingId}
    `;
  }

  generateFollowUpEmailTemplate(leadData, calendlyLink, trackingId) {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #e74c3c; margin-bottom: 10px;">⏰ Don't Miss Your Opportunity!</h1>
          <p style="color: #7f8c8d; font-size: 16px;">Your free consultation is still available</p>
        </div>
        
        <div style="background-color: #fff5f5; padding: 25px; border-radius: 10px; margin: 20px 0; border-left: 4px solid #e74c3c;">
          <h2 style="color: #2c3e50; margin-top: 0;">Hi ${leadData.full_name || 'there'}, 👋</h2>
          <p style="color: #34495e; line-height: 1.6;">We noticed you haven't scheduled your free consultation yet. We don't want you to miss out on this valuable opportunity!</p>
          
          <p style="color: #34495e; line-height: 1.6;">As a reminder, we're offering a <strong>completely free consultation</strong> to discuss your goals and how we can help you achieve them.</p>
        </div>
        
        <div style="text-align: center; margin: 40px 0;">
          <a href="${calendlyLink}" 
             style="background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%); 
                    color: white; 
                    padding: 18px 35px; 
                    text-decoration: none; 
                    border-radius: 50px; 
                    font-weight: bold; 
                    font-size: 18px; 
                    display: inline-block; 
                    box-shadow: 0 4px 15px rgba(231, 76, 60, 0.3);">
            🚀 Claim My Free Consultation Now
          </a>
        </div>
        
        <div style="background-color: #f39c12; color: white; padding: 20px; border-radius: 10px; text-align: center; margin: 25px 0;">
          <h3 style="margin-top: 0; font-size: 18px;">⚡ Limited Time Offer</h3>
          <p style="margin: 10px 0; font-size: 16px;">Schedule within the next 48 hours and receive a bonus strategy guide!</p>
        </div>
        
        <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #ecf0f1;">
          <p style="color: #7f8c8d; font-size: 12px; margin: 5px 0;">Tracking ID: ${trackingId}</p>
          <p style="color: #7f8c8d; font-size: 12px; margin: 5px 0;">Best regards,<br>Your Lead Automation Team</p>
        </div>
      </div>
    `;
  }

  generateFollowUpEmailText(leadData, calendlyLink, trackingId) {
    return `
Don't Miss Your Opportunity!

Hi ${leadData.full_name || 'there'},

We noticed you haven't scheduled your free consultation yet. Don't miss out on this valuable opportunity!

Schedule now: ${calendlyLink}

Limited time: Schedule within 48 hours for a bonus strategy guide!

Best regards,
Your Lead Automation Team

Tracking ID: ${trackingId}
    `;
  }

  generateSchedulingReminderTemplate(name, reminderType, trackingId) {
    const reminderConfig = {
      first: {
        urgency: 'gentle',
        color: '#3498db',
        icon: '📅'
      },
      second: {
        urgency: 'moderate',
        color: '#f39c12',
        icon: '⏰'
      },
      final: {
        urgency: 'urgent',
        color: '#e74c3c',
        icon: '🚨'
      }
    };

    const config = reminderConfig[reminderType] || reminderConfig.first;
    
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: ${config.color}; margin-bottom: 10px;">${config.icon} ${config.urgency === 'urgent' ? 'Final Reminder' : 'Friendly Reminder'}</h1>
          <p style="color: #7f8c8d; font-size: 16px;">Your free consultation is still available</p>
        </div>
        
        <div style="background-color: ${config.urgency === 'urgent' ? '#fff5f5' : '#f8f9fa'}; padding: 25px; border-radius: 10px; margin: 20px 0; border-left: 4px solid ${config.color};">
          <h2 style="color: #2c3e50; margin-top: 0;">Hi ${name}! 👋</h2>
          <p style="color: #34495e; line-height: 1.6;">
            ${reminderType === 'final' ? 
              'This is your final reminder - we don\'t want you to miss out on this valuable opportunity!' :
              'We noticed you haven\'t scheduled your free consultation yet. We\'re here to help when you\'re ready!'}
          </p>
          
          ${reminderType === 'final' ? 
            '<p style="color: #e74c3c; font-weight: bold; line-height: 1.6;">⚡ Limited availability - Schedule now before we\'re fully booked!</p>' :
            ''}
        </div>
        
        <div style="text-align: center; margin: 40px 0;">
          <a href="${process.env.CALENDLY_LINK || '#'}" 
             style="background: linear-gradient(135deg, ${config.color} 0%, ${config.urgency === 'urgent' ? '#c0392b' : '#764ba2'} 100%); 
                    color: white; 
                    padding: 18px 35px; 
                    text-decoration: none; 
                    border-radius: 50px; 
                    font-weight: bold; 
                    font-size: 18px; 
                    display: inline-block; 
                    box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3); 
                    transition: all 0.3s ease;">
            ${config.icon} Schedule My Free Consultation Now
          </a>
        </div>
        
        <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #ecf0f1;">
          <p style="color: #7f8c8d; font-size: 12px; margin: 5px 0;">Tracking ID: ${trackingId}</p>
          <p style="color: #7f8c8d; font-size: 12px; margin: 5px 0;">Best regards,<br>Your Lead Automation Team</p>
        </div>
      </div>
    `;
  }

  generateSchedulingReminderText(name, reminderType, trackingId) {
    return `
${reminderType === 'final' ? 'FINAL REMINDER' : 'Friendly Reminder'}

Hi ${name},

${reminderType === 'final' ? 
  'This is your final reminder - don\'t miss out on this valuable opportunity!' :
  'We noticed you haven\'t scheduled your free consultation yet.'}

Schedule now: ${process.env.CALENDLY_LINK || 'Contact us for scheduling'}

${reminderType === 'final' ? 'Limited availability - Schedule before we\'re fully booked!' : ''}

Best regards,
Your Lead Automation Team

Tracking ID: ${trackingId}
    `;
  }

  generateMeetingReminderTemplate(leadData, meetingData, reminderType, trackingId) {
    const meetingDate = new Date(meetingData.start_time);
    const timeUntil = reminderType === '24_hour' ? '24 hours' : '1 hour';
    const isUrgent = reminderType === '1_hour';
    const urgencyColor = isUrgent ? '#e74c3c' : '#27ae60';
    const icon = isUrgent ? '🚨' : '🔔';
    
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #2c3e50; margin-bottom: 10px;">${icon} Meeting Reminder</h1>
          <p style="color: #7f8c8d; font-size: 16px;">Your consultation is in ${timeUntil}</p>
        </div>
        
        <div style="background-color: ${isUrgent ? '#fff5f5' : '#e8f5e8'}; padding: 25px; border-radius: 10px; margin: 20px 0; border-left: 4px solid ${urgencyColor};">
          <h2 style="color: #2c3e50; margin-top: 0;">Hi ${leadData.full_name || 'there'}! 👋</h2>
          <p style="color: #34495e; line-height: 1.6;">This is a ${isUrgent ? 'urgent' : 'friendly'} reminder that your consultation is scheduled for:</p>
          
          <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 15px 0;">
            <p style="margin: 5px 0; color: #2c3e50;"><strong>📅 Date:</strong> ${meetingDate.toLocaleDateString()}</p>
            <p style="margin: 5px 0; color: #2c3e50;"><strong>🕐 Time:</strong> ${meetingDate.toLocaleTimeString()}</p>
            ${meetingData.join_url ? `<p style="margin: 5px 0; color: #2c3e50;"><strong>🔗 Join Link:</strong> <a href="${meetingData.join_url}" style="color: #3498db;">${meetingData.join_url}</a></p>` : ''}
          </div>
          
          ${isUrgent ? '<div style="background-color: #e74c3c; color: white; padding: 15px; border-radius: 8px; text-align: center; margin: 15px 0;"><strong>⏰ Starting in 1 hour!</strong></div>' : ''}
        </div>
        
        ${meetingData.join_url ? `
        <div style="text-align: center; margin: 40px 0;">
          <a href="${meetingData.join_url}" 
             style="background: linear-gradient(135deg, ${urgencyColor} 0%, ${isUrgent ? '#c0392b' : '#2ecc71'} 100%); 
                    color: white; 
                    padding: 18px 35px; 
                    text-decoration: none; 
                    border-radius: 50px; 
                    font-weight: bold; 
                    font-size: 18px; 
                    display: inline-block; 
                    box-shadow: 0 4px 15px rgba(39, 174, 96, 0.3);">
            🎥 Join Meeting ${isUrgent ? 'Now' : ''}
          </a>
        </div>
        ` : ''}
        
        <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <p style="margin: 0; color: #856404; font-size: 14px;">
            <strong>💡 Tip:</strong> Please join the meeting a few minutes early to ensure everything is working properly.
          </p>
        </div>
        
        <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #ecf0f1;">
          <p style="color: #7f8c8d; font-size: 12px; margin: 5px 0;">Tracking ID: ${trackingId}</p>
          <p style="color: #7f8c8d; font-size: 12px; margin: 5px 0;">Best regards,<br>Your Lead Automation Team</p>
        </div>
      </div>
    `;
  }

  /**
   * Generate meeting reminder template for automated workflow
   * @param {Object} leadData - Lead data object
   * @param {string} reminderType - Type of reminder ('24h' or '1h')
   * @param {string} trackingId - Tracking ID
   * @returns {string} HTML template
   */
  generateMeetingReminderTemplate(leadData, reminderType, trackingId) {
    const isUrgent = reminderType === '1h';
    const timeUntil = reminderType === '24h' ? '24 hours' : '1 hour';
    const urgencyColor = isUrgent ? '#e74c3c' : '#27ae60';
    const icon = isUrgent ? '🚨' : '🔔';
    
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #2c3e50; margin-bottom: 10px;">${icon} Meeting Reminder</h1>
          <p style="color: #7f8c8d; font-size: 16px;">Your consultation is in ${timeUntil}</p>
        </div>
        
        <div style="background-color: ${isUrgent ? '#fff5f5' : '#e8f5e8'}; padding: 25px; border-radius: 10px; margin: 20px 0; border-left: 4px solid ${urgencyColor};">
          <h2 style="color: #2c3e50; margin-top: 0;">Hi ${leadData.firstName || leadData.full_name || 'there'}! 👋</h2>
          <p style="color: #34495e; line-height: 1.6;">This is a ${isUrgent ? 'urgent' : 'friendly'} reminder that your consultation is scheduled${leadData.scheduledAt ? ' for ' + new Date(leadData.scheduledAt).toLocaleString() : ''}.</p>
          
          <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 15px 0;">
            <h3 style="color: #2c3e50; margin-top: 0;">📅 Meeting Details</h3>
            <p style="margin: 5px 0;"><strong>Time:</strong> ${leadData.scheduledAt ? new Date(leadData.scheduledAt).toLocaleString() : 'As scheduled'}</p>
            <p style="margin: 5px 0;"><strong>Duration:</strong> 30-45 minutes</p>
            <p style="margin: 5px 0;"><strong>Format:</strong> Video call</p>
          </div>
          
          ${isUrgent ? 
            '<div style="background-color: #e74c3c; color: white; padding: 15px; border-radius: 8px; text-align: center; margin: 15px 0;"><strong>⚡ Starting in 1 hour - Please be ready!</strong></div>' :
            '<div style="background-color: #27ae60; color: white; padding: 15px; border-radius: 8px; text-align: center; margin: 15px 0;"><strong>📝 Prepare any questions you\'d like to discuss</strong></div>'
          }
        </div>
        
        <div style="text-align: center; margin: 40px 0;">
          <p style="color: #34495e; font-size: 16px;">Need to reschedule? Please contact us as soon as possible.</p>
        </div>
        
        <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #ecf0f1;">
          <p style="color: #7f8c8d; font-size: 12px; margin: 5px 0;">Tracking ID: ${trackingId}</p>
          <p style="color: #7f8c8d; font-size: 12px; margin: 5px 0;">Best regards,<br>Your Lead Automation Team</p>
        </div>
      </div>
    `;
  }

  /**
   * Generate meeting reminder text for automated workflow
   * @param {Object} leadData - Lead data object
   * @param {string} reminderType - Type of reminder ('24h' or '1h')
   * @param {string} trackingId - Tracking ID
   * @returns {string} Plain text template
   */
  generateMeetingReminderText(leadData, reminderType, trackingId) {
    const isUrgent = reminderType === '1h';
    const timeUntil = reminderType === '24h' ? '24 hours' : '1 hour';
    
    return `
Meeting Reminder - ${timeUntil} until your consultation

Hi ${leadData.firstName || leadData.full_name || 'there'},

This is a ${isUrgent ? 'urgent' : 'friendly'} reminder that your consultation is scheduled${leadData.scheduledAt ? ' for ' + new Date(leadData.scheduledAt).toLocaleString() : ''}.

Meeting Details:
- Time: ${leadData.scheduledAt ? new Date(leadData.scheduledAt).toLocaleString() : 'As scheduled'}
- Duration: 30-45 minutes
- Format: Video call

${isUrgent ? 
  'STARTING IN 1 HOUR - Please be ready!' :
  'Prepare any questions you\'d like to discuss.'
}

Need to reschedule? Please contact us as soon as possible.

Best regards,
Your Lead Automation Team

Tracking ID: ${trackingId}
    `;
  }

  generateMeetingReminderText(leadData, meetingData, reminderType, trackingId) {
    const meetingDate = new Date(meetingData.start_time);
    const timeUntil = reminderType === '24_hour' ? '24 hours' : '1 hour';
    const isUrgent = reminderType === '1_hour';
    
    return `
${isUrgent ? 'URGENT: ' : ''}Meeting Reminder

Hi ${leadData.full_name || 'there'},

This is a ${isUrgent ? 'urgent' : 'friendly'} reminder that your consultation is in ${timeUntil}:

Date: ${meetingDate.toLocaleDateString()}
Time: ${meetingDate.toLocaleTimeString()}
${meetingData.join_url ? `Join Link: ${meetingData.join_url}` : ''}

${isUrgent ? 'STARTING IN 1 HOUR!\n\n' : ''}Please join a few minutes early to ensure everything is working properly.

Best regards,
Your Lead Automation Team

Tracking ID: ${trackingId}
    `;
  }
}

export default new EmailTemplateService();