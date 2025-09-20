import nodemailer from 'nodemailer';
import { logger } from '../../utils/logger.js';

class EmailService {
  constructor() {
    this.transporter = null;
    this.adminEmail = process.env.ADMIN_EMAIL || 'admin@company.com';
    this.initializeTransporter();
  }

  initializeTransporter() {
    try {
      this.transporter = nodemailer.createTransporter({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: process.env.SMTP_PORT || 587,
        secure: false, // true for 465, false for other ports
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });

      // Verify connection configuration
      this.transporter.verify((error, success) => {
        if (error) {
          logger.error('Email transporter verification failed:', error);
        } else {
          logger.info('Email server is ready to take our messages');
        }
      });
    } catch (error) {
      logger.error('Failed to initialize email transporter:', error);
    }
  }

  async sendFeedbackNotification({
    type, // 'new' or 'updated'
    agentName,
    agentEmail,
    leadEmail,
    leadName,
    subject,
    content,
    priority,
    feedbackId,
    adminResponse = null,
  }) {
    try {
      if (!this.transporter) {
        logger.warn('Email transporter not initialized, skipping notification');
        return;
      }

      const isNewFeedback = type === 'new';
      const emailSubject = isNewFeedback 
        ? `🔔 New Agent Feedback Submitted - ${priority.toUpperCase()} Priority`
        : `📝 Agent Feedback Updated - ${priority.toUpperCase()} Priority`;

      const emailBody = this.generateFeedbackEmailTemplate({
        type,
        agentName,
        agentEmail,
        leadEmail,
        leadName,
        subject,
        content,
        priority,
        feedbackId,
        adminResponse,
      });

      const mailOptions = {
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: this.adminEmail,
        subject: emailSubject,
        html: emailBody,
      };

      const info = await this.transporter.sendMail(mailOptions);
      logger.info(`Feedback notification email sent: ${info.messageId}`);
      return info;
    } catch (error) {
      logger.error('Error sending feedback notification email:', error);
      throw error;
    }
  }

  generateFeedbackEmailTemplate({
    type,
    agentName,
    agentEmail,
    leadEmail,
    leadName,
    subject,
    content,
    priority,
    feedbackId,
    adminResponse,
  }) {
    const isNewFeedback = type === 'new';
    const priorityColor = this.getPriorityColor(priority);
    const timestamp = new Date().toLocaleString();

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Agent Feedback Notification</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f5f5f5;
          }
          .container {
            background: white;
            border-radius: 8px;
            padding: 30px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          }
          .header {
            text-align: center;
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 2px solid #e9ecef;
          }
          .header h1 {
            color: #2c3e50;
            margin: 0;
            font-size: 24px;
          }
          .priority-badge {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: bold;
            text-transform: uppercase;
            color: white;
            margin-left: 10px;
          }
          .info-section {
            margin: 20px 0;
            padding: 15px;
            background-color: #f8f9fa;
            border-radius: 6px;
            border-left: 4px solid #007bff;
          }
          .info-row {
            display: flex;
            margin: 8px 0;
          }
          .info-label {
            font-weight: bold;
            min-width: 120px;
            color: #495057;
          }
          .info-value {
            color: #212529;
          }
          .feedback-content {
            margin: 20px 0;
            padding: 20px;
            background-color: #fff;
            border: 1px solid #dee2e6;
            border-radius: 6px;
          }
          .feedback-subject {
            font-size: 18px;
            font-weight: bold;
            color: #2c3e50;
            margin-bottom: 15px;
          }
          .feedback-text {
            color: #495057;
            white-space: pre-wrap;
            line-height: 1.6;
          }
          .admin-response {
            margin-top: 20px;
            padding: 15px;
            background-color: #e8f5e8;
            border-left: 4px solid #28a745;
            border-radius: 6px;
          }
          .admin-response-label {
            font-weight: bold;
            color: #155724;
            margin-bottom: 10px;
          }
          .footer {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #e9ecef;
            text-align: center;
            color: #6c757d;
            font-size: 14px;
          }
          .action-button {
            display: inline-block;
            padding: 12px 24px;
            background-color: #007bff;
            color: white;
            text-decoration: none;
            border-radius: 6px;
            margin: 20px 0;
            font-weight: bold;
          }
          .timestamp {
            color: #6c757d;
            font-size: 14px;
            font-style: italic;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>
              ${isNewFeedback ? '🔔 New Agent Feedback' : '📝 Feedback Updated'}
              <span class="priority-badge" style="background-color: ${priorityColor};">
                ${priority}
              </span>
            </h1>
            <div class="timestamp">${timestamp}</div>
          </div>

          <div class="info-section">
            <h3 style="margin-top: 0; color: #495057;">Agent Information</h3>
            <div class="info-row">
              <span class="info-label">Agent Name:</span>
              <span class="info-value">${agentName}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Agent Email:</span>
              <span class="info-value">${agentEmail}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Feedback ID:</span>
              <span class="info-value">#${feedbackId}</span>
            </div>
          </div>

          <div class="info-section">
            <h3 style="margin-top: 0; color: #495057;">Lead Information</h3>
            <div class="info-row">
              <span class="info-label">Lead Name:</span>
              <span class="info-value">${leadName || 'N/A'}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Lead Email:</span>
              <span class="info-value">${leadEmail}</span>
            </div>
          </div>

          <div class="feedback-content">
            <div class="feedback-subject">${subject}</div>
            <div class="feedback-text">${content}</div>
          </div>

          ${adminResponse ? `
            <div class="admin-response">
              <div class="admin-response-label">Admin Response:</div>
              <div class="feedback-text">${adminResponse}</div>
            </div>
          ` : ''}

          <div style="text-align: center;">
            <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/admin-dashboard" class="action-button">
              View in Dashboard
            </a>
          </div>

          <div class="footer">
            <p>This is an automated notification from your Lead Management System.</p>
            <p>Please do not reply to this email.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  getPriorityColor(priority) {
    const colors = {
      low: '#28a745',
      medium: '#ffc107',
      high: '#fd7e14',
      urgent: '#dc3545',
    };
    return colors[priority] || colors.medium;
  }

  async sendTestEmail() {
    try {
      const testMailOptions = {
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: this.adminEmail,
        subject: 'Test Email - Lead Management System',
        html: `
          <h2>Test Email</h2>
          <p>This is a test email to verify the email service is working correctly.</p>
          <p>Sent at: ${new Date().toLocaleString()}</p>
        `,
      };

      const info = await this.transporter.sendMail(testMailOptions);
      logger.info(`Test email sent: ${info.messageId}`);
      return info;
    } catch (error) {
      logger.error('Error sending test email:', error);
      throw error;
    }
  }
}

export const emailService = new EmailService();