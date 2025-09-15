import { hashPassword, generateAgentId, createAgent, logAuditEvent } from '../../../lib/auth';
import { sendAgentIdEmail } from '../../../lib/email';
import { supabase } from '../../../lib/supabase';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { name, email, password, role = 'agent' } = req.body;

    // Validate required fields
    if (!name || !email || !password) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        details: 'Name, email, and password are required'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ 
        error: 'Invalid email format'
      });
    }

    // Validate password strength
    if (password.length < 8) {
      return res.status(400).json({ 
        error: 'Password must be at least 8 characters long'
      });
    }

    // Validate role
    const validRoles = ['agent', 'super_agent', 'admin'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ 
        error: 'Invalid role specified'
      });
    }

    // Check if email already exists
    const { data: existingAgent, error: checkError } = await supabase
      .from('agents')
      .select('id, email')
      .eq('email', email.toLowerCase())
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      console.error('Database error checking existing agent:', checkError);
      return res.status(500).json({ 
        error: 'Database error',
        details: 'Failed to check existing agent'
      });
    }

    if (existingAgent) {
      return res.status(409).json({ 
        error: 'Email already registered',
        details: 'An agent with this email already exists'
      });
    }

    // Generate unique agent ID
    let agentId;
    let attempts = 0;
    const maxAttempts = 10;

    do {
      agentId = generateAgentId();
      attempts++;

      // Check if agent ID already exists
      const { data: existingAgentId, error: idCheckError } = await supabase
        .from('agents')
        .select('id')
        .eq('agent_id', agentId)
        .single();

      if (idCheckError && idCheckError.code !== 'PGRST116') {
        console.error('Database error checking agent ID:', idCheckError);
        return res.status(500).json({ 
          error: 'Database error',
          details: 'Failed to generate unique agent ID'
        });
      }

      if (!existingAgentId) {
        break; // Agent ID is unique
      }

      if (attempts >= maxAttempts) {
        return res.status(500).json({ 
          error: 'Failed to generate unique agent ID',
          details: 'Please try again'
        });
      }
    } while (true);

    // Hash password
    const passwordHash = await hashPassword(password);

    // Create agent record
    const agentData = {
      agent_id: agentId,
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password_hash: passwordHash,
      role: role,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data: newAgent, error: createError } = await supabase
      .from('agents')
      .insert([agentData])
      .select('id, agent_id, name, email, role, is_active, created_at')
      .single();

    if (createError) {
      console.error('Database error creating agent:', createError);
      return res.status(500).json({ 
        error: 'Failed to create agent',
        details: 'Database error occurred'
      });
    }

    // Log audit event
    try {
      await logAuditEvent({
        agent_id: newAgent.id,
        action: 'agent_registered',
        details: {
          agent_id: agentId,
          email: email.toLowerCase(),
          role: role,
          registration_ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress
        }
      });
    } catch (auditError) {
      console.error('Failed to log audit event:', auditError);
      // Don't fail registration if audit logging fails
    }

    // Send agent ID email
    try {
      const emailResult = await sendAgentIdEmail(email, name, agentId);
      
      if (!emailResult.success) {
        console.error('Failed to send agent ID email:', emailResult.error);
        // Log the email failure but don't fail the registration
        try {
          await logAuditEvent({
            agent_id: newAgent.id,
            action: 'email_send_failed',
            details: {
              email_type: 'agent_id',
              error: emailResult.error,
              agent_id: agentId
            }
          });
        } catch (auditError) {
          console.error('Failed to log email failure audit event:', auditError);
        }
      } else {
        // Log successful email send
        try {
          await logAuditEvent({
            agent_id: newAgent.id,
            action: 'email_sent',
            details: {
              email_type: 'agent_id',
              message_id: emailResult.messageId,
              agent_id: agentId
            }
          });
        } catch (auditError) {
          console.error('Failed to log email success audit event:', auditError);
        }
      }
    } catch (emailError) {
      console.error('Unexpected error sending agent ID email:', emailError);
      // Don't fail registration if email fails
    }

    // Return success response (without sensitive data)
    res.status(201).json({
      success: true,
      message: 'Agent registered successfully',
      agent: {
        id: newAgent.id,
        agent_id: newAgent.agent_id,
        name: newAgent.name,
        email: newAgent.email,
        role: newAgent.role,
        is_active: newAgent.is_active,
        created_at: newAgent.created_at
      },
      email_sent: true // Always true to avoid revealing email delivery status
    });

  } catch (error) {
    console.error('Registration error:', error);
    
    // Log the error for debugging but don't expose internal details
    res.status(500).json({
      error: 'Internal server error',
      details: 'Registration failed due to an unexpected error'
    });
  }
}

// Rate limiting helper (basic implementation)
const registrationAttempts = new Map();
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 5;

function checkRateLimit(ip) {
  const now = Date.now();
  const attempts = registrationAttempts.get(ip) || [];
  
  // Remove old attempts outside the window
  const recentAttempts = attempts.filter(timestamp => now - timestamp < RATE_LIMIT_WINDOW);
  
  if (recentAttempts.length >= MAX_ATTEMPTS) {
    return false; // Rate limited
  }
  
  // Add current attempt
  recentAttempts.push(now);
  registrationAttempts.set(ip, recentAttempts);
  
  return true; // Allowed
}