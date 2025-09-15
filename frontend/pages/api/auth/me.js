import { verifyToken, validatePermissions } from '../../../lib/auth';
import { supabase } from '../../../lib/supabase';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get token from cookie or Authorization header
    const token = req.cookies['auth-token'] || 
                 (req.headers.authorization && req.headers.authorization.replace('Bearer ', ''));
    
    const sessionId = req.cookies['session-id'];

    if (!token) {
      return res.status(401).json({ 
        error: 'No authentication token provided',
        authenticated: false
      });
    }

    // Verify and decode token
    const decoded = verifyToken(token);
    if (!decoded) {
      return res.status(401).json({ 
        error: 'Invalid or expired token',
        authenticated: false
      });
    }

    const agentId = decoded.agentId;

    // Get current user data from database
    const { data: agent, error: agentError } = await supabase
      .from('users')
      .select('id, name, email, role, email_verified, last_login, created_at')
      .eq('id', agentId)
      .single();

    if (agentError || !agent) {
      return res.status(401).json({ 
        error: 'Agent not found',
        authenticated: false
      });
    }

    // Check if user is still verified
    if (!agent.email_verified) {
      return res.status(401).json({ 
        error: 'Account deactivated',
        authenticated: false
      });
    }

    // Verify session if session ID is provided
    if (sessionId) {
      const { data: session, error: sessionError } = await supabase
        .from('agent_sessions')
        .select('id, session_id, expires_at, is_active')
        .eq('session_id', sessionId)
        .eq('agent_id', agentId)
        .eq('is_active', true)
        .single();

      if (sessionError || !session) {
        return res.status(401).json({ 
          error: 'Invalid session',
          authenticated: false
        });
      }

      // Check if session has expired
      if (new Date(session.expires_at) < new Date()) {
        // Mark session as expired
        await supabase
          .from('agent_sessions')
          .update({
            is_active: false,
            ended_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', session.id);

        return res.status(401).json({ 
          error: 'Session expired',
          authenticated: false
        });
      }

      // Update session last activity
      await supabase
        .from('agent_sessions')
        .update({
          last_activity: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', session.id);
    }

    // Get agent permissions based on role
    const permissions = getPermissionsByRole(agent.role);

    // Return authenticated user data
    res.status(200).json({
      authenticated: true,
      agent: {
        id: agent.id,
        name: agent.name,
        email: agent.email,
        role: agent.role,
        email_verified: agent.email_verified,
        last_login: agent.last_login,
        created_at: agent.created_at
      },
      permissions,
      session: {
        id: sessionId,
        valid: true
      }
    });

  } catch (error) {
    console.error('Authentication verification error:', error);
    
    res.status(500).json({
      error: 'Internal server error',
      authenticated: false
    });
  }
}

// Helper function to get permissions based on role
function getPermissionsByRole(role) {
  const basePermissions = {
    view_own_leads: true,
    edit_own_leads: true,
    view_own_profile: true,
    edit_own_profile: true
  };

  switch (role) {
    case 'super_agent':
      return {
        ...basePermissions,
        view_all_leads: true,
        view_all_agents: true,
        view_agent_activity: true,
        export_data: true,
        view_analytics: true
      };
    
    case 'admin':
      return {
        ...basePermissions,
        view_all_leads: true,
        edit_all_leads: true,
        delete_leads: true,
        view_all_agents: true,
        edit_all_agents: true,
        delete_agents: true,
        view_agent_activity: true,
        manage_permissions: true,
        export_data: true,
        view_analytics: true,
        system_settings: true
      };
    
    case 'agent':
    default:
      return basePermissions;
  }
}