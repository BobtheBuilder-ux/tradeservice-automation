import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { createClient } from '@supabase/supabase-js';
import emailService from '../services/email-service.js';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Middleware to verify admin access
const verifyAdmin = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'No valid authorization token provided'
      });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Get user from database to verify admin role
    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, role, email_verified')
      .eq('id', decoded.userId)
      .single();

    if (error || !user || !user.email_verified) {
      return res.status(401).json({
        error: 'User not found or not verified'
      });
    }

    if (user.role !== 'admin') {
      return res.status(403).json({
        error: 'Admin access required'
      });
    }

    req.user = user;
    next();
  } catch (jwtError) {
    return res.status(401).json({
      error: 'Invalid or expired token'
    });
  }
};

// Generate random password for new agents
const generateRandomPassword = () => {
  return Math.random().toString(36).slice(-12) + Math.random().toString(36).slice(-12);
};

// Generate password reset token
const generateResetToken = (email) => {
  return jwt.sign(
    { type: 'reset', email, timestamp: Date.now() },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
};

// AGENT MANAGEMENT ENDPOINTS

// Get all agents
router.get('/agents', verifyAdmin, async (req, res) => {
  try {
    const { data: agents, error } = await supabase
      .from('users')
      .select('id, name, email, role, email_verified, created_at, last_login')
      .in('role', ['agent', 'admin'])
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ success: true, agents });
  } catch (error) {
    console.error('Error fetching agents:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch agents' });
  }
});

