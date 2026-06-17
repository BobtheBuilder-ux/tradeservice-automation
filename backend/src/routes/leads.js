import express from 'express';
import { db } from '../config/index.js';
import { leads, agents, agentIntegrations } from '../db/schema.js';
import { eq, isNull, and, count } from 'drizzle-orm';
import leadAutomationService from '../services/lead-automation-service.js';
import bobOrchestrator from '../services/bob-orchestrator.js';
import { authenticateToken } from '../middleware/auth.js';
import insforgeDataService from '../services/insforge-data-service.js';

const router = express.Router();
const verifyToken = authenticateToken;

// GET /api/leads - Get leads based on user role
router.get('/', verifyToken, async (req, res) => {
  try {
    const leadsData = await insforgeDataService.listLeadsForUser(req.user);
    res.json({ leads: leadsData || [] });
  } catch (error) {
    console.error('Error in leads route:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/leads/:leadId/qualification - Update qualification and scheduling fields
router.patch('/:leadId/qualification', verifyToken, async (req, res) => {
  try {
    const { leadId } = req.params;

    const lead = await insforgeDataService.getLeadById(leadId);

    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    if (req.user.role !== 'admin' && lead.assignedAgentId !== req.user.id) {
      return res.status(403).json({ error: 'You can only update leads assigned to you' });
    }

    const allowedFields = [
      'qualificationStatus',
      'qualificationScore',
      'leadStage',
      'schedulingState',
      'preferredContactChannel',
      'preferredMeetingWindow',
      'serviceInterest',
      'timeline',
      'budgetRange',
      'locationSummary',
      'qualificationNotes',
      'nextContactAt',
      'requiresHumanReview',
      'escalationReason',
      'automationPaused'
    ];

    const patch = {};
    for (const field of allowedFields) {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        patch[field] = req.body[field];
      }
    }

    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: 'No valid qualification fields were provided' });
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'qualificationStatus')) {
      patch.lastQualifiedAt = new Date();
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'nextContactAt') && patch.nextContactAt) {
      patch.nextContactAt = new Date(patch.nextContactAt);
    }

    patch.lastUpdatedBy = req.user.id;
    patch.updatedAt = new Date();

    const updatedLead = await insforgeDataService.updateLead(leadId, patch);

    if (updatedLead) {
      await bobOrchestrator.syncLead(updatedLead);
    }

    res.json({
      message: 'Lead qualification updated successfully',
      lead: updatedLead
    });
  } catch (error) {
    console.error('Error updating lead qualification:', error);
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

    const unassignedLeads = await insforgeDataService.listUnassignedLeads();

    res.json({ leads: unassignedLeads || [] });
  } catch (error) {
    console.error('Error fetching unassigned leads:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/leads - Create a new lead
router.post('/', verifyToken, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { email, firstName, lastName, phone, source = 'manual', priority = 'medium' } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Check if lead with this email already exists
    const normalizedEmail = email.trim().toLowerCase();
    const existingLead = await insforgeDataService.getLeadByEmail(normalizedEmail);

    if (existingLead) {
      return res.status(409).json({ error: 'Lead with this email already exists' });
    }

    // Create the new lead
    const newLead = await insforgeDataService.createLead({
      email: normalizedEmail,
      firstName: firstName || null,
      lastName: lastName || null,
      phone: phone || null,
      source,
      priority,
      status: 'new',
      lastUpdatedBy: req.user.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    if (!newLead) {
      return res.status(500).json({ error: 'Failed to create lead' });
    }

    console.log('New lead created:', {
      id: newLead.id,
      email: newLead.email,
      name: `${newLead.firstName || ''} ${newLead.lastName || ''}`.trim()
    });

    res.status(201).json({ 
      message: 'Lead created successfully',
      lead: newLead
    });
  } catch (error) {
    console.error('Error creating lead:', error);
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

    const availableAgents = await insforgeDataService.listAvailableAgents();

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

// POST /api/leads/auto-assign - Automatically assign lead to agent with lowest lead count
router.post('/auto-assign', verifyToken, async (req, res) => {
  try {
    // Check if user is admin or system (for automated workflows)
    if (req.user.role !== 'admin' && req.user.role !== 'system') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { leadId } = req.body;

    if (!leadId) {
      return res.status(400).json({ error: 'Lead ID is required' });
    }

    // Verify the lead exists and is not already assigned
    const existingLead = await db.select({ 
      id: leads.id, 
      assignedAgentId: leads.assignedAgentId,
      email: leads.email,
      firstName: leads.firstName,
      lastName: leads.lastName
    })
      .from(leads)
      .where(eq(leads.id, leadId))
      .limit(1);

    if (!existingLead || existingLead.length === 0) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    if (existingLead[0].assignedAgentId) {
      return res.status(400).json({ 
        error: 'Lead is already assigned',
        assignedAgentId: existingLead[0].assignedAgentId
      });
    }

    // Get all active agents with their current lead counts
    const agentsWithLeadCounts = await db.select({
      id: agents.id,
      agentId: agents.agentId,
      firstName: agents.firstName,
      lastName: agents.lastName,
      fullName: agents.fullName,
      email: agents.email,
      leadCount: count(leads.id)
    })
    .from(agents)
    .leftJoin(leads, and(
      eq(leads.assignedAgentId, agents.id),
      isNull(leads.canceledAt) // Only count active leads
    ))
    .where(and(
      eq(agents.isActive, true),
      eq(agents.emailVerified, true),
      eq(agents.role, 'agent')
    ))
    .groupBy(agents.id, agents.agentId, agents.firstName, agents.lastName, agents.fullName, agents.email)
    .orderBy(count(leads.id), agents.firstName); // Order by lead count (ascending), then by name

    if (!agentsWithLeadCounts || agentsWithLeadCounts.length === 0) {
      return res.status(404).json({ error: 'No available agents found' });
    }

    // Select the agent with the lowest lead count (first in the ordered list)
    const selectedAgent = agentsWithLeadCounts[0];

    console.log(`🎯 AUTO-ASSIGN: Selecting agent ${selectedAgent.fullName || selectedAgent.firstName} with ${selectedAgent.leadCount} current leads`);

    // Update the lead assignment
    const updatedLead = await db.update(leads)
      .set({
        assignedAgentId: selectedAgent.id,
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

    console.log(`✅ AUTO-ASSIGN: Lead ${leadId} assigned to agent ${selectedAgent.fullName || selectedAgent.firstName}`);

    res.json({ 
      message: 'Lead automatically assigned successfully',
      lead: updatedLead[0],
      assignedAgent: {
        id: selectedAgent.id,
        agentId: selectedAgent.agentId,
        name: selectedAgent.fullName || `${selectedAgent.firstName} ${selectedAgent.lastName}`.trim(),
        email: selectedAgent.email,
        previousLeadCount: selectedAgent.leadCount
      },
      assignmentStrategy: 'lowest_lead_count'
    });
  } catch (error) {
    console.error('Error in auto-assign lead:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// POST /api/leads/:leadId/calendly-link - Generate Calendly scheduling link for assigned agent
router.post('/:leadId/calendly-link', verifyToken, async (req, res) => {
  try {
    const { leadId } = req.params;

    // Get lead with assigned agent
    const leadData = await db.select({
      id: leads.id,
      email: leads.email,
      firstName: leads.firstName,
      lastName: leads.lastName,
      assignedAgentId: leads.assignedAgentId,
      agentName: agents.fullName,
      agentFirstName: agents.firstName,
      agentLastName: agents.lastName
    })
      .from(leads)
      .leftJoin(agents, eq(leads.assignedAgentId, agents.id))
      .where(eq(leads.id, leadId))
      .limit(1);

    if (!leadData || leadData.length === 0) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    const lead = leadData[0];

    if (!lead.assignedAgentId) {
      return res.status(400).json({ error: 'Lead is not assigned to an agent' });
    }

    // Get agent's Calendly integration
    const agentIntegration = await db.select({
      calendlyAccessToken: agentIntegrations.calendlyAccessToken
    })
      .from(agentIntegrations)
      .where(eq(agentIntegrations.agentId, lead.assignedAgentId))
      .limit(1);

    if (!agentIntegration || agentIntegration.length === 0 || !agentIntegration[0].calendlyAccessToken) {
      return res.status(400).json({ 
        error: 'Agent does not have Calendly integration configured',
        agentId: lead.assignedAgentId
      });
    }

    const accessToken = agentIntegration[0].calendlyAccessToken;

    // Get agent's user info from Calendly API
    const userResponse = await fetch('https://api.calendly.com/users/me', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!userResponse.ok) {
      const errorText = await userResponse.text();
      console.error('Failed to get Calendly user info:', errorText);
      return res.status(500).json({ 
        error: 'Failed to retrieve agent Calendly information',
        details: errorText
      });
    }

    const userData = await userResponse.json();
    const userUri = userData.resource.uri;

    // Get agent's event types
    const eventTypesResponse = await fetch(`https://api.calendly.com/event_types?user=${encodeURIComponent(userUri)}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!eventTypesResponse.ok) {
      const errorText = await eventTypesResponse.text();
      console.error('Failed to get Calendly event types:', errorText);
      return res.status(500).json({ 
        error: 'Failed to retrieve agent event types',
        details: errorText
      });
    }

    const eventTypesData = await eventTypesResponse.json();
    
    if (!eventTypesData.collection || eventTypesData.collection.length === 0) {
      return res.status(400).json({ 
        error: 'Agent has no available event types configured in Calendly'
      });
    }

    // Use the first active event type (you could add logic to select specific event types)
    const eventType = eventTypesData.collection.find(et => et.active) || eventTypesData.collection[0];
    
    if (!eventType) {
      return res.status(400).json({ 
        error: 'No active event types found for agent'
      });
    }

    // Generate scheduling link with pre-filled information
    const schedulingUrl = new URL(eventType.scheduling_url);
    
    // Add UTM parameters for tracking
    schedulingUrl.searchParams.set('utm_source', 'automation_system');
    schedulingUrl.searchParams.set('utm_medium', 'email');
    schedulingUrl.searchParams.set('utm_campaign', 'lead_scheduling');
    schedulingUrl.searchParams.set('utm_content', `lead_${leadId}`);
    
    // Pre-fill lead information if available
    if (lead.firstName && lead.lastName) {
      schedulingUrl.searchParams.set('name', `${lead.firstName} ${lead.lastName}`.trim());
    }
    if (lead.email) {
      schedulingUrl.searchParams.set('email', lead.email);
    }

    const response = {
      success: true,
      schedulingUrl: schedulingUrl.toString(),
      eventType: {
        name: eventType.name,
        description: eventType.description,
        duration: eventType.duration,
        kind: eventType.kind
      },
      agent: {
        id: lead.assignedAgentId,
        name: lead.agentName || `${lead.agentFirstName} ${lead.agentLastName}`.trim()
      },
      lead: {
        id: lead.id,
        name: `${lead.firstName} ${lead.lastName}`.trim(),
        email: lead.email
      }
    };

    console.log('Generated Calendly scheduling link:', {
      leadId,
      agentId: lead.assignedAgentId,
      eventTypeName: eventType.name,
      schedulingUrl: schedulingUrl.toString()
    });

    res.json(response);

  } catch (error) {
    console.error('Error generating Calendly link:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error.message
    });
  }
});



// POST /api/leads/:leadId/complete-automation - Execute complete automation workflow
router.post('/:leadId/complete-automation', verifyToken, async (req, res) => {
  try {
    const { leadId } = req.params;
    const { trackingId } = req.body;

    console.log(`🚀 COMPLETE-AUTOMATION: Starting workflow for lead ${leadId}`);

    if (!leadId) {
      return res.status(400).json({ 
        error: 'Lead ID is required' 
      });
    }

    // Execute complete automation workflow
    const result = await leadAutomationService.executeCompleteWorkflow(leadId, trackingId);

    if (result.success) {
      console.log(`✅ COMPLETE-AUTOMATION: Workflow completed successfully for lead ${leadId}`);
      
      res.status(200).json({
        message: 'Complete automation workflow executed successfully',
        leadId,
        trackingId: result.trackingId,
        completedSteps: result.completedSteps,
        failedSteps: result.failedSteps,
        results: {
          assignment: result.steps.assignment || null,
        calendly: result.steps.calendly || null
        }
      });
    } else {
      console.log(`❌ COMPLETE-AUTOMATION: Workflow failed for lead ${leadId} - ${result.error}`);
      
      res.status(500).json({
        error: 'Complete automation workflow failed',
        leadId,
        trackingId: result.trackingId,
        details: result.error,
        completedSteps: result.completedSteps || [],
        failedSteps: result.failedSteps || []
      });
    }

  } catch (error) {
    console.error('❌ COMPLETE-AUTOMATION: Error executing workflow:', error);
    res.status(500).json({ 
      error: 'Internal server error while executing complete automation workflow',
      details: error.message 
    });
  }
});

// GET /api/leads/:leadId/automation-status - Get automation status for a lead
router.get('/:leadId/automation-status', verifyToken, async (req, res) => {
  try {
    const { leadId } = req.params;

    console.log(`📊 AUTOMATION-STATUS: Getting status for lead ${leadId}`);

    if (!leadId) {
      return res.status(400).json({ 
        error: 'Lead ID is required' 
      });
    }

    // Get automation status
    const result = await leadAutomationService.getAutomationStatus(leadId);

    if (result.success) {
      console.log(`✅ AUTOMATION-STATUS: Status retrieved for lead ${leadId}`);
      
      res.status(200).json({
        message: 'Automation status retrieved successfully',
        leadId,
        lead: result.lead,
        agent: result.agent,
        automationStatus: result.automationStatus
      });
    } else {
      console.log(`❌ AUTOMATION-STATUS: Failed to get status for lead ${leadId} - ${result.error}`);
      
      res.status(404).json({
        error: 'Failed to get automation status',
        leadId,
        details: result.error
      });
    }

  } catch (error) {
    console.error('❌ AUTOMATION-STATUS: Error getting status:', error);
    res.status(500).json({ 
      error: 'Internal server error while getting automation status',
      details: error.message 
    });
  }
});

export default router;
