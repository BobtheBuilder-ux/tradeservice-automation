import EmailService from './email-service.js';
import logger from '../utils/logger.js';
import { hashForLogging } from '../utils/crypto.js';

/**
 * Service for sending Calendly appointment scheduling emails to leads
 */
class CalendlyEmailService {
  /**
   * Send appointment scheduling email to a lead
   * @param {Object} leadData - Lead information
   * @param {string} calendlyLink - Calendly booking link
   * @param {string} trackingId - Tracking ID for logging
   * @returns {Object} Email sending result
   */
  async sendAppointmentEmail(leadData, calendlyLink, trackingId) {
    try {
      logger.logLeadProcessing(trackingId, 'sending_calendly_appointment_email', {
        leadId: leadData.id,
        email: leadData.email ? hashForLogging(leadData.email) : '[MISSING]',
        calendlyLink: calendlyLink ? '[PROVIDED]' : '[MISSING]'
      });

      const subject = `Schedule Your Consultation - ${leadData.full_name || 'Valued Lead'}`;
      
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #2c3e50; margin-bottom: 10px;">📅 Schedule Your Free Consultation</h1>
            <p style="color: #7f8c8d; font-size: 16px;">Let's discuss how we can help you achieve your goals</p>
          </div>
          
          <div style="background-color: #f8f9fa; padding: 25px; border-radius: 10px; margin: 20px 0;">
            <h2 style="color: #2c3e50; margin-top: 0;">Hello ${leadData.full_name || 'there'}! 👋</h2>
            <p style="color: #34495e; line-height: 1.6;">Thank you for your interest in our services. We're excited to connect with you and learn more about your needs.</p>
            
            <p style="color: #34495e; line-height: 1.6;">We've received your information from our Facebook campaign <strong>"${leadData.facebook_campaign_name || 'Lead Generation Campaign'}"</strong> and would love to schedule a personalized consultation to discuss:</p>
            
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
              <tr><td style="padding: 12px; font-weight: bold; color: #2c3e50;">Source:</td><td style="padding: 12px; color: #34495e;">Facebook Lead Ad</td></tr>
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
          
          <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #ecf0f1;">
            <p style="color: #7f8c8d; font-size: 12px; margin: 5px 0;">Tracking ID: ${trackingId}</p>
            <p style="color: #7f8c8d; font-size: 12px; margin: 5px 0;">Best regards,<br>Your Lead Automation Team</p>
          </div>
        </div>
      `;

      const text = `
Schedule Your Free Consultation

Hello ${leadData.full_name || 'there'}!

Thank you for your interest in our services. We'd love to schedule a personalized consultation with you.

Schedule your appointment here: ${calendlyLink}

What to expect:
- Duration: 30-45 minutes
- Format: Video call or phone
- Cost: Completely FREE
- Outcome: Clear action plan for your needs

Your Information:
Name: ${leadData.full_name || 'Not provided'}
Email: ${leadData.email || 'Not provided'}
${leadData.phone ? `Phone: ${leadData.phone}\n` : ''}${leadData.company ? `Company: ${leadData.company}\n` : ''}Source: Facebook Lead Ad
Received: ${new Date().toLocaleDateString()}

Questions? Reply to this email or contact our support team.

Best regards,
Your Lead Automation Team

Tracking ID: ${trackingId}
      `;

      const result = await EmailService.sendEmail({ 
        to: leadData.email, 
        subject, 
        html, 
        text 
      });

      if (result.success) {
        logger.logLeadProcessing(trackingId, 'calendly_appointment_email_sent', {
          leadId: leadData.id,
          email: leadData.email ? hashForLogging(leadData.email) : '[MISSING]',
          messageId: result.messageId
        });
      } else {
        logger.logError(new Error('Failed to send Calendly appointment email'), {
          context: 'calendly_appointment_email_failed',
          trackingId,
          leadId: leadData.id,
          error: result.error
        });
      }

      return result;

    } catch (error) {
      logger.logError(error, {
        context: 'calendly_appointment_email_service',
        trackingId,
        leadId: leadData.id
      });
      throw error;
    }
  }

  /**
   * Send follow-up email for unscheduled leads
   * @param {Object} leadData - Lead information
   * @param {string} calendlyLink - Calendly booking link
   * @param {string} trackingId - Tracking ID for logging
   * @returns {Object} Email sending result
   */
  async sendFollowUpEmail(leadData, calendlyLink, trackingId) {
    try {
      logger.logLeadProcessing(trackingId, 'sending_calendly_followup_email', {
        leadId: leadData.id,
        email: leadData.email ? hashForLogging(leadData.email) : '[MISSING]'
      });

      const subject = `Don't Miss Out - Schedule Your Free Consultation`;
      
      const html = `
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

      const text = `
Don't Miss Your Opportunity!

Hi ${leadData.full_name || 'there'},

We noticed you haven't scheduled your free consultation yet. Don't miss out on this valuable opportunity!

Schedule now: ${calendlyLink}

Limited time: Schedule within 48 hours for a bonus strategy guide!

Best regards,
Your Lead Automation Team

Tracking ID: ${trackingId}
      `;

      const result = await EmailService.sendEmail({ 
        to: leadData.email, 
        subject, 
        html, 
        text 
      });

      if (result.success) {
        logger.logLeadProcessing(trackingId, 'calendly_followup_email_sent', {
          leadId: leadData.id,
          email: leadData.email ? hashForLogging(leadData.email) : '[MISSING]',
          messageId: result.messageId
        });
      } else {
        logger.logError(new Error('Failed to send Calendly follow-up email'), {
          context: 'calendly_followup_email_failed',
          trackingId,
          leadId: leadData.id,
          error: result.error
        });
      }

      return result;

    } catch (error) {
      logger.logError(error, {
        context: 'calendly_followup_email_service',
        trackingId,
        leadId: leadData.id
      });
      throw error;
    }
  }

  /**
   * Send reminder email for scheduled appointments
   * @param {Object} leadData - Lead information
   * @param {Object} appointmentData - Appointment details
   * @param {string} trackingId - Tracking ID for logging
   * @returns {Object} Email sending result
   */
  async sendAppointmentReminder(leadData, appointmentData, trackingId) {
    try {
      logger.logLeadProcessing(trackingId, 'sending_calendly_reminder_email', {
        leadId: leadData.id,
        email: leadData.email ? hashForLogging(leadData.email) : '[MISSING]',
        appointmentTime: appointmentData.start_time
      });

      const appointmentDate = new Date(appointmentData.start_time);
      const subject = `Reminder: Your consultation is tomorrow - ${appointmentDate.toLocaleDateString()}`;
      
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #2c3e50; margin-bottom: 10px;">🔔 Appointment Reminder</h1>
            <p style="color: #7f8c8d; font-size: 16px;">Your consultation is coming up soon!</p>
          </div>
          
          <div style="background-color: #e8f5e8; padding: 25px; border-radius: 10px; margin: 20px 0; border-left: 4px solid #27ae60;">
            <h2 style="color: #2c3e50; margin-top: 0;">Hi ${leadData.full_name || 'there'}! 👋</h2>
            <p style="color: #34495e; line-height: 1.6;">This is a friendly reminder that your free consultation is scheduled for <strong>tomorrow</strong>.</p>
          </div>
          
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 10px; margin: 20px 0;">
            <h3 style="color: #2c3e50; margin-top: 0;">📅 Appointment Details:</h3>
            <table style="width: 100%; border-collapse: collapse;">
              <tr><td style="padding: 8px 0; font-weight: bold; color: #2c3e50;">Date:</td><td style="padding: 8px 0; color: #34495e;">${appointmentDate.toLocaleDateString()}</td></tr>
              <tr><td style="padding: 8px 0; font-weight: bold; color: #2c3e50;">Time:</td><td style="padding: 8px 0; color: #34495e;">${appointmentDate.toLocaleTimeString()}</td></tr>
              <tr><td style="padding: 8px 0; font-weight: bold; color: #2c3e50;">Duration:</td><td style="padding: 8px 0; color: #34495e;">30-45 minutes</td></tr>
              ${appointmentData.location ? `<tr><td style="padding: 8px 0; font-weight: bold; color: #2c3e50;">Location:</td><td style="padding: 8px 0; color: #34495e;">${appointmentData.location}</td></tr>` : ''}
            </table>
          </div>
          
          <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <h3 style="color: #856404; margin-top: 0; font-size: 16px;">📝 Please Prepare:</h3>
            <ul style="color: #856404; margin: 10px 0; padding-left: 20px; line-height: 1.6;">
              <li>A quiet space for our call</li>
              <li>Your questions about our services</li>
              <li>Any relevant documents or information</li>
              <li>Your goals and objectives</li>
            </ul>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <p style="color: #2c3e50; font-size: 16px; margin: 10px 0;">Need to reschedule or have questions?</p>
            <p style="color: #7f8c8d; font-size: 14px; margin: 5px 0;">Simply reply to this email or contact our support team.</p>
          </div>
          
          <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #ecf0f1;">
            <p style="color: #7f8c8d; font-size: 12px; margin: 5px 0;">Tracking ID: ${trackingId}</p>
            <p style="color: #7f8c8d; font-size: 12px; margin: 5px 0;">Looking forward to speaking with you!<br>Your Lead Automation Team</p>
          </div>
        </div>
      `;

      const text = `
Appointment Reminder

Hi ${leadData.full_name || 'there'}!

This is a friendly reminder that your free consultation is scheduled for tomorrow.

Appointment Details:
Date: ${appointmentDate.toLocaleDateString()}
Time: ${appointmentDate.toLocaleTimeString()}
Duration: 30-45 minutes
${appointmentData.location ? `Location: ${appointmentData.location}\n` : ''}
Please Prepare:
- A quiet space for our call
- Your questions about our services
- Any relevant documents or information
- Your goals and objectives

Need to reschedule or have questions? Simply reply to this email.

Looking forward to speaking with you!
Your Lead Automation Team

Tracking ID: ${trackingId}
      `;

      const result = await EmailService.sendEmail({ 
        to: leadData.email, 
        subject, 
        html, 
        text 
      });

      if (result.success) {
        logger.logLeadProcessing(trackingId, 'calendly_reminder_email_sent', {
          leadId: leadData.id,
          email: leadData.email ? hashForLogging(leadData.email) : '[MISSING]',
          messageId: result.messageId
        });
      } else {
        logger.logError(new Error('Failed to send Calendly reminder email'), {
          context: 'calendly_reminder_email_failed',
          trackingId,
          leadId: leadData.id,
          error: result.error
        });
      }

      return result;

    } catch (error) {
      logger.logError(error, {
        context: 'calendly_reminder_email_service',
        trackingId,
        leadId: leadData.id
      });
      throw error;
    }
  }

