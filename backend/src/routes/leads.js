import express from 'express';
import { db } from '../config/index.js';
import { leads, agents } from '../db/schema.js';
import { eq, desc, isNull, and } from 'drizzle-orm';
import jwt from 'jsonwebtoken';

const router = express.Router();

// Middleware to verify JWT token
const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get user from database
    const user = await db.select({
      id: agents.id,
      agentId: agents.agentId,
      email: agents.email,
      firstName: agents.firstName,
      lastName: agents.lastName,
      role: agents.role,
      emailVerified: agents.emailVerified
    })
    .from(agents)
    .where(eq(agents.id, decoded.userId))
    .limit(1);

    if (!user || user.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }

    if (!user[0].emailVerified) {
      return res.status(401).json({ error: 'Email not verified' });
    }

    req.user = user[0];
    next();
  } catch (error) {
    console.error('Token verification failed:', error);
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// GET /api/leads - Get leads based on user role
router.get('/', verifyToken, async (req, res) => {
  try {
    let leadsData;
    
    if (req.user.role === 'admin') {
      // Admins can see all leads
      leadsData = await db.select()
        .from(leads)
        .orderBy(desc(leads.createdAt));
    } else {
      // Agents can only see leads assigned to them
      leadsData = await db.select()
        .from(leads)
        .where(eq(leads.assignedAgentId, req.user.id))
        .orderBy(desc(leads.createdAt));
    }

    res.json({ leads: leadsData || [] });
  } catch (error) {
    console.error('Error in leads route:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/leads/unassigned - Get unassigned leads (admin only)
router.get('/unassigned', verifyToken, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const unassignedLeads = await db.select({
      id: leads.id,
      email: leads.email,
      firstName: leads.firstName,
      lastName: leads.lastName,
      fullName: leads.fullName,
      phone: leads.phone,
      source: leads.source,
      status: leads.status,
      priority: leads.priority,
      createdAt: leads.createdAt
    })
    .from(leads)
    .where(isNull(leads.assignedAgentId))
    .orderBy(desc(leads.createdAt));

    res.json({ leads: unassignedLeads || [] });
  } catch (error) {
    console.error('Error fetching unassigned leads:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/leads/agents/available - Get available agents (admin only)
router.get('/agents/available', verifyToken, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const availableAgents = await db.select({
      id: agents.id,
      agentId: agents.agentId,
      email: agents.email,
      firstName: agents.firstName,
      lastName: agents.lastName,
      fullName: agents.fullName,
      role: agents.role,
      isActive: agents.isActive,
      lastLogin: agents.lastLogin
    })
    .from(agents)
    .where(and(
      eq(agents.isActive, true),
      eq(agents.emailVerified, true),
      eq(agents.role, 'agent')
    ))
    .orderBy(agents.firstName, agents.lastName);

    res.json({ agents: availableAgents || [] });
  } catch (error) {
    console.error('Error fetching available agents:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/leads/:leadId/assign - Assign lead to agent (admin only)
router.post('/:leadId/assign', verifyToken, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { leadId } = req.params;
    const { agentId } = req.body;

    if (!agentId) {
      return res.status(400).json({ error: 'Agent ID is required' });
    }

    // Verify the lead exists
    const existingLead = await db.select({ id: leads.id })
      .from(leads)
      .where(eq(leads.id, leadId))
      .limit(1);

    if (!existingLead || existingLead.length === 0) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    // Verify the agent exists and is active
    const agent = await db.select({ 
      id: agents.id, 
      firstName: agents.firstName, 
      lastName: agents.lastName,
      fullName: agents.fullName,
      isActive: agents.isActive 
    })
      .from(agents)
      .where(eq(agents.id, agentId))
      .limit(1);

    if (!agent || agent.length === 0) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    if (!agent[0].isActive) {
      return res.status(400).json({ error: 'Agent is not active' });
    }

    // Update the lead assignment
    const updatedLead = await db.update(leads)
      .set({
        assignedAgentId: agentId,
        lastUpdatedBy: req.user.id,
        status: 'assigned',
        updatedAt: new Date()
      })
      .where(eq(leads.id, leadId))
      .returning({
        id: leads.id,
        email: leads.email,
        firstName: leads.firstName,
        lastName: leads.lastName,
        fullName: leads.fullName,
        assignedAgentId: leads.assignedAgentId,
        status: leads.status,
        updatedAt: leads.updatedAt
      });

    if (!updatedLead || updatedLead.length === 0) {
      return res.status(500).json({ error: 'Failed to assign lead' });
    }

    res.json({ 
      message: 'Lead assigned successfully',
      lead: updatedLead[0],
      assignedAgent: {
        id: agent[0].id,
        name: agent[0].fullName || `${agent[0].firstName} ${agent[0].lastName}`.trim()
      }
    });
  } catch (error) {
    console.error('Error assigning lead:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;