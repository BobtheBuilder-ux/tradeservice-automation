import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import emailService from '../services/email-service.js';
import dotenv from 'dotenv';
import { authLimiter, registerLimiter, verifyEmailLimiter, passwordResetLimiter } from '../middleware/rateLimiter.js';
import { validateRegistration, validateLogin, validateEmailVerification } from '../middleware/validation.js';

dotenv.config();

const router = express.Router();

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();

    if (existingUser) {
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
    const { data: newUser, error: dbError } = await supabase
      .from('users')
      .insert({
        email,
        password_hash: hashedPassword,
        name,
        role,
        email_verified: false,
        verification_token: verificationToken,
        agent_token: agentToken,
        agent_token_expires: agentTokenExpires.toISOString(),
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (dbError) {
      console.error('Database error:', dbError);
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
    const token = generateToken(newUser.id, email, role);

    res.status(201).json({
      message: 'User registered successfully. Please check your email to verify your account.',
      user: {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
        role: newUser.role,
        emailVerified: newUser.email_verified
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
    const { data: user, error: dbError } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (dbError || !user) {
      return res.status(401).json({
        error: 'Invalid email or password'
      });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    
    if (!isValidPassword) {
      return res.status(401).json({
        error: 'Invalid email or password'
      });
    }

    // Update last login
    await supabase
      .from('users')
      .update({ last_login: new Date().toISOString() })
      .eq('id', user.id);

    // Generate JWT token
    const token = generateToken(user.id, user.email, user.role);

    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        emailVerified: user.email_verified
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
    const { data: user, error: dbError } = await supabase
      .from('users')
      .select('*')
      .eq('verification_token', token)
      .eq('agent_token', agentToken)
      .single();

    if (dbError || !user) {
      return res.status(400).json({
        error: 'Invalid verification tokens'
      });
    }

    if (user.email_verified) {
      return res.status(400).json({
        error: 'Email already verified'
      });
    }

    // Check if agent token has expired
    const now = new Date();
    const tokenExpiry = new Date(user.agent_token_expires);
    if (now > tokenExpiry) {
      return res.status(400).json({
        error: 'Agent token has expired. Please register again.'
      });
    }

    // Update user as verified
    const { error: updateError } = await supabase
      .from('users')
      .update({
        email_verified: true,
        verification_token: null,
        agent_token: null,
        agent_token_expires: null,
        verified_at: new Date().toISOString()
      })
      .eq('id', user.id);

    if (updateError) {
      console.error('Failed to update user verification:', updateError);
      return res.status(500).json({
        error: 'Failed to verify email'
      });
    }

    // Send welcome email
    await emailService.sendWelcomeEmail(user.email, user.name);

    // Generate new JWT token for the verified user
    const authToken = generateToken(user.id, user.email, user.role);

    res.json({
      message: 'Email verified successfully',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
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

    // Find user
    const { data: user, error: dbError } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (dbError || !user) {
      // Don't reveal if user exists or not
      return res.json({
        message: 'If an account with that email exists, a password reset link has been sent.'
      });
    }

    // Generate reset token
    const resetToken = generateResetToken(email);

    // Store reset token in database
    const { error: updateError } = await supabase
      .from('users')
      .update({
        reset_token: resetToken,
        reset_token_expires: new Date(Date.now() + 3600000).toISOString() // 1 hour
      })
      .eq('id', user.id);

    if (updateError) {
      console.error('Failed to store reset token:', updateError);
      return res.status(500).json({
        error: 'Failed to process password reset request'
      });
    }

    // Send reset email
    const emailResult = await emailService.sendPasswordResetEmail(email, resetToken);
    
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

    // Find user with this reset token
    const { data: user, error: dbError } = await supabase
      .from('users')
      .select('*')
      .eq('reset_token', token)
      .eq('email', decoded.email)
      .single();

    if (dbError || !user) {
      return res.status(400).json({
        error: 'Invalid reset token'
      });
    }

    // Check if token is expired
    if (new Date() > new Date(user.reset_token_expires)) {
      return res.status(400).json({
        error: 'Reset token has expired'
      });
    }

    // Hash new password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    // Update password and clear reset token
    const { error: updateError } = await supabase
      .from('users')
      .update({
        password_hash: hashedPassword,
        reset_token: null,
        reset_token_expires: null,
        password_updated_at: new Date().toISOString()
      })
      .eq('id', user.id);

    if (updateError) {
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
      const { data: user, error } = await supabase
        .from('users')
        .select('id, email, name, role, email_verified')
        .eq('id', decoded.userId)
        .single();

      if (error || !user) {
        return res.status(401).json({
          error: 'User not found'
        });
      }

      res.json({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          verified: user.email_verified
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
      const { data: currentUser, error: userError } = await supabase
        .from('users')
        .select('id, email_verified')
        .eq('id', decoded.userId)
        .single();

      if (userError || !currentUser || !currentUser.email_verified) {
        return res.status(401).json({
          error: 'User not found or not verified'
        });
      }

      // Get all verified agents
      const { data: agents, error } = await supabase
        .from('users')
        .select('id, name, email, role, email_verified, created_at')
        .eq('email_verified', true)
        .order('name');

      if (error) {
        console.error('Error fetching agents:', error);
        return res.status(500).json({ error: 'Failed to fetch agents' });
      }

      res.json({ agents: agents || [] });
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

export default router;