  /**
   * Send initial scheduling email to new leads
   * @param {string} email - Lead email address
   * @param {string} name - Lead name
   * @param {string} trackingId - Tracking ID for logging
   * @returns {Object} Email sending result
   */
  async sendSchedulingEmail(email, name, trackingId) {
    try {
      logger.info('Sending scheduling email', {
        trackingId: trackingId,
        email: hashForLogging(email)
      });

      const subject = `Schedule Your Free Consultation - ${name}`;
      
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #2c3e50; margin-bottom: 10px;">📅 Schedule Your Free Consultation</h1>
            <p style="color: #7f8c8d; font-size: 16px;">Let's discuss how we can help you achieve your goals</p>
          </div>
          
          <div style="background-color: #f8f9fa; padding: 25px; border-radius: 10px; margin: 20px 0;">
            <h2 style="color: #2c3e50; margin-top: 0;">Hello ${name}! 👋</h2>
            <p style="color: #34495e; line-height: 1.6;">Thank you for your interest in our services. We're excited to connect with you and learn more about your needs.</p>
            
            <p style="color: #34495e; line-height: 1.6;">We would love to schedule a personalized consultation to discuss:</p>
            
            <ul style="color: #34495e; line-height: 1.8; padding-left: 20px;">
              <li>Your specific goals and challenges</li>
              <li>How our solutions can benefit you</li>
              <li>Next steps for getting started</li>
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
                      box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3); 
                      transition: all 0.3s ease;">
              🗓️ Schedule My Free Consultation
            </a>
          </div>
          
          <div style="text-align: center; margin: 30px 0; padding: 20px; background-color: #f1f2f6; border-radius: 10px;">
            <p style="color: #2c3e50; margin: 0; font-size: 14px; line-height: 1.6;">
              <strong>Questions or need help scheduling?</strong><br>
              Reply to this email or contact our support team.<br>
              We're here to help! 🤝
            </p>
          </div>
          
          <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #ecf0f1;">
            <p style="color: #7f8c8d; font-size: 12px; margin: 5px 0;">Tracking ID: ${trackingId}</p>
            <p style="color: #7f8c8d; font-size: 12px; margin: 5px 0;">Best regards,<br>Your Lead Automation Team</p>
          </div>
        </div>
      `;

      const text = `
Schedule Your Free Consultation

Hello ${name}!

Thank you for your interest in our services. We'd love to schedule a personalized consultation with you.

Schedule your appointment here: ${process.env.CALENDLY_LINK || 'Contact us for scheduling'}

What to expect:
- Duration: 30-45 minutes
- Format: Video call or phone
- Cost: Completely FREE
- Outcome: Clear action plan for your needs

Questions? Reply to this email or contact our support team.

Best regards,
Your Lead Automation Team

Tracking ID: ${trackingId}
      `;

      const result = await EmailService.sendEmail({ 
        to: email, 
        subject, 
        html, 
        text 
      });

      return result;

    } catch (error) {
      logger.error(error.message, {
        context: 'send_scheduling_email',
        trackingId,
        email: hashForLogging(email),
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Send scheduling reminder emails
   * @param {string} email - Lead email address
   * @param {string} name - Lead name
   * @param {string} reminderType - Type of reminder (first, second, final)
   * @param {string} trackingId - Tracking ID for logging
   * @returns {Object} Email sending result
   */
  async sendSchedulingReminder(email, name, reminderType, trackingId) {
    try {
      logger.info(`Sending ${reminderType} scheduling reminder`, {
        trackingId: trackingId,
        email: hashForLogging(email),
        reminderType: reminderType
      });

      const reminderConfig = {
        first: {
          subject: `Reminder: Schedule Your Free Consultation - ${name}`,
          urgency: 'gentle',
          color: '#3498db',
          icon: '📅'
        },
        second: {
          subject: `Don't Miss Out: Your Free Consultation Awaits - ${name}`,
          urgency: 'moderate',
          color: '#f39c12',
          icon: '⏰'
        },
        final: {
          subject: `Final Reminder: Schedule Before We're Fully Booked - ${name}`,
          urgency: 'urgent',
          color: '#e74c3c',
          icon: '🚨'
        }
      };

      const config = reminderConfig[reminderType] || reminderConfig.first;
      
      const html = `
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

      const text = `
${config.urgency === 'urgent' ? 'FINAL REMINDER' : 'Friendly Reminder'}

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

      const result = await EmailService.sendEmail({ 
        to: email, 
        subject: config.subject, 
        html, 
        text 
      });

      return result;

    } catch (error) {
      logger.error(error.message, {
        context: 'send_scheduling_reminder',
        trackingId,
        email: hashForLogging(email),
        reminderType,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Send initial engagement email (alias for scheduling email)
   * @param {string} email - Lead email address
   * @param {string} name - Lead name
   * @param {string} trackingId - Tracking ID for logging
   * @returns {Object} Email sending result
   */
  async sendInitialEngagementEmail(email, name, trackingId) {
    return await this.sendSchedulingEmail(email, name, trackingId);
  }
}

export default new CalendlyEmailService();