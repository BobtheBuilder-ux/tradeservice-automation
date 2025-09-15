import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

class EmailService {
  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      },
      tls: {
        rejectUnauthorized: false
      }
    });
  }

  async sendEmail({ to, subject, html, text }) {
    try {
      const mailOptions = {
        from: {
          name: process.env.EMAIL_FROM_NAME || 'Your App',
          address: process.env.EMAIL_FROM
        },
        to,
        subject,
        html,
        text
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log('Email sent successfully:', result.messageId);
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error('Email sending failed:', error);
      return { success: false, error: error.message };
    }
  }

  async sendWelcomeEmail(userEmail, userName) {
    const subject = 'Welcome to Our Platform!';
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Welcome ${userName}!</h2>
        <p>Thank you for joining our platform. We're excited to have you on board!</p>
        <p>Your account has been successfully created and you can now access all our features.</p>
        <div style="background-color: #f5f5f5; padding: 20px; border-radius: 5px; margin: 20px 0;">
          <h3 style="color: #555;">Getting Started:</h3>
          <ul>
            <li>Complete your profile setup</li>
            <li>Explore our dashboard features</li>
            <li>Connect with our support team if you need help</li>
          </ul>
        </div>
        <p>If you have any questions, feel free to reach out to our support team.</p>
        <p>Best regards,<br>The Team</p>
      </div>
    `;
    const text = `Welcome ${userName}! Thank you for joining our platform. Your account has been successfully created.`;

    return await this.sendEmail({ to: userEmail, subject, html, text });
  }

  async sendPasswordResetEmail(userEmail, resetToken) {
    const subject = 'Password Reset Request';
    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3001'}/reset-password?token=${resetToken}`;
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Password Reset Request</h2>
        <p>You requested a password reset for your account.</p>
        <p>Click the button below to reset your password:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}" style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">Reset Password</a>
        </div>
        <p>If the button doesn't work, copy and paste this link into your browser:</p>
        <p style="word-break: break-all; color: #666;">${resetUrl}</p>
        <p><strong>This link will expire in 1 hour.</strong></p>
        <p>If you didn't request this password reset, please ignore this email.</p>
        <p>Best regards,<br>The Team</p>
      </div>
    `;
    const text = `Password reset requested. Visit: ${resetUrl} (expires in 1 hour)`;

    return await this.sendEmail({ to: userEmail, subject, html, text });
  }

  async sendVerificationEmail(userEmail, verificationToken, agentToken) {
    const subject = 'Verify Your Email Address';
    const verificationUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/verify-email?token=${verificationToken}&agent=${agentToken}`;
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Verify Your Email Address</h2>
        <p>Thank you for signing up! Please verify your email address to complete your registration.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${verificationUrl}" style="background-color: #28a745; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">Verify Email</a>
        </div>
        <p>If the button doesn't work, copy and paste this link into your browser:</p>
        <p style="word-break: break-all; color: #666;">${verificationUrl}</p>
        <p><strong>This link will expire in 24 hours.</strong></p>
        <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <p style="margin: 0; font-size: 14px; color: #666;"><strong>Agent Token:</strong> ${agentToken}</p>
          <p style="margin: 5px 0 0 0; font-size: 12px; color: #999;">This token is required for verification and will expire in 24 hours.</p>
        </div>
        <p>If you didn't create this account, please ignore this email.</p>
        <p>Best regards,<br>The Team</p>
      </div>
    `;
    const text = `Please verify your email: ${verificationUrl} (expires in 24 hours). Agent Token: ${agentToken}`;

    return await this.sendEmail({ to: userEmail, subject, html, text });
  }

  async sendLeadNotification(agentEmail, leadData, trackingId) {
    const subject = 'New Lead Alert - Action Required';
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">🚨 New Lead Alert</h2>
        <p>A new lead has been received and requires your attention.</p>
        
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #495057;">Lead Information</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 8px 0; font-weight: bold;">Name:</td><td style="padding: 8px 0;">${leadData.full_name || 'Not provided'}</td></tr>
            <tr><td style="padding: 8px 0; font-weight: bold;">Email:</td><td style="padding: 8px 0;">${leadData.email || 'Not provided'}</td></tr>
            <tr><td style="padding: 8px 0; font-weight: bold;">Phone:</td><td style="padding: 8px 0;">${leadData.phone || 'Not provided'}</td></tr>
            <tr><td style="padding: 8px 0; font-weight: bold;">Source:</td><td style="padding: 8px 0;">Facebook Lead Ad</td></tr>
            <tr><td style="padding: 8px 0; font-weight: bold;">Campaign:</td><td style="padding: 8px 0;">${leadData.facebook_campaign_name || 'Not available'}</td></tr>
            <tr><td style="padding: 8px 0; font-weight: bold;">Received:</td><td style="padding: 8px 0;">${new Date().toLocaleString()}</td></tr>
          </table>
        </div>
        
        ${leadData.custom_fields ? `
        <div style="background-color: #e9ecef; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <h4 style="margin-top: 0; color: #495057;">Additional Information</h4>
          <pre style="font-family: Arial, sans-serif; white-space: pre-wrap; margin: 0;">${JSON.stringify(leadData.custom_fields, null, 2)}</pre>
        </div>
        ` : ''}
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}" style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">View in Dashboard</a>
        </div>
        
        <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <p style="margin: 0; font-size: 14px; color: #856404;"><strong>⏰ Action Required:</strong> Please follow up with this lead within 24 hours for best conversion rates.</p>
        </div>
        
        <p style="font-size: 12px; color: #6c757d;">Tracking ID: ${trackingId}</p>
        <p>Best regards,<br>Lead Automation System</p>
      </div>
    `;
    
    const text = `New Lead Alert!\n\nName: ${leadData.full_name || 'Not provided'}\nEmail: ${leadData.email || 'Not provided'}\nPhone: ${leadData.phone || 'Not provided'}\nSource: Facebook Lead Ad\nCampaign: ${leadData.facebook_campaign_name || 'Not available'}\nReceived: ${new Date().toLocaleString()}\n\nPlease log into the dashboard to view and follow up: ${process.env.FRONTEND_URL || 'http://localhost:3000'}\n\nTracking ID: ${trackingId}`;

    return await this.sendEmail({ to: agentEmail, subject, html, text });
  }

  async testConnection() {
    try {
      await this.transporter.verify();
      console.log('SMTP connection verified successfully');
      return { success: true, message: 'SMTP connection verified' };
    } catch (error) {
      console.error('SMTP connection failed:', error);
      return { success: false, error: error.message };
    }
  }
}

export default new EmailService();