// Create new agent
router.post('/agents', verifyAdmin, async (req, res) => {
  try {
    const { name, email, role = 'agent' } = req.body;

    // Validate input
    if (!name || !email) {
      return res.status(400).json({
        error: 'Name and email are required'
      });
    }

    if (!['agent', 'admin'].includes(role)) {
      return res.status(400).json({
        error: 'Invalid role. Must be agent or admin'
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
        error: 'User with this email already exists'
      });
    }

    // Generate temporary password and reset token
    const tempPassword = generateRandomPassword();
    const hashedPassword = await bcrypt.hash(tempPassword, 12);
    const resetToken = generateResetToken(email);

    // Create user with reset token
    const { data: newAgent, error: createError } = await supabase
      .from('users')
      .insert({
        name,
        email,
        password_hash: hashedPassword,
        role,
        email_verified: true, // Auto-verify admin-created accounts
        reset_token: resetToken,
        reset_token_expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
        temp_password_expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (createError) {
      console.error('Error creating agent:', createError);
      return res.status(500).json({
        error: 'Failed to create agent'
      });
    }

    // Send credentials email
    try {
      const emailResult = await emailService.sendAgentCredentialsEmail(
        email,
        name,
        tempPassword,
        resetToken
      );

      if (!emailResult.success) {
        console.error('Failed to send credentials email:', emailResult.error);
        // Don't fail the creation if email fails, just log it
      }

      res.status(201).json({
        message: 'Agent created successfully and credentials sent via email',
        agent: {
          id: newAgent.id,
          name: newAgent.name,
          email: newAgent.email,
          role: newAgent.role
        },
        emailSent: emailResult.success
      });
    } catch (emailError) {
      console.error('Error sending credentials email:', emailError);
      
      // Still return success for agent creation
      res.status(201).json({
        message: 'Agent created successfully, but failed to send credentials email',
        agent: {
          id: newAgent.id,
          name: newAgent.name,
          email: newAgent.email,
          role: newAgent.role
        },
        emailSent: false,
        emailError: 'Failed to send credentials email'
      });
    }
  } catch (error) {
    console.error('Error in create agent route:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete agent
router.delete('/agents/:agentId', verifyAdmin, async (req, res) => {
  try {
    const { agentId } = req.params;

    // Prevent admin from deleting themselves
    if (req.user.id === agentId) {
      return res.status(400).json({
        error: 'Cannot delete your own account'
      });
    }

    // Check if agent exists
    const { data: agent, error: fetchError } = await supabase
      .from('users')
      .select('id, role')
      .eq('id', agentId)
      .single();

    if (fetchError || !agent) {
      return res.status(404).json({
        error: 'Agent not found'
      });
    }

    // Unassign all leads from this agent before deletion
    await supabase
      .from('leads')
      .update({ assigned_agent_id: null })
      .eq('assigned_agent_id', agentId);

    // Delete the agent
    const { error: deleteError } = await supabase
      .from('users')
      .delete()
      .eq('id', agentId);

    if (deleteError) {
      console.error('Error deleting agent:', deleteError);
      return res.status(500).json({
        error: 'Failed to delete agent'
      });
    }

    res.json({ message: 'Agent deleted successfully' });
  } catch (error) {
    console.error('Error in delete agent route:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// LEAD MANAGEMENT ENDPOINTS

// Get all leads with assignment info
router.get('/leads', verifyAdmin, async (req, res) => {
  try {
    const { data: leads, error } = await supabase
      .from('leads')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching leads:', error);
      return res.status(500).json({ error: 'Failed to fetch leads' });
    }

    res.json({ leads: leads || [] });
  } catch (error) {
    console.error('Error in get leads route:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Assign leads to agent
router.post('/assign-leads', verifyAdmin, async (req, res) => {
  try {
    const { agentId, leadIds } = req.body;

    if (!agentId || !leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
      return res.status(400).json({
        error: 'Agent ID and lead IDs array are required'
      });
    }

    // Verify agent exists
    const { data: agent, error: agentError } = await supabase
      .from('users')
      .select('id')
      .eq('id', agentId)
      .in('role', ['agent', 'admin'])
      .single();

    if (agentError || !agent) {
      return res.status(404).json({
        error: 'Agent not found'
      });
    }

    // Update leads with agent assignment
    const { data: updatedLeads, error: updateError } = await supabase
      .from('leads')
      .update({ 
        assigned_agent_id: agentId,
        updated_at: new Date().toISOString()
      })
      .in('id', leadIds)
      .select();

    if (updateError) {
      console.error('Error assigning leads:', updateError);
      return res.status(500).json({
        error: 'Failed to assign leads'
      });
    }

    res.json({
      message: `Successfully assigned ${updatedLeads.length} leads to agent`,
      assignedLeads: updatedLeads.length
    });
  } catch (error) {
    console.error('Error in assign leads route:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Remove lead assignments
router.post('/unassign-leads', verifyAdmin, async (req, res) => {
  try {
    const { leadIds } = req.body;

    if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
      return res.status(400).json({
        error: 'Lead IDs array is required'
      });
    }

    // Update leads to remove agent assignment
    const { data: updatedLeads, error: updateError } = await supabase
      .from('leads')
      .update({ 
        assigned_agent_id: null,
        updated_at: new Date().toISOString()
      })
      .in('id', leadIds)
      .select();

    if (updateError) {
      console.error('Error unassigning leads:', updateError);
      return res.status(500).json({
        error: 'Failed to unassign leads'
      });
    }

    res.json({
      message: `Successfully unassigned ${updatedLeads.length} leads`,
      unassignedLeads: updatedLeads.length
    });
  } catch (error) {
    console.error('Error in unassign leads route:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// CAMPAIGN MANAGEMENT ENDPOINTS

// Get campaign stats and data
router.get('/campaigns', verifyAdmin, async (req, res) => {
  try {
    // For now, return mock data since Facebook integration isn't implemented
    // In production, this would fetch from Facebook Ads API
    const mockCampaigns = [];
    const mockStats = {
      active: 0,
      paused: 0,
      totalSpend: 0,
      totalLeads: 0
    };

    res.json({
      campaigns: mockCampaigns,
      stats: mockStats
    });
  } catch (error) {
    console.error('Error in get campaigns route:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DASHBOARD STATS ENDPOINT

// Get admin dashboard statistics
router.get('/stats', verifyAdmin, async (req, res) => {
  try {
    // Get agent count
    const { count: agentCount, error: agentError } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .in('role', ['agent', 'admin']);

    // Get lead count
    const { count: leadCount, error: leadError } = await supabase
      .from('leads')
      .select('*', { count: 'exact', head: true });

    // Get unassigned lead count
    const { count: unassignedCount, error: unassignedError } = await supabase
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .is('assigned_agent_id', null);

    if (agentError || leadError || unassignedError) {
      console.error('Error fetching stats:', { agentError, leadError, unassignedError });
      return res.status(500).json({ error: 'Failed to fetch statistics' });
    }

    res.json({
      stats: {
        totalAgents: agentCount || 0,
        totalLeads: leadCount || 0,
        unassignedLeads: unassignedCount || 0,
        activeCampaigns: 0 // Mock data for now
      }
    });
  } catch (error) {
    console.error('Error in get stats route:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;