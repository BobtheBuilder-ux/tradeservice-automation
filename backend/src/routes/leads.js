import express from 'express';
import { db } from '../config/index.js';
import { leads, agents, agentIntegrations } from '../db/schema.js';
import { eq, desc, isNull, and, count } from 'drizzle-orm';
import jwt from 'jsonwebtoken';
import leadAutomationService from '../services/lead-automation-service.js';

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

// Create Zoom meeting for assigned agent
router.post('/:leadId/zoom-meeting', verifyToken, async (req, res) => {
  try {
    const { leadId } = req.params;
    const { topic, startTime, duration = 30, agenda } = req.body;

    console.log(`🔍 ZOOM-MEETING: Creating meeting for lead ${leadId}`);

    // Get lead details with assigned agent
    const leadWithAgent = await db.select({
      leadId: leads.id,
      leadEmail: leads.email,
      leadFirstName: leads.firstName,
      leadLastName: leads.lastName,
      leadFullName: leads.fullName,
      assignedAgentId: leads.assignedAgentId,
      agentId: agents.agentId,
      agentFirstName: agents.firstName,
      agentLastName: agents.lastName,
      agentFullName: agents.fullName,
      agentEmail: agents.email
    })
    .from(leads)
    .leftJoin(agents, eq(leads.assignedAgentId, agents.id))
    .where(eq(leads.id, leadId))
    .limit(1);

    if (!leadWithAgent || leadWithAgent.length === 0) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    const lead = leadWithAgent[0];

    if (!lead.assignedAgentId) {
      return res.status(400).json({ error: 'Lead must be assigned to an agent before creating Zoom meeting' });
    }

    console.log(`👤 ZOOM-MEETING: Lead assigned to agent ${lead.agentFullName || lead.agentFirstName}`);

    // Get agent's Zoom integration
    const agentIntegration = await db.select({
      zoomAccessToken: agentIntegrations.zoomAccessToken,
      zoomRefreshToken: agentIntegrations.zoomRefreshToken
    })
    .from(agentIntegrations)
    .where(eq(agentIntegrations.agentId, lead.assignedAgentId))
    .limit(1);

    if (!agentIntegration || agentIntegration.length === 0 || !agentIntegration[0].zoomAccessToken) {
      return res.status(400).json({ 
        error: 'Agent does not have Zoom integration configured',
        message: 'The assigned agent needs to connect their Zoom account first'
      });
    }

    const { zoomAccessToken } = agentIntegration[0];
    console.log(`🔑 ZOOM-MEETING: Found Zoom access token for agent`);

    // Prepare meeting data
    const meetingData = {
      topic: topic || `Meeting with ${lead.leadFullName || lead.leadFirstName}`,
      type: 2, // Scheduled meeting
      start_time: startTime || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Default to tomorrow
      duration: duration,
      agenda: agenda || `Meeting with lead ${lead.leadFullName || lead.leadFirstName} (${lead.leadEmail})`,
      settings: {
        host_video: true,
        participant_video: true,
        join_before_host: true,
        mute_upon_entry: false,
        watermark: false,
        use_pmi: false,
        approval_type: 2, // No registration required
        audio: 'both', // Both telephony and VoIP
        auto_recording: 'none'
      }
    };

    console.log(`📅 ZOOM-MEETING: Creating meeting with data:`, {
      topic: meetingData.topic,
      start_time: meetingData.start_time,
      duration: meetingData.duration
    });

    // Create Zoom meeting using agent's access token
    const zoomResponse = await fetch('https://api.zoom.us/v2/users/me/meetings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${zoomAccessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(meetingData)
    });

    if (!zoomResponse.ok) {
      const errorData = await zoomResponse.text();
      console.error(`❌ ZOOM-MEETING: Failed to create meeting:`, {
        status: zoomResponse.status,
        statusText: zoomResponse.statusText,
        error: errorData
      });
      
      return res.status(500).json({ 
        error: 'Failed to create Zoom meeting',
        details: `Zoom API error: ${zoomResponse.status} ${zoomResponse.statusText}`,
        zoomError: errorData
      });
    }

    const zoomMeeting = await zoomResponse.json();
    console.log(`✅ ZOOM-MEETING: Successfully created meeting:`, {
      id: zoomMeeting.id,
      join_url: zoomMeeting.join_url,
      start_url: zoomMeeting.start_url
    });

    // Return meeting details
    res.json({
      message: 'Zoom meeting created successfully',
      meeting: {
        id: zoomMeeting.id,
        topic: zoomMeeting.topic,
        start_time: zoomMeeting.start_time,
        duration: zoomMeeting.duration,
        join_url: zoomMeeting.join_url,
        start_url: zoomMeeting.start_url,
        password: zoomMeeting.password,
        agenda: zoomMeeting.agenda
      },
      lead: {
        id: lead.leadId,
        name: lead.leadFullName || lead.leadFirstName,
        email: lead.leadEmail
      },
      agent: {
        id: lead.agentId,
        name: lead.agentFullName || lead.agentFirstName,
        email: lead.agentEmail
      }
    });

  } catch (error) {
    console.error('❌ ZOOM-MEETING: Error creating meeting:', error);
    res.status(500).json({ 
      error: 'Internal server error while creating Zoom meeting',
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
          calendly: result.steps.calendly || null,
          zoom: result.steps.zoom || null
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