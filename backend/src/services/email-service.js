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
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
    
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
    const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}&agent=${agentToken}`;
    
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
            <tr><td style="padding: 8px 0; font-weight: bold;">Source:</td><td style="padding: 8px 0;">HubSpot CRM</td></tr>
        <tr><td style="padding: 8px 0; font-weight: bold;">Lead Source:</td><td style="padding: 8px 0;">${leadData.source || 'Direct Import'}</td></tr>
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
          <a href="${process.env.FRONTEND_URL}" style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">View in Dashboard</a>
        </div>
        
        <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <p style="margin: 0; font-size: 14px; color: #856404;"><strong>⏰ Action Required:</strong> Please follow up with this lead within 24 hours for best conversion rates.</p>
        </div>
        
        <p style="font-size: 12px; color: #6c757d;">Tracking ID: ${trackingId}</p>
        <p>Best regards,<br>Lead Automation System</p>
      </div>
    `;
    
    const text = `New Lead Alert!\n\nName: ${leadData.full_name || 'Not provided'}\nEmail: ${leadData.email || 'Not provided'}\nPhone: ${leadData.phone || 'Not provided'}\nSource: HubSpot CRM\nLead Source: ${leadData.source || 'Direct Import'}\nReceived: ${new Date().toLocaleString()}\n\nPlease log into the dashboard to view and follow up: ${process.env.FRONTEND_URL}\n\nTracking ID: ${trackingId}`;

    return await this.sendEmail({ to: agentEmail, subject, html, text });
  }

  async sendAgentCredentialsEmail(userEmail, userName, temporaryPassword, resetToken) {
    const subject = 'Welcome to Lead Management Dashboard - Your Login Credentials';
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 28px;">Welcome to Lead Management Dashboard</h1>
          <p style="margin: 10px 0 0 0; font-size: 16px; opacity: 0.9;">Your account has been created by an administrator</p>
        </div>
        
        <div style="padding: 30px; background-color: #f8f9fa; border-radius: 0 0 8px 8px;">
          <h2 style="color: #333; margin-top: 0;">Hello ${userName},</h2>
          
          <p style="color: #555; line-height: 1.6;">An administrator has created an account for you on our Lead Management Dashboard. Below are your login credentials and instructions to get started.</p>
          
          <div style="background: white; border: 2px solid #667eea; border-radius: 8px; padding: 25px; margin: 25px 0; text-align: center;">
            <h3 style="color: #667eea; margin-top: 0; margin-bottom: 20px;">🔐 Your Login Credentials</h3>
            <div style="margin-bottom: 15px;">
              <strong style="color: #333;">Username (Email):</strong><br>
              <span style="font-family: 'Courier New', monospace; background-color: #f1f3f4; padding: 8px 12px; border-radius: 4px; display: inline-block; margin-top: 5px; color: #333;">${userEmail}</span>
            </div>
            <div>
              <strong style="color: #333;">Temporary Password:</strong><br>
              <span style="font-family: 'Courier New', monospace; background-color: #f1f3f4; padding: 8px 12px; border-radius: 4px; display: inline-block; margin-top: 5px; color: #333; font-weight: bold;">${temporaryPassword}</span>
            </div>
          </div>
          
          <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; border-radius: 8px; padding: 20px; margin: 25px 0;">
            <h4 style="color: #856404; margin-top: 0; display: flex; align-items: center;">⚠️ Important Security Information</h4>
            <ul style="color: #856404; margin: 10px 0; padding-left: 20px;">
              <li><strong>This is a temporary password</strong> that expires after first use or within 24 hours</li>
              <li><strong>You must change your password</strong> immediately after logging in</li>
              <li><strong>Never share your credentials</strong> with anyone</li>
              <li><strong>Always log out</strong> when finished using the system</li>
              <li><strong>Contact support immediately</strong> if you suspect unauthorized access</li>
            </ul>
          </div>
          
          <h4 style="color: #333; margin-bottom: 15px;">🚀 Getting Started:</h4>
          <ol style="color: #555; line-height: 1.8; padding-left: 20px;">
            <li>Visit the dashboard login page</li>
            <li>Enter your email address as the username</li>
            <li>Use the temporary password provided above</li>
            <li><strong>Immediately change your password</strong> using the secure link below</li>
            <li>Complete your profile setup</li>
            <li>Start managing your assigned leads</li>
          </ol>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" style="background-color: #28a745; color: white; padding: 15px 30px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold; font-size: 16px;">🔒 Change Password Now</a>
          </div>
          
          <div style="background-color: #e9ecef; border-radius: 6px; padding: 15px; margin: 25px 0;">
            <p style="margin: 0; font-size: 14px; color: #495057;"><strong>Secure Password Reset Link:</strong></p>
            <p style="word-break: break-all; color: #6c757d; font-family: 'Courier New', monospace; font-size: 12px; margin: 5px 0 0 0;">${resetUrl}</p>
            <p style="margin: 10px 0 0 0; font-size: 12px; color: #dc3545;"><strong>⏰ This link expires in 24 hours</strong></p>
          </div>
          
          <div style="background-color: #d1ecf1; border: 1px solid #bee5eb; border-radius: 6px; padding: 15px; margin: 25px 0;">
            <h4 style="color: #0c5460; margin-top: 0;">📋 Your Access Level</h4>
            <p style="color: #0c5460; margin: 0;">As an agent, you have access to view and manage leads assigned to you. You can update lead status, add notes, and track your performance metrics.</p>
          </div>
          
          <p style="color: #555; line-height: 1.6;">If you have any questions or need assistance getting started, please don't hesitate to contact our support team or your administrator.</p>
          
          <p style="color: #555;">Best regards,<br>
          <strong>Lead Management Team</strong></p>
        </div>
        
        <div style="text-align: center; padding: 20px; background-color: #f8f9fa; border-top: 1px solid #dee2e6; color: #6c757d; font-size: 12px;">
          <p style="margin: 0;">This email contains sensitive login information. Please keep it confidential.</p>
          <p style="margin: 5px 0 0 0;">If you did not expect this account creation, please contact support immediately.</p>
        </div>
      </div>
    `;
    
    const text = `Welcome to Lead Management Dashboard!

Hello ${userName},

An administrator has created an account for you. Here are your login credentials:

Username (Email): ${userEmail}
Temporary Password: ${temporaryPassword}

IMPORTANT SECURITY INFORMATION:
- This is a temporary password that expires after first use or within 24 hours
- You must change your password immediately after logging in
- Never share your credentials with anyone
- Always log out when finished using the system
- Contact support immediately if you suspect unauthorized access

Getting Started:
1. Visit the dashboard login page
2. Enter your email address as the username
3. Use the temporary password provided above
4. Immediately change your password using this secure link: ${resetUrl}
5. Complete your profile setup
6. Start managing your assigned leads

Secure Password Reset Link: ${resetUrl}
⏰ This link expires in 24 hours

Your Access Level:
As an agent, you have access to view and manage leads assigned to you. You can update lead status, add notes, and track your performance metrics.

If you have any questions or need assistance, please contact our support team.

Best regards,
Lead Management Team

This email contains sensitive login information. Please keep it confidential.
If you did not expect this account creation, please contact support immediately.`;

    return await this.sendEmail({ to: userEmail, subject, html, text });
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