import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { db } from '../config/index.js';
import { agents, bobActions, leadConversations, leads } from '../db/schema.js';
import { eq, count, or, inArray, and, desc, sql } from 'drizzle-orm';
import emailService from '../services/email-service.js';
import dotenv from 'dotenv';
import { getJwtSecret } from '../utils/auth-config.js';
import { buildCallOutcomeLeadPatch, CALL_OUTCOMES, isValidCallOutcome } from '../services/call-outcome-policy.js';

dotenv.config();

const router = express.Router();

const JWT_SECRET = getJwtSecret();

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
    const userResult = await db.select({
      id: agents.id,
      email: agents.email,
      role: agents.role,
      emailVerified: agents.emailVerified
    })
    .from(agents)
    .where(eq(agents.id, decoded.userId))
    .limit(1);

    if (!userResult || userResult.length === 0 || !userResult[0].emailVerified) {
      return res.status(401).json({
        error: 'User not found or not verified'
      });
    }

    const user = userResult[0];

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
    const agentsResult = await db.select({
      id: agents.id,
      name: agents.fullName,
      email: agents.email,
      role: agents.role,
      email_verified: agents.emailVerified,
      created_at: agents.createdAt,
      last_login: agents.lastLogin,
      is_active: agents.isActive
    })
    .from(agents)
    .where(and(
      or(eq(agents.role, 'agent'), eq(agents.role, 'admin')),
      eq(agents.isActive, true)
    ))
    .orderBy(agents.createdAt);

    res.json({ success: true, agents: agentsResult });
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
    const existingUserResult = await db.select({ id: agents.id })
      .from(agents)
      .where(eq(agents.email, email))
      .limit(1);

    if (existingUserResult.length > 0) {
      return res.status(400).json({
        error: 'User with this email already exists'
      });
    }

    // Generate temporary password and reset token
    const tempPassword = generateRandomPassword();
    const hashedPassword = await bcrypt.hash(tempPassword, 12);
    const resetToken = generateResetToken(email);

    // Create user with reset token
    const newAgentResult = await db.insert(agents)
      .values({
        fullName: name,
        email,
        passwordHash: hashedPassword,
        role,
        emailVerified: true, // Auto-verify admin-created accounts
        verificationToken: resetToken,
        agentToken: resetToken,
        agentTokenExpires: new Date(Date.now() + 24 * 60 * 60 * 1000),
        resetToken: resetToken,
        resetTokenExpires: new Date(Date.now() + 24 * 60 * 60 * 1000),
        createdAt: new Date()
      })
      .returning();

    if (!newAgentResult || newAgentResult.length === 0) {
      console.error('Error creating agent');
      return res.status(500).json({
        error: 'Failed to create agent'
      });
    }

    const newAgent = newAgentResult[0];

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
    const agentResult = await db.select({ id: agents.id, role: agents.role })
      .from(agents)
      .where(eq(agents.id, agentId))
      .limit(1);

    if (!agentResult || agentResult.length === 0) {
      return res.status(404).json({
        error: 'Agent not found'
      });
    }

    // Unassign all leads from this agent before deletion
    await db.update(leads)
      .set({ assignedAgentId: null })
      .where(eq(leads.assignedAgentId, agentId));

    // Delete the agent
    const deleteResult = await db.delete(agents)
      .where(eq(agents.id, agentId))
      .returning();

    if (!deleteResult || deleteResult.length === 0) {
      console.error('Error deleting agent');
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
    const leadsResult = await db.select()
      .from(leads)
      .orderBy(leads.createdAt);

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

    // Verify agent exists
    const agentResult = await db.select({ id: agents.id })
      .from(agents)
      .where(eq(agents.id, agentId))
      .where(or(eq(agents.role, 'agent'), eq(agents.role, 'admin')))
      .limit(1);

    if (!agentResult || agentResult.length === 0) {
      return res.status(404).json({
        error: 'Agent not found'
      });
    }

    // Update leads with agent assignment
    const updatedLeads = await db.update(leads)
      .set({ 
        assignedAgentId: agentId,
        updatedAt: new Date()
      })
      .where(inArray(leads.id, leadIds))
      .returning();

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

    // Update leads to remove agent assignment
    const updatedLeads = await db.update(leads)
      .set({ 
        assignedAgentId: null,
        updatedAt: new Date()
      })
      .where(inArray(leads.id, leadIds))
      .returning();

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

    const actionRows = await db.select({
      id: bobActions.id,
      leadId: bobActions.leadId,
      conversationId: bobActions.conversationId,
      actionType: bobActions.actionType,
      channel: bobActions.channel,
      status: bobActions.status,
      reason: bobActions.reason,
      payload: bobActions.payload,
      result: bobActions.result,
      scheduledFor: bobActions.scheduledFor,
      executedAt: bobActions.executedAt,
      createdAt: bobActions.createdAt,
      updatedAt: bobActions.updatedAt,
      leadEmail: leads.email,
      leadFullName: leads.fullName,
      leadFirstName: leads.firstName,
      leadLastName: leads.lastName,
      leadPhone: leads.phone,
      leadStatus: leads.status,
      leadStage: leads.leadStage,
      qualificationStatus: leads.qualificationStatus,
      qualificationScore: leads.qualificationScore,
      schedulingState: leads.schedulingState,
      requiresHumanReview: leads.requiresHumanReview,
      escalationReason: leads.escalationReason,
      automationPaused: leads.automationPaused,
      conversationStatus: leadConversations.conversationStatus,
      lastIntent: leadConversations.lastIntent,
      humanReviewRequired: leadConversations.humanReviewRequired,
    })
      .from(bobActions)
      .leftJoin(leads, eq(bobActions.leadId, leads.id))
      .leftJoin(leadConversations, eq(bobActions.conversationId, leadConversations.id))
      .orderBy(desc(bobActions.createdAt))
      .limit(limit);

    const reviewRows = await db.select({
      id: leads.id,
      email: leads.email,
      fullName: leads.fullName,
      firstName: leads.firstName,
      lastName: leads.lastName,
      phone: leads.phone,
      status: leads.status,
      priority: leads.priority,
      qualificationStatus: leads.qualificationStatus,
      qualificationScore: leads.qualificationScore,
      leadStage: leads.leadStage,
      schedulingState: leads.schedulingState,
      serviceInterest: leads.serviceInterest,
      timeline: leads.timeline,
      budgetRange: leads.budgetRange,
      requiresHumanReview: leads.requiresHumanReview,
      escalationReason: leads.escalationReason,
      automationPaused: leads.automationPaused,
      nextContactAt: leads.nextContactAt,
      updatedAt: leads.updatedAt,
      createdAt: leads.createdAt,
    })
      .from(leads)
      .where(or(eq(leads.requiresHumanReview, true), eq(leads.automationPaused, true)))
      .orderBy(desc(leads.updatedAt))
      .limit(50);

    const [statusCounts, reviewCount] = await Promise.all([
      db.select({
        status: bobActions.status,
        count: count(),
      })
        .from(bobActions)
        .groupBy(bobActions.status),
      db.select({ count: count() })
        .from(leads)
        .where(or(eq(leads.requiresHumanReview, true), eq(leads.automationPaused, true))),
    ]);

    const stats = {
      totalActions: statusCounts.reduce((sum, row) => sum + Number(row.count || 0), 0),
      pendingActions: Number(statusCounts.find((row) => row.status === 'pending')?.count || 0),
      failedActions: Number(statusCounts.find((row) => row.status === 'failed')?.count || 0),
      awaitingHuman: Number(statusCounts.find((row) => row.status === 'awaiting_human')?.count || 0),
      awaitingCall: Number(statusCounts.find((row) => row.status === 'awaiting_call')?.count || 0),
      reviewLeads: Number(reviewCount[0]?.count || 0),
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

    const actionRows = await db.select({
      id: bobActions.id,
      leadId: bobActions.leadId,
      conversationId: bobActions.conversationId,
      result: bobActions.result,
      actionType: bobActions.actionType,
      status: bobActions.status,
    })
      .from(bobActions)
      .where(eq(bobActions.id, actionId))
      .limit(1);

    const action = actionRows[0];
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

    const [updatedLead] = await db.update(leads)
      .set(leadPatch)
      .where(eq(leads.id, action.leadId))
      .returning();

    await db.update(bobActions)
      .set({
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
      })
      .where(eq(bobActions.id, actionId));

    if (action.conversationId && updatedLead) {
      await db.update(leadConversations)
        .set({
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
          lastSummary: `Call outcome recorded: ${outcome}${notes ? ` — ${notes}` : ''}`,
          metadata: sql`coalesce(${leadConversations.metadata}, '{}'::jsonb) || ${JSON.stringify({
            callQueuedAt: null,
            lastCallOutcome: outcome,
            lastCallOutcomeRecordedAt: now.toISOString(),
            lastCallOutcomeRecordedBy: req.user.id,
          })}::jsonb`,
          updatedAt: now,
        })
        .where(eq(leadConversations.id, action.conversationId));
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

    const [updatedLead] = await db.update(leads)
      .set(patch)
      .where(eq(leads.id, leadId))
      .returning();

    if (!updatedLead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    await db.update(leadConversations)
      .set({
        humanReviewRequired: updatedLead.requiresHumanReview,
        conversationStatus: updatedLead.requiresHumanReview ? 'needs_human_review' : 'active_nurture',
        lastIntent: updatedLead.requiresHumanReview ? 'human_review_requested' : 'human_review_resolved',
        lastIntentAt: new Date(),
        updatedAt: new Date(),
        metadata: sql`coalesce(${leadConversations.metadata}, '{}'::jsonb) || ${JSON.stringify({
          lastAdminReviewUpdateAt: new Date().toISOString(),
          lastAdminReviewUpdatedBy: req.user.id,
        })}::jsonb`,
      })
      .where(eq(leadConversations.leadId, leadId));

    if (!updatedLead.requiresHumanReview) {
      await db.update(bobActions)
        .set({
          status: 'completed',
          executedAt: new Date(),
          updatedAt: new Date(),
          result: sql`coalesce(${bobActions.result}, '{}'::jsonb) || ${JSON.stringify({
            resolvedByAdminId: req.user.id,
            resolvedAt: new Date().toISOString(),
          })}::jsonb`,
        })
        .where(and(
          eq(bobActions.leadId, leadId),
          eq(bobActions.status, 'awaiting_human')
        ));
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
    // Get agent count
    const agentCountResult = await db.select({ count: count() })
      .from(agents)
      .where(or(eq(agents.role, 'agent'), eq(agents.role, 'admin')));

    // Get lead count
    const leadCountResult = await db.select({ count: count() })
      .from(leads);

    // Get unassigned lead count
    const unassignedCountResult = await db.select({ count: count() })
      .from(leads)
      .where(eq(leads.assignedAgentId, null));

    const agentCount = agentCountResult[0]?.count || 0;
    const leadCount = leadCountResult[0]?.count || 0;
    const unassignedCount = unassignedCountResult[0]?.count || 0;

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
