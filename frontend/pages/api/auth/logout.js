import { verifyToken, logAuditEvent } from '../../../lib/auth';
import { supabase } from '../../../lib/supabase';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get token from cookie or Authorization header
    const token = req.cookies['auth-token'] || 
                 (req.headers.authorization && req.headers.authorization.replace('Bearer ', ''));
    
    const sessionId = req.cookies['session-id'];

    if (!token) {
      return res.status(401).json({ 
        error: 'No authentication token provided'
      });
    }

    // Verify and decode token
    const decoded = verifyToken(token);
    if (!decoded) {
      return res.status(401).json({ 
        error: 'Invalid or expired token'
      });
    }

    const agentId = decoded.agentId;
    const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

    // Invalidate session if session ID is provided
    if (sessionId) {
      try {
        await supabase
          .from('agent_sessions')
          .update({
            is_active: false,
            ended_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('session_id', sessionId)
          .eq('agent_id', agentId);
      } catch (sessionError) {
        console.error('Error invalidating session:', sessionError);
        // Don't fail logout if session invalidation fails
      }
    }

    // Log logout event
    try {
      await logAuditEvent({
        agent_id: agentId,
        action: 'logout',
        details: {
          session_id: sessionId,
          ip_address: clientIp,
          user_agent: req.headers['user-agent'],
          logout_type: 'manual'
        }
      });
    } catch (auditError) {
      console.error('Failed to log logout audit event:', auditError);
      // Don't fail logout if audit logging fails
    }

    // Clear authentication cookies
    const isProduction = process.env.NODE_ENV === 'production';
    res.setHeader('Set-Cookie', [
      `auth-token=; HttpOnly; Path=/; ${isProduction ? 'Secure; ' : ''}SameSite=Strict; Max-Age=0`,
      `session-id=; HttpOnly; Path=/; ${isProduction ? 'Secure; ' : ''}SameSite=Strict; Max-Age=0`
    ]);

    res.status(200).json({
      success: true,
      message: 'Logout successful'
    });

  } catch (error) {
    console.error('Logout error:', error);
    
    // Even if there's an error, clear the cookies for security
    const isProduction = process.env.NODE_ENV === 'production';
    res.setHeader('Set-Cookie', [
      `auth-token=; HttpOnly; Path=/; ${isProduction ? 'Secure; ' : ''}SameSite=Strict; Max-Age=0`,
      `session-id=; HttpOnly; Path=/; ${isProduction ? 'Secure; ' : ''}SameSite=Strict; Max-Age=0`
    ]);
    
    res.status(500).json({
      error: 'Internal server error',
      details: 'Logout completed but with errors'
    });
  }
}