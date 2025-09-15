import { verifyPassword, generateToken, createSession, logAuditEvent } from '../../../lib/auth';
import { supabase } from '../../../lib/supabase';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { agent_id, password } = req.body;

    // Validate required fields
    if (!agent_id || !password) {
      return res.status(400).json({ 
        error: 'Missing credentials',
        details: 'Agent ID and password are required'
      });
    }

    // Rate limiting check
    const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    if (!checkRateLimit(clientIp)) {
      return res.status(429).json({ 
        error: 'Too many login attempts',
        details: 'Please wait 15 minutes before trying again'
      });
    }

    // Find agent by agent_id
    const { data: agent, error: findError } = await supabase
      .from('agents')
      .select('id, agent_id, name, email, password_hash, role, is_active, failed_login_attempts, locked_until, last_login')
      .eq('agent_id', agent_id.trim())
      .single();

    if (findError || !agent) {
      // Log failed login attempt
      try {
        await logAuditEvent({
          agent_id: null,
          action: 'login_failed',
          details: {
            reason: 'invalid_agent_id',
            attempted_agent_id: agent_id,
            ip_address: clientIp
          }
        });
      } catch (auditError) {
        console.error('Failed to log audit event:', auditError);
      }

      return res.status(401).json({ 
        error: 'Invalid credentials',
        details: 'Agent ID or password is incorrect'
      });
    }

    // Check if agent is active
    if (!agent.is_active) {
      try {
        await logAuditEvent({
          agent_id: agent.id,
          action: 'login_failed',
          details: {
            reason: 'account_inactive',
            agent_id: agent_id,
            ip_address: clientIp
          }
        });
      } catch (auditError) {
        console.error('Failed to log audit event:', auditError);
      }

      return res.status(401).json({ 
        error: 'Account inactive',
        details: 'Your account has been deactivated. Please contact an administrator.'
      });
    }

    // Check if account is locked
    if (agent.locked_until && new Date(agent.locked_until) > new Date()) {
      const lockExpiry = new Date(agent.locked_until);
      try {
        await logAuditEvent({
          agent_id: agent.id,
          action: 'login_failed',
          details: {
            reason: 'account_locked',
            agent_id: agent_id,
            locked_until: agent.locked_until,
            ip_address: clientIp
          }
        });
      } catch (auditError) {
        console.error('Failed to log audit event:', auditError);
      }

      return res.status(423).json({ 
        error: 'Account locked',
        details: `Account is locked until ${lockExpiry.toLocaleString()}. Please try again later.`
      });
    }

    // Verify password
    const isValidPassword = await verifyPassword(password, agent.password_hash);
    
    if (!isValidPassword) {
      // Increment failed login attempts
      const newFailedAttempts = (agent.failed_login_attempts || 0) + 1;
      const maxAttempts = 5;
      let lockUntil = null;

      // Lock account after max attempts
      if (newFailedAttempts >= maxAttempts) {
        lockUntil = new Date(Date.now() + 30 * 60 * 1000); // Lock for 30 minutes
      }

      // Update failed attempts and lock status
      await supabase
        .from('agents')
        .update({
          failed_login_attempts: newFailedAttempts,
          locked_until: lockUntil?.toISOString() || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', agent.id);

      try {
        await logAuditEvent({
          agent_id: agent.id,
          action: 'login_failed',
          details: {
            reason: 'invalid_password',
            agent_id: agent_id,
            failed_attempts: newFailedAttempts,
            account_locked: lockUntil !== null,
            ip_address: clientIp
          }
        });
      } catch (auditError) {
        console.error('Failed to log audit event:', auditError);
      }

      if (lockUntil) {
        return res.status(423).json({ 
          error: 'Account locked',
          details: `Too many failed attempts. Account locked until ${lockUntil.toLocaleString()}.`
        });
      }

      return res.status(401).json({ 
        error: 'Invalid credentials',
        details: `Agent ID or password is incorrect. ${maxAttempts - newFailedAttempts} attempts remaining.`
      });
    }

    // Successful login - reset failed attempts and update last login
    await supabase
      .from('agents')
      .update({
        failed_login_attempts: 0,
        locked_until: null,
        last_login: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', agent.id);

    // Generate JWT token
    const token = generateToken({
      agentId: agent.id,
      agent_id: agent.agent_id,
      role: agent.role,
      email: agent.email
    });

    // Create session record
    const sessionData = await createSession({
      agent_id: agent.id,
      ip_address: clientIp,
      user_agent: req.headers['user-agent'] || 'Unknown'
    });

    // Log successful login
    try {
      await logAuditEvent({
        agent_id: agent.id,
        action: 'login_successful',
        details: {
          agent_id: agent.agent_id,
          session_id: sessionData.session_id,
          ip_address: clientIp,
          user_agent: req.headers['user-agent']
        }
      });
    } catch (auditError) {
      console.error('Failed to log audit event:', auditError);
    }

    // Set secure HTTP-only cookie
    const isProduction = process.env.NODE_ENV === 'production';
    res.setHeader('Set-Cookie', [
      `auth-token=${token}; HttpOnly; Path=/; ${isProduction ? 'Secure; ' : ''}SameSite=Strict; Max-Age=${7 * 24 * 60 * 60}`, // 7 days
      `session-id=${sessionData.session_id}; HttpOnly; Path=/; ${isProduction ? 'Secure; ' : ''}SameSite=Strict; Max-Age=${7 * 24 * 60 * 60}` // 7 days
    ]);

    // Return success response
    res.status(200).json({
      success: true,
      message: 'Login successful',
      agent: {
        id: agent.id,
        agent_id: agent.agent_id,
        name: agent.name,
        email: agent.email,
        role: agent.role,
        last_login: new Date().toISOString()
      },
      session: {
        id: sessionData.session_id,
        expires_at: sessionData.expires_at
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    
    res.status(500).json({
      error: 'Internal server error',
      details: 'Login failed due to an unexpected error'
    });
  }
}

// Rate limiting for login attempts
const loginAttempts = new Map();
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
const MAX_LOGIN_ATTEMPTS = 10;

function checkRateLimit(ip) {
  const now = Date.now();
  const attempts = loginAttempts.get(ip) || [];
  
  // Remove old attempts outside the window
  const recentAttempts = attempts.filter(timestamp => now - timestamp < RATE_LIMIT_WINDOW);
  
  if (recentAttempts.length >= MAX_LOGIN_ATTEMPTS) {
    return false; // Rate limited
  }
  
  // Add current attempt
  recentAttempts.push(now);
  loginAttempts.set(ip, recentAttempts);
  
  return true; // Allowed
}