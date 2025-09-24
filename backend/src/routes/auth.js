import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { db } from '../config/index.js';
import { agents } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import emailService from '../services/email-service.js';
import dotenv from 'dotenv';
import { authLimiter, registerLimiter, verifyEmailLimiter, passwordResetLimiter } from '../middleware/rateLimiter.js';
import { validateRegistration, validateLogin, validateEmailVerification } from '../middleware/validation.js';

dotenv.config();

const router = express.Router();

// JWT secret
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Generate JWT token
const generateToken = (userId, email, role = 'user') => {
  return jwt.sign(
    { userId, email, role },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
};

// Generate verification token
const generateVerificationToken = () => {
  return jwt.sign(
    { type: 'verification', timestamp: Date.now() },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
};

// Generate agent token
const generateAgentToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

// Generate password reset token
const generateResetToken = (email) => {
  return jwt.sign(
    { type: 'reset', email, timestamp: Date.now() },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
};

// Register endpoint
router.post('/register', registerLimiter, validateRegistration, async (req, res) => {
  try {
    const { email, password, name, role = 'user' } = req.body;

    // Validate input
    if (!email || !password || !name) {
      return res.status(400).json({
        error: 'Email, password, and name are required'
      });
    }

    // Check if user already exists
    const existingUser = await db.select({ id: agents.id })
      .from(agents)
      .where(eq(agents.email, email))
      .limit(1);

    if (existingUser.length > 0) {
      return res.status(400).json({
        error: 'User already exists with this email'
      });
    }

    // Hash password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Generate verification token and agent token
    const verificationToken = generateVerificationToken();
    const agentToken = generateAgentToken();
    const agentTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now
    
    console.log('Generated tokens:', {
      verificationToken: verificationToken ? 'present' : 'missing',
      agentToken: agentToken ? agentToken : 'missing',
      agentTokenExpires: agentTokenExpires.toISOString()
    });

    // Create user in database
    const newUser = await db.insert(agents).values({
      email,
      passwordHash: hashedPassword,
      firstName: name.split(' ')[0] || name,
      lastName: name.split(' ').slice(1).join(' ') || '',
      fullName: name,
      role,
      emailVerified: false,
      verificationToken: verificationToken,
      agentToken: agentToken,
      agentTokenExpires: agentTokenExpires,
    }).returning();

    if (!newUser || newUser.length === 0) {
      console.error('Database error: Failed to create user');
      return res.status(500).json({
        error: 'Failed to create user account'
      });
    }

    // Send verification email with agent token
    const emailResult = await emailService.sendVerificationEmail(email, verificationToken, agentToken);
    
    if (!emailResult.success) {
      console.error('Failed to send verification email:', emailResult.error);
      // Don't fail registration if email fails, just log it
    }

    // Generate JWT token
    const token = generateToken(newUser[0].id, email, role);

    res.status(201).json({
      message: 'User registered successfully. Please check your email to verify your account.',
      user: {
        id: newUser[0].id,
        email: newUser[0].email,
        name: newUser[0].fullName,
        role: newUser[0].role,
        emailVerified: newUser[0].emailVerified
      },
      token,
      emailSent: emailResult.success
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      error: 'Internal server error during registration'
    });
  }
});

// Login endpoint
router.post('/login', authLimiter, validateLogin, async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        error: 'Email and password are required'
      });
    }

    // Find user
    const userResult = await db.select()
      .from(agents)
      .where(eq(agents.email, email))
      .limit(1);

    if (!userResult || userResult.length === 0) {
      return res.status(401).json({
        error: 'Invalid email or password'
      });
    }

    const user = userResult[0];

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    
    if (!isValidPassword) {
      return res.status(401).json({
        error: 'Invalid email or password'
      });
    }

    // Update last login
    await db.update(agents)
      .set({ lastLogin: new Date() })
      .where(eq(agents.id, user.id));

    // Generate JWT token
    const token = generateToken(user.id, user.email, user.role);

    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        name: user.fullName,
        role: user.role,
        emailVerified: user.emailVerified
      },
      token
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      error: 'Internal server error during login'
    });
  }
});

