import nodemailer from 'nodemailer';

// Email configuration
const emailConfig = {
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true' || false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
};

// Create transporter
let transporter = null;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransporter(emailConfig);
  }
  return transporter;
}

// Send agent ID email
export async function sendAgentIdEmail(email, name, agentId) {
  try {
    const transporter = getTransporter();
    
    const mailOptions = {
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: email,
      subject: 'Welcome to Lead Management Dashboard - Your Agent ID',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Welcome to Lead Management Dashboard</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
            }
            .header {
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              padding: 30px;
              text-align: center;
              border-radius: 8px 8px 0 0;
            }
            .content {
              background: #f8f9fa;
              padding: 30px;
              border-radius: 0 0 8px 8px;
            }
            .agent-id-box {
              background: white;
              border: 2px solid #667eea;
              border-radius: 8px;
              padding: 20px;
              text-align: center;
              margin: 20px 0;
            }
            .agent-id {
              font-size: 24px;
              font-weight: bold;
              color: #667eea;
              letter-spacing: 2px;
              font-family: 'Courier New', monospace;
            }
            .important {
              background: #fff3cd;
              border: 1px solid #ffeaa7;
              border-radius: 4px;
              padding: 15px;
              margin: 20px 0;
            }
            .footer {
              text-align: center;
              margin-top: 30px;
              padding-top: 20px;
              border-top: 1px solid #dee2e6;
              color: #6c757d;
              font-size: 14px;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Welcome to Lead Management Dashboard</h1>
            <p>Your account has been successfully created</p>
          </div>
          
          <div class="content">
            <h2>Hello ${name},</h2>
            
            <p>Welcome to our Lead Management Dashboard! Your account has been successfully registered and you can now access the system.</p>
            
            <div class="agent-id-box">
              <h3>Your Agent ID</h3>
              <div class="agent-id">${agentId}</div>
              <p><small>Use this ID to log into the dashboard</small></p>
            </div>
            
            <div class="important">
              <h4>🔐 Important Security Information:</h4>
              <ul>
                <li><strong>Keep your Agent ID secure</strong> - This is your primary login credential</li>
                <li><strong>Never share your Agent ID</strong> with unauthorized personnel</li>
                <li><strong>Use a strong password</strong> that you haven't used elsewhere</li>
                <li><strong>Log out</strong> when you're finished using the dashboard</li>
              </ul>
            </div>
            
            <h4>Getting Started:</h4>
            <ol>
              <li>Visit the dashboard login page</li>
              <li>Enter your Agent ID: <strong>${agentId}</strong></li>
              <li>Enter the password you created during registration</li>
              <li>Start managing your leads!</li>
            </ol>
            
            <h4>Your Access Level:</h4>
            <p>As a registered agent, you have access to view and manage leads assigned to you. If you need additional permissions, please contact your system administrator.</p>
            
            <p>If you have any questions or need assistance, please don't hesitate to reach out to our support team.</p>
            
            <p>Best regards,<br>
            Lead Management Team</p>
          </div>
          
          <div class="footer">
            <p>This email was sent automatically. Please do not reply to this email.</p>
            <p>If you did not register for this account, please contact our support team immediately.</p>
          </div>
        </body>
        </html>
      `,
      text: `
Welcome to Lead Management Dashboard!

Hello ${name},

Your account has been successfully registered. Here are your login details:

Agent ID: ${agentId}

IMPORTANT SECURITY INFORMATION:
- Keep your Agent ID secure - This is your primary login credential
- Never share your Agent ID with unauthorized personnel
- Use a strong password that you haven't used elsewhere
- Log out when you're finished using the dashboard

Getting Started:
1. Visit the dashboard login page
2. Enter your Agent ID: ${agentId}
3. Enter the password you created during registration
4. Start managing your leads!

Your Access Level:
As a registered agent, you have access to view and manage leads assigned to you. If you need additional permissions, please contact your system administrator.

If you have any questions or need assistance, please contact our support team.

Best regards,
Lead Management Team

This email was sent automatically. Please do not reply to this email.
If you did not register for this account, please contact our support team immediately.
      `
    };
    
    const result = await transporter.sendMail(mailOptions);
    console.log('Agent ID email sent successfully:', result.messageId);
    return { success: true, messageId: result.messageId };
    
  } catch (error) {
    console.error('Error sending agent ID email:', error);
    return { success: false, error: error.message };
  }
}

// Send password reset email
export async function sendPasswordResetEmail(email, name, resetToken) {
  try {
    const transporter = getTransporter();
    const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL}/reset-password?token=${resetToken}`;
    
    const mailOptions = {
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: email,
      subject: 'Password Reset Request - Lead Management Dashboard',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Password Reset Request</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
            }
            .header {
              background: #dc3545;
              color: white;
              padding: 30px;
              text-align: center;
              border-radius: 8px 8px 0 0;
            }
            .content {
              background: #f8f9fa;
              padding: 30px;
              border-radius: 0 0 8px 8px;
            }
            .reset-button {
              display: inline-block;
              background: #007bff;
              color: white;
              padding: 12px 24px;
              text-decoration: none;
              border-radius: 4px;
              margin: 20px 0;
            }
            .warning {
              background: #fff3cd;
              border: 1px solid #ffeaa7;
              border-radius: 4px;
              padding: 15px;
              margin: 20px 0;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>🔐 Password Reset Request</h1>
          </div>
          
          <div class="content">
            <h2>Hello ${name},</h2>
            
            <p>We received a request to reset your password for the Lead Management Dashboard.</p>
            
            <p>Click the button below to reset your password:</p>
            
            <a href="${resetUrl}" class="reset-button">Reset Password</a>
            
            <p>Or copy and paste this link into your browser:</p>
            <p><a href="${resetUrl}">${resetUrl}</a></p>
            
            <div class="warning">
              <h4>⚠️ Security Notice:</h4>
              <ul>
                <li>This link will expire in 1 hour for security reasons</li>
                <li>If you didn't request this reset, please ignore this email</li>
                <li>Never share this reset link with anyone</li>
              </ul>
            </div>
            
            <p>If you continue to have problems, please contact our support team.</p>
            
            <p>Best regards,<br>
            Lead Management Team</p>
          </div>
        </body>
        </html>
      `,
      text: `
Password Reset Request

Hello ${name},

We received a request to reset your password for the Lead Management Dashboard.

Click this link to reset your password:
${resetUrl}

Security Notice:
- This link will expire in 1 hour for security reasons
- If you didn't request this reset, please ignore this email
- Never share this reset link with anyone

If you continue to have problems, please contact our support team.

Best regards,
Lead Management Team
      `
    };
    
    const result = await transporter.sendMail(mailOptions);
    console.log('Password reset email sent successfully:', result.messageId);
    return { success: true, messageId: result.messageId };
    
  } catch (error) {
    console.error('Error sending password reset email:', error);
    return { success: false, error: error.message };
  }
}

// Test email configuration
export async function testEmailConfig() {
  try {
    const transporter = getTransporter();
    await transporter.verify();
    return { success: true, message: 'Email configuration is valid' };
  } catch (error) {
    console.error('Email configuration test failed:', error);
    return { success: false, error: error.message };
  }
}