import express from 'express';
import dotenv from 'dotenv';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { buildCallOutcomeLeadPatch, CALL_OUTCOMES, isValidCallOutcome } from '../services/call-outcome-policy.js';
import insforgeDataService from '../services/insforge-data-service.js';
import { buildFreshEmailActionPayload } from '../services/fresh-email-draft-service.js';

dotenv.config();

const router = express.Router();

const verifyAdmin = [authenticateToken, requireRole('admin')];

function serializeAgent(agent) {
  return {
    id: agent.id,
    name: agent.fullName || [agent.firstName, agent.lastName].filter(Boolean).join(' ') || agent.email,
    fullName: agent.fullName,
    email: agent.email,
    role: agent.role,
    email_verified: agent.emailVerified,
    emailVerified: agent.emailVerified,
    created_at: agent.createdAt,
    createdAt: agent.createdAt,
    last_login: agent.lastLogin,
    lastLogin: agent.lastLogin,
    is_active: agent.isActive,
    isActive: agent.isActive,
  };
}

// AGENT MANAGEMENT ENDPOINTS

// Get all agents
router.get('/agents', verifyAdmin, async (req, res) => {
  try {
    const agentsResult = await insforgeDataService.listAdminAgents();
    res.json({ success: true, agents: agentsResult.map(serializeAgent) });
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

    const normalizedEmail = email.trim().toLowerCase();

    const existingUser = await insforgeDataService.getAgentByEmail(normalizedEmail);
    if (existingUser) {
      return res.status(400).json({
        error: 'User with this email already exists'
      });
    }

    const nameParts = name.trim().split(/\s+/);

    // Create portal account record. Authentication is handled by InsForge Google OAuth.
    const newAgent = await insforgeDataService.createAgent({
      fullName: name.trim(),
      firstName: nameParts[0] || name.trim(),
      lastName: nameParts.slice(1).join(' '),
      email: normalizedEmail,
      passwordHash: null,
      role,
      emailVerified: true,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    if (!newAgent) {
      console.error('Error creating agent');
      return res.status(500).json({
        error: 'Failed to create agent'
      });
    }

    res.status(201).json({
      success: true,
      message: 'Portal user created successfully. They can now sign in with Google using this email address.',
      agent: {
        id: newAgent.id,
        name: newAgent.fullName || name.trim(),
        email: newAgent.email,
        role: newAgent.role
      },
      authProvider: 'insforge_google'
    });
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

    const agent = await insforgeDataService.getAgentById(agentId);
    if (!agent) {
      return res.status(404).json({
        error: 'Agent not found'
      });
    }

    const assignedLeads = (await insforgeDataService.listRecentLeads(10000))
      .filter((lead) => lead.assignedAgentId === agentId);
    await insforgeDataService.updateLeads(assignedLeads.map((lead) => lead.id), {
      assignedAgentId: null,
      updatedAt: new Date(),
    });

    await insforgeDataService.deleteAgent(agentId);

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
    const leadsResult = await insforgeDataService.listRecentLeads(10000);
    leadsResult.reverse();

    res.json({ leads: leadsResult || [] });
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

    const agent = await insforgeDataService.getAgentById(agentId);
    if (!agent || !['agent', 'admin'].includes(agent.role)) {
      return res.status(404).json({
        error: 'Agent not found'
      });
    }

    const updatedLeads = await insforgeDataService.updateLeads(leadIds, {
      assignedAgentId: agentId,
      updatedAt: new Date(),
    });

    if (!updatedLeads || updatedLeads.length === 0) {
      console.error('Error assigning leads');
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

    const updatedLeads = await insforgeDataService.updateLeads(leadIds, {
      assignedAgentId: null,
      updatedAt: new Date(),
    });

    if (!updatedLeads || updatedLeads.length === 0) {
      console.error('Error unassigning leads');
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

// BOB ACTIVITY ENDPOINTS

// Get Bob action history and human-review queue for admins
router.get('/bob-activity', verifyAdmin, async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);

    const [actions, allLeads, conversations] = await Promise.all([
      insforgeDataService.listBobActions(limit),
      insforgeDataService.listRecentLeads(10000),
      insforgeDataService.listLeadConversations(),
    ]);

    const leadsById = new Map(allLeads.map((lead) => [lead.id, lead]));
    const conversationsById = new Map(conversations.map((conversation) => [conversation.id, conversation]));

    const actionRows = actions.map((action) => {
      const lead = leadsById.get(action.leadId) || {};
      const conversation = conversationsById.get(action.conversationId) || {};

      return {
        ...action,
        leadEmail: lead.email,
        leadFullName: lead.fullName,
        leadFirstName: lead.firstName,
        leadLastName: lead.lastName,
        leadPhone: lead.phone,
        leadStatus: lead.status,
        leadStage: lead.leadStage,
        qualificationStatus: lead.qualificationStatus,
        qualificationScore: lead.qualificationScore,
        schedulingState: lead.schedulingState,
        requiresHumanReview: lead.requiresHumanReview,
        escalationReason: lead.escalationReason,
        automationPaused: lead.automationPaused,
        conversationStatus: conversation.conversationStatus,
        lastIntent: conversation.lastIntent,
        humanReviewRequired: conversation.humanReviewRequired,
      };
    });

    const reviewRows = allLeads
      .filter((lead) => lead.requiresHumanReview || lead.automationPaused)
      .sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime())
      .slice(0, 50);

    const statusCountMap = actions.reduce((counts, action) => {
      counts[action.status] = (counts[action.status] || 0) + 1;
      return counts;
    }, {});

    const stats = {
      totalActions: actions.length,
      pendingActions: statusCountMap.pending || 0,
      failedActions: statusCountMap.failed || 0,
      awaitingHuman: statusCountMap.awaiting_human || 0,
      awaitingCall: statusCountMap.awaiting_call || 0,
      reviewLeads: reviewRows.length,
    };

    res.json({
      success: true,
      stats,
      actions: actionRows,
      reviewQueue: reviewRows,
    });
  } catch (error) {
    console.error('Error in get Bob activity route:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create a fresh Bob email draft for admin approval
router.post('/bob-activity/email-drafts', verifyAdmin, async (req, res) => {
  try {
    const { leadId, goal = 'booking_invite', bookingLink } = req.body;

    if (!leadId) {
      return res.status(400).json({ success: false, error: 'leadId is required' });
    }

    const lead = await insforgeDataService.getLeadById(leadId);
    if (!lead) {
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }

    const payload = buildFreshEmailActionPayload({
      lead,
      goal,
      bookingLink,
      requestedBy: req.user.id,
    });

    const draftAction = await insforgeDataService.createBobAction({
      leadId: lead.id,
      conversationId: null,
      actionType: 'draft_fresh_email',
      channel: 'email',
      status: payload.safety.approvedForQueue ? 'awaiting_approval' : 'needs_revision',
      reason: `Fresh ${payload.emailGoal} email draft generated for review`,
      payload,
      scheduledFor: null,
    });

    res.status(201).json({
      success: true,
      draft: draftAction,
      safety: payload.safety,
    });
  } catch (error) {
    console.error('Error creating Bob fresh email draft:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Approve a fresh Bob email draft and queue it for the Bob executor
router.post('/bob-activity/email-drafts/:actionId/approve', verifyAdmin, async (req, res) => {
  try {
    const { actionId } = req.params;
    const draftAction = await insforgeDataService.getBobActionById(actionId);

    if (!draftAction || draftAction.actionType !== 'draft_fresh_email') {
      return res.status(404).json({ success: false, error: 'Fresh email draft not found' });
    }

    if (draftAction.payload?.safety?.errors?.length) {
      return res.status(400).json({
        success: false,
        error: 'Draft has safety errors and cannot be approved until revised',
        safety: draftAction.payload.safety,
      });
    }

    const approvedAction = await insforgeDataService.updateBobAction(actionId, {
      actionType: 'send_fresh_email',
      status: 'pending',
      scheduledFor: new Date(),
      result: {
        approvedBy: req.user.id,
        approvedAt: new Date().toISOString(),
      },
      updatedAt: new Date(),
    });

    res.json({
      success: true,
      action: approvedAction,
    });
  } catch (error) {
    console.error('Error approving Bob fresh email draft:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Record a queued call outcome for dashboards/agents
router.patch('/bob-activity/actions/:actionId/call-outcome', verifyAdmin, async (req, res) => {
  try {
    const { actionId } = req.params;
    const { outcome, notes } = req.body;

    if (!isValidCallOutcome(outcome)) {
      return res.status(400).json({
        error: 'Unsupported call outcome',
        allowedOutcomes: CALL_OUTCOMES,
      });
    }

    const action = await insforgeDataService.getBobActionById(actionId);
    if (!action) {
      return res.status(404).json({ error: 'Bob action not found' });
    }

    if (action.actionType !== 'queue_call_attempt') {
      return res.status(400).json({ error: 'Call outcome can only be recorded for queued call actions' });
    }

    if (action.status !== 'awaiting_call') {
      return res.status(400).json({ error: 'Call outcome can only be recorded for actions awaiting a call' });
    }

    const now = new Date();
    const leadPatch = {
      ...buildCallOutcomeLeadPatch(outcome, now),
      lastUpdatedBy: req.user.id,
    };

    const updatedLead = await insforgeDataService.updateLead(action.leadId, leadPatch);

    await insforgeDataService.updateBobAction(actionId, {
      status: 'completed',
      executedAt: now,
      updatedAt: now,
      result: {
        ...(action.result || {}),
        callOutcome: outcome,
        callOutcomeNotes: typeof notes === 'string' ? notes.trim() : null,
        callOutcomeRecordedAt: now.toISOString(),
        callOutcomeRecordedBy: req.user.id,
      },
    });

    if (action.conversationId && updatedLead) {
      const conversation = await insforgeDataService.getConversationById(action.conversationId);
      await insforgeDataService.updateConversation(action.conversationId, {
        lastIntent: `call_outcome_${outcome}`,
        lastIntentAt: now,
        humanReviewRequired: updatedLead.requiresHumanReview,
        conversationStatus: updatedLead.requiresHumanReview ? 'needs_human_review' : 'active_nurture',
        nextAction: updatedLead.requiresHumanReview
          ? 'human_review'
          : updatedLead.nextContactAt
            ? 'follow_up_after_call'
            : null,
        nextActionAt: updatedLead.nextContactAt || null,
        lastSummary: `Call outcome recorded: ${outcome}${notes ? ` - ${notes}` : ''}`,
        metadata: {
          ...(conversation?.metadata || {}),
          callQueuedAt: null,
          lastCallOutcome: outcome,
          lastCallOutcomeRecordedAt: now.toISOString(),
          lastCallOutcomeRecordedBy: req.user.id,
        },
        updatedAt: now,
      });
    }

    res.json({
      success: true,
      actionId,
      outcome,
      lead: updatedLead,
    });
  } catch (error) {
    console.error('Error in call outcome route:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update a lead's Bob review/automation state
router.patch('/bob-activity/leads/:leadId/review', verifyAdmin, async (req, res) => {
  try {
    const { leadId } = req.params;
    const {
      requiresHumanReview,
      automationPaused,
      escalationReason,
      leadStage,
      schedulingState,
    } = req.body;

    const patch = {
      updatedAt: new Date(),
      lastUpdatedBy: req.user.id,
    };

    if (typeof requiresHumanReview === 'boolean') patch.requiresHumanReview = requiresHumanReview;
    if (typeof automationPaused === 'boolean') patch.automationPaused = automationPaused;
    if (typeof escalationReason === 'string') patch.escalationReason = escalationReason.trim() || null;
    if (typeof leadStage === 'string' && leadStage.trim()) patch.leadStage = leadStage.trim();
    if (typeof schedulingState === 'string' && schedulingState.trim()) patch.schedulingState = schedulingState.trim();

    const updatedLead = await insforgeDataService.updateLead(leadId, patch);

    if (!updatedLead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    const existingConversations = (await insforgeDataService.listLeadConversations())
      .filter((conversation) => conversation.leadId === leadId);

    await Promise.all(existingConversations.map((conversation) => insforgeDataService.updateConversation(conversation.id, {
        humanReviewRequired: updatedLead.requiresHumanReview,
        conversationStatus: updatedLead.requiresHumanReview ? 'needs_human_review' : 'active_nurture',
        lastIntent: updatedLead.requiresHumanReview ? 'human_review_requested' : 'human_review_resolved',
        lastIntentAt: new Date(),
        updatedAt: new Date(),
        metadata: {
          ...(conversation.metadata || {}),
          lastAdminReviewUpdateAt: new Date().toISOString(),
          lastAdminReviewUpdatedBy: req.user.id,
        },
      })));

    if (!updatedLead.requiresHumanReview) {
      const awaitingActions = (await insforgeDataService.listBobActions(10000))
        .filter((action) => action.leadId === leadId && action.status === 'awaiting_human');

      await Promise.all(awaitingActions.map((action) => insforgeDataService.updateBobAction(action.id, {
          status: 'completed',
          executedAt: new Date(),
          updatedAt: new Date(),
          result: {
            ...(action.result || {}),
            resolvedByAdminId: req.user.id,
            resolvedAt: new Date().toISOString(),
          },
        })));
    }

    res.json({ success: true, lead: updatedLead });
  } catch (error) {
    console.error('Error in update Bob review route:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// CAMPAIGN MANAGEMENT ENDPOINTS

// Get campaign stats and data
router.get('/campaigns', verifyAdmin, async (req, res) => {
  try {
    // Return mock data for campaign analytics
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
    const [agentsResult, leadsResult] = await Promise.all([
      insforgeDataService.listAdminAgents(),
      insforgeDataService.listRecentLeads(10000),
    ]);

    res.json({
      stats: {
        totalAgents: agentsResult.length,
        totalLeads: leadsResult.length,
        unassignedLeads: leadsResult.filter((lead) => !lead.assignedAgentId).length,
        activeCampaigns: 0 // Mock data for now
      }
    });
  } catch (error) {
    console.error('Error in get stats route:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