// Verify email endpoint
router.post('/verify-email', verifyEmailLimiter, validateEmailVerification, async (req, res) => {
  try {
    const { token, agentToken } = req.body;

    if (!token || !agentToken) {
      return res.status(400).json({
        error: 'Both verification token and agent token are required'
      });
    }

    // Verify the JWT token
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (jwtError) {
      return res.status(400).json({
        error: 'Invalid or expired verification token'
      });
    }

    // Check if it's a verification token
    if (decoded.type !== 'verification') {
      return res.status(400).json({
        error: 'Invalid token type'
      });
    }

    // Find user with both verification token and agent token
    const user = await db.select()
      .from(agents)
      .where(
        eq(agents.verificationToken, token)
      )
      .limit(1);

    if (!user || user.length === 0) {
      return res.status(400).json({
        error: 'Invalid verification token'
      });
    }

    const userRecord = user[0];

    // Check agent token
    if (userRecord.agentToken !== agentToken) {
      return res.status(400).json({
        error: 'Invalid agent token'
      });
    }

    if (userRecord.emailVerified) {
      return res.status(400).json({
        error: 'Email already verified'
      });
    }

    // Check if agent token has expired
    const now = new Date();
    const tokenExpiry = new Date(userRecord.agentTokenExpires);
    if (now > tokenExpiry) {
      return res.status(400).json({
        error: 'Agent token has expired. Please register again.'
      });
    }

    // Update user as verified
    try {
      await db.update(agents)
        .set({
          emailVerified: true,
          verificationToken: null,
          agentToken: null,
          agentTokenExpires: null,
          updatedAt: new Date()
        })
        .where(eq(agents.id, userRecord.id));
    } catch (updateError) {
      console.error('Failed to update user verification:', updateError);
      return res.status(500).json({
        error: 'Failed to verify email'
      });
    }

    // Send welcome email
    await emailService.sendWelcomeEmail(userRecord.email, userRecord.fullName || `${userRecord.firstName} ${userRecord.lastName}`);

    // Generate new JWT token for the verified user
    const authToken = generateToken(userRecord.id, userRecord.email, userRecord.role);

    res.json({
      message: 'Email verified successfully',
      user: {
        id: userRecord.id,
        email: userRecord.email,
        name: userRecord.fullName || `${userRecord.firstName} ${userRecord.lastName}`,
        role: userRecord.role,
        emailVerified: true
      },
      token: authToken
    });

  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).json({
      error: 'Internal server error during email verification'
    });
  }
});

// Request password reset endpoint
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        error: 'Email is required'
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Find user
    const userRecord = await db.select()
      .from(agents)
      .where(eq(agents.email, normalizedEmail))
      .limit(1);

    if (!userRecord || userRecord.length === 0) {
      // Don't reveal if user exists or not
      return res.json({
        message: 'If an account with that email exists, a password reset link has been sent.'
      });
    }

    const user = userRecord[0];

    // Generate reset token with normalized email
    const resetToken = generateResetToken(normalizedEmail);

    if (process.env.NODE_ENV !== 'production') {
      console.log('[DEV] Generated reset token for', normalizedEmail, '\n', resetToken);
    }

    // Store reset token in database
    try {
      await db.update(agents)
        .set({
          resetToken: resetToken,
          resetTokenExpires: new Date(Date.now() + 3600000) // 1 hour
        })
        .where(eq(agents.id, user.id));
    } catch (updateError) {
      console.error('Failed to store reset token:', updateError);
      return res.status(500).json({
        error: 'Failed to process password reset request'
      });
    }

    // Send reset email
    const emailResult = await emailService.sendPasswordResetEmail(normalizedEmail, resetToken);
    
    if (!emailResult.success) {
      console.error('Failed to send reset email:', emailResult.error);
    }

    res.json({
      message: 'If an account with that email exists, a password reset link has been sent.',
      emailSent: emailResult.success
    });

  } catch (error) {
    console.error('Password reset request error:', error);
    res.status(500).json({
      error: 'Internal server error during password reset request'
    });
  }
});

// Reset password endpoint
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({
        error: 'Reset token and new password are required'
      });
    }

    // Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (jwtError) {
      return res.status(400).json({
        error: 'Invalid or expired reset token'
      });
    }

    if (decoded.type !== 'reset') {
      return res.status(400).json({
        error: 'Invalid token type'
      });
    }

    const decodedEmail = (decoded.email || '').toLowerCase();

    // Find user with this reset token
    const userRecord = await db.select()
      .from(agents)
      .where(eq(agents.resetToken, token))
      .limit(1);

    if (!userRecord || userRecord.length === 0) {
      return res.status(400).json({
        error: 'Invalid reset token'
      });
    }

    const user = userRecord[0];

    if ((user.email || '').toLowerCase() !== decodedEmail) {
      return res.status(400).json({
        error: 'Invalid reset token'
      });
    }

    // Check if token is expired
    if (new Date() > new Date(user.resetTokenExpires)) {
      return res.status(400).json({
        error: 'Reset token has expired'
      });
    }

    // Hash new password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    // Update password and clear reset token
    try {
      await db.update(agents)
        .set({
          passwordHash: hashedPassword,
          resetToken: null,
          resetTokenExpires: null,
          updatedAt: new Date()
        })
        .where(eq(agents.id, user.id));
    } catch (updateError) {
      console.error('Failed to update password:', updateError);
      return res.status(500).json({
        error: 'Failed to reset password'
      });
    }

    res.json({
      message: 'Password reset successfully'
    });

  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({
      error: 'Internal server error during password reset'
    });
  }
});

// Test email endpoint
router.post('/test-email', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        error: 'Email is required'
      });
    }

    // Test SMTP connection
    const connectionTest = await emailService.testConnection();
    
    if (!connectionTest.success) {
      return res.status(500).json({
        error: 'SMTP connection failed',
        details: connectionTest.error
      });
    }

    // Send test email
    const result = await emailService.sendEmail({
      to: email,
      subject: 'Test Email from Backend API',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Email Test Successful!</h2>
          <p>This is a test email from your backend API using Hostinger SMTP.</p>
          <p>If you received this email, your email configuration is working correctly.</p>
          <div style="background-color: #f5f5f5; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <h3 style="color: #555;">Configuration Details:</h3>
            <ul>
              <li>SMTP Host: ${process.env.SMTP_HOST}</li>
              <li>SMTP Port: ${process.env.SMTP_PORT}</li>
              <li>From: ${process.env.EMAIL_FROM}</li>
            </ul>
          </div>
          <p>Timestamp: ${new Date().toISOString()}</p>
        </div>
      `,
      text: 'Email test successful! Your Hostinger SMTP configuration is working.'
    });

    res.json({
      message: 'Test email sent successfully',
      success: result.success,
      messageId: result.messageId,
      smtpConnection: connectionTest.success
    });

  } catch (error) {
    console.error('Test email error:', error);
    res.status(500).json({
      error: 'Failed to send test email',
      details: error.message
    });
  }
});

// Get current user endpoint
router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'No valid authorization token provided'
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      
      // Get user from database
      const userRecord = await db.select({
        id: agents.id,
        email: agents.email,
        name: agents.fullName,
        role: agents.role,
        emailVerified: agents.emailVerified
      })
      .from(agents)
      .where(eq(agents.id, decoded.userId))
      .limit(1);

      if (!userRecord || userRecord.length === 0) {
        return res.status(401).json({
          error: 'User not found'
        });
      }

      const user = userRecord[0];

      res.json({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          verified: user.emailVerified
        }
      });
    } catch (jwtError) {
      return res.status(401).json({
        error: 'Invalid or expired token'
      });
    }
  } catch (error) {
    console.error('Error in /me endpoint:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// GET /api/auth/agents - Get all verified agents
router.get('/agents', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'No valid authorization token provided'
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      
      // Verify user exists and is verified
      const currentUser = await db.select({
        id: agents.id,
        emailVerified: agents.emailVerified
      })
      .from(agents)
      .where(eq(agents.id, decoded.userId))
      .limit(1);

      if (!currentUser || currentUser.length === 0 || !currentUser[0].emailVerified) {
        return res.status(401).json({
          error: 'User not found or not verified'
        });
      }

      // Get all verified agents
      const verifiedAgents = await db.select({
        id: agents.id,
        name: agents.fullName,
        email: agents.email,
        role: agents.role,
        email_verified: agents.emailVerified,
        created_at: agents.createdAt
      })
      .from(agents)
      .where(eq(agents.emailVerified, true));

      res.json({ agents: verifiedAgents || [] });
    } catch (jwtError) {
      return res.status(401).json({
        error: 'Invalid or expired token'
      });
    }
  } catch (error) {
    console.error('Error in agents route:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Logout endpoint
router.post('/logout', async (req, res) => {
  try {
    // For JWT-based auth, logout is handled client-side by removing the token
    // This endpoint can be used for logging purposes or token blacklisting if needed
    res.json({
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      error: 'Internal server error during logout'
    });
  }
});

export default router;