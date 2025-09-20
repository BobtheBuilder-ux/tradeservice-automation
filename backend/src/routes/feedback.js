import express from 'express';
import { db } from '../db/connection.js';
import { agentFeedback, agents, leads } from '../db/schema.js';
import { eq, and, desc, asc } from 'drizzle-orm';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { emailService } from '../services/emailService.js';
import { logger } from '../../utils/logger.js';

const router = express.Router();

// Get all feedback for an agent (agent can only see their own)
router.get('/agent/:agentId', authenticateToken, async (req, res) => {
  try {
    const { agentId } = req.params;
    const { page = 1, limit = 10, status, leadId } = req.query;
    
    // Ensure agent can only access their own feedback or admin can access all
    if (req.user.role !== 'admin' && req.user.id !== agentId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    let whereConditions = [eq(agentFeedback.agentId, agentId)];
    
    if (status) {
      whereConditions.push(eq(agentFeedback.status, status));
    }
    
    if (leadId) {
      whereConditions.push(eq(agentFeedback.leadId, leadId));
    }

    const offset = (page - 1) * limit;
    
    const feedback = await db
      .select({
        id: agentFeedback.id,
        leadId: agentFeedback.leadId,
        feedbackType: agentFeedback.feedbackType,
        subject: agentFeedback.subject,
        content: agentFeedback.content,
        priority: agentFeedback.priority,
        status: agentFeedback.status,
        adminResponse: agentFeedback.adminResponse,
        adminRespondedAt: agentFeedback.adminRespondedAt,
        isRead: agentFeedback.isRead,
        tags: agentFeedback.tags,
        createdAt: agentFeedback.createdAt,
        updatedAt: agentFeedback.updatedAt,
        leadEmail: leads.email,
        leadFirstName: leads.firstName,
        leadLastName: leads.lastName,
        adminResponderName: agents.fullName,
      })
      .from(agentFeedback)
      .leftJoin(leads, eq(agentFeedback.leadId, leads.id))
      .leftJoin(agents, eq(agentFeedback.adminRespondedBy, agents.id))
      .where(and(...whereConditions))
      .orderBy(desc(agentFeedback.createdAt))
      .limit(parseInt(limit))
      .offset(offset);

    // Get total count for pagination
    const totalCount = await db
      .select({ count: agentFeedback.id })
      .from(agentFeedback)
      .where(and(...whereConditions));

    res.json({
      feedback,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalCount.length,
        totalPages: Math.ceil(totalCount.length / limit)
      }
    });
  } catch (error) {
    logger.error('Error fetching agent feedback:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all feedback (admin only)
router.get('/all', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { page = 1, limit = 20, status, priority, agentId } = req.query;
    
    let whereConditions = [];
    
    if (status) {
      whereConditions.push(eq(agentFeedback.status, status));
    }
    
    if (priority) {
      whereConditions.push(eq(agentFeedback.priority, priority));
    }
    
    if (agentId) {
      whereConditions.push(eq(agentFeedback.agentId, agentId));
    }

    const offset = (page - 1) * limit;
    
    const feedback = await db
      .select({
        id: agentFeedback.id,
        agentId: agentFeedback.agentId,
        leadId: agentFeedback.leadId,
        feedbackType: agentFeedback.feedbackType,
        subject: agentFeedback.subject,
        content: agentFeedback.content,
        priority: agentFeedback.priority,
        status: agentFeedback.status,
        adminResponse: agentFeedback.adminResponse,
        adminRespondedAt: agentFeedback.adminRespondedAt,
        isRead: agentFeedback.isRead,
        tags: agentFeedback.tags,
        createdAt: agentFeedback.createdAt,
        updatedAt: agentFeedback.updatedAt,
        agentName: agents.fullName,
        agentEmail: agents.email,
        leadEmail: leads.email,
        leadFirstName: leads.firstName,
        leadLastName: leads.lastName,
      })
      .from(agentFeedback)
      .leftJoin(agents, eq(agentFeedback.agentId, agents.id))
      .leftJoin(leads, eq(agentFeedback.leadId, leads.id))
      .where(whereConditions.length > 0 ? and(...whereConditions) : undefined)
      .orderBy(desc(agentFeedback.createdAt))
      .limit(parseInt(limit))
      .offset(offset);

    res.json({ feedback });
  } catch (error) {
    logger.error('Error fetching all feedback:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create new feedback
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { leadId, feedbackType, subject, content, priority, tags } = req.body;
    
    // Validate required fields
    if (!leadId || !subject || !content) {
      return res.status(400).json({ error: 'Lead ID, subject, and content are required' });
    }

    // Verify the lead exists and agent has access
    const lead = await db
      .select()
      .from(leads)
      .where(eq(leads.id, leadId))
      .limit(1);

    if (lead.length === 0) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    // For agents, ensure they can only create feedback for their assigned leads
    if (req.user.role !== 'admin' && lead[0].assignedAgentId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied - lead not assigned to you' });
    }

    const newFeedback = await db
      .insert(agentFeedback)
      .values({
        agentId: req.user.id,
        leadId,
        feedbackType: feedbackType || 'general',
        subject,
        content,
        priority: priority || 'medium',
        tags: tags || null,
      })
      .returning();

    // Send email notification to admin
    try {
      const agent = await db
        .select()
        .from(agents)
        .where(eq(agents.id, req.user.id))
        .limit(1);

      if (agent.length > 0) {
        await emailService.sendFeedbackNotification({
          type: 'new',
          agentName: agent[0].fullName || agent[0].email,
          agentEmail: agent[0].email,
          leadEmail: lead[0].email,
          leadName: `${lead[0].firstName || ''} ${lead[0].lastName || ''}`.trim(),
          subject,
          content,
          priority,
          feedbackId: newFeedback[0].id,
        });
      }
    } catch (emailError) {
      logger.error('Error sending feedback notification email:', emailError);
      // Don't fail the request if email fails
    }

    res.status(201).json({ 
      message: 'Feedback created successfully',
      feedback: newFeedback[0]
    });
  } catch (error) {
    logger.error('Error creating feedback:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update feedback (agent can update their own, admin can update any)
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { subject, content, priority, tags, status, adminResponse } = req.body;

    // Get existing feedback
    const existingFeedback = await db
      .select()
      .from(agentFeedback)
      .where(eq(agentFeedback.id, id))
      .limit(1);

    if (existingFeedback.length === 0) {
      return res.status(404).json({ error: 'Feedback not found' });
    }

    const feedback = existingFeedback[0];

    // Check permissions
    const isAgent = req.user.role !== 'admin' && feedback.agentId === req.user.id;
    const isAdmin = req.user.role === 'admin';

    if (!isAgent && !isAdmin) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Prepare update data
    let updateData = {
      updatedAt: new Date().toISOString(),
    };

    // Agents can only update certain fields
    if (isAgent && !isAdmin) {
      if (subject !== undefined) updateData.subject = subject;
      if (content !== undefined) updateData.content = content;
      if (priority !== undefined) updateData.priority = priority;
      if (tags !== undefined) updateData.tags = tags;
    }

    // Admins can update all fields including status and admin response
    if (isAdmin) {
      if (subject !== undefined) updateData.subject = subject;
      if (content !== undefined) updateData.content = content;
      if (priority !== undefined) updateData.priority = priority;
      if (tags !== undefined) updateData.tags = tags;
      if (status !== undefined) updateData.status = status;
      if (adminResponse !== undefined) {
        updateData.adminResponse = adminResponse;
        updateData.adminRespondedBy = req.user.id;
        updateData.adminRespondedAt = new Date().toISOString();
      }
    }

    const updatedFeedback = await db
      .update(agentFeedback)
      .set(updateData)
      .where(eq(agentFeedback.id, id))
      .returning();

    // Send email notification for updates
    try {
      const agent = await db
        .select()
        .from(agents)
        .where(eq(agents.id, feedback.agentId))
        .limit(1);

      const lead = await db
        .select()
        .from(leads)
        .where(eq(leads.id, feedback.leadId))
        .limit(1);

      if (agent.length > 0 && lead.length > 0) {
        await emailService.sendFeedbackNotification({
          type: 'updated',
          agentName: agent[0].fullName || agent[0].email,
          agentEmail: agent[0].email,
          leadEmail: lead[0].email,
          leadName: `${lead[0].firstName || ''} ${lead[0].lastName || ''}`.trim(),
          subject: updateData.subject || feedback.subject,
          content: updateData.content || feedback.content,
          priority: updateData.priority || feedback.priority,
          feedbackId: id,
          adminResponse: updateData.adminResponse,
        });
      }
    } catch (emailError) {
      logger.error('Error sending feedback update notification email:', emailError);
    }

    res.json({
      message: 'Feedback updated successfully',
      feedback: updatedFeedback[0]
    });
  } catch (error) {
    logger.error('Error updating feedback:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Mark feedback as read (admin only)
router.patch('/:id/read', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;

    const updatedFeedback = await db
      .update(agentFeedback)
      .set({ 
        isRead: true,
        updatedAt: new Date().toISOString()
      })
      .where(eq(agentFeedback.id, id))
      .returning();

    if (updatedFeedback.length === 0) {
      return res.status(404).json({ error: 'Feedback not found' });
    }

    res.json({
      message: 'Feedback marked as read',
      feedback: updatedFeedback[0]
    });
  } catch (error) {
    logger.error('Error marking feedback as read:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete feedback (admin only)
router.delete('/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;

    const deletedFeedback = await db
      .delete(agentFeedback)
      .where(eq(agentFeedback.id, id))
      .returning();

    if (deletedFeedback.length === 0) {
      return res.status(404).json({ error: 'Feedback not found' });
    }

    res.json({ message: 'Feedback deleted successfully' });
  } catch (error) {
    logger.error('Error deleting feedback:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get feedback statistics (admin only)
router.get('/stats/overview', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const stats = await db
      .select({
        status: agentFeedback.status,
        priority: agentFeedback.priority,
        count: agentFeedback.id
      })
      .from(agentFeedback);

    // Process stats
    const statusCounts = {};
    const priorityCounts = {};
    
    stats.forEach(stat => {
      statusCounts[stat.status] = (statusCounts[stat.status] || 0) + 1;
      priorityCounts[stat.priority] = (priorityCounts[stat.priority] || 0) + 1;
    });

    res.json({
      total: stats.length,
      byStatus: statusCounts,
      byPriority: priorityCounts
    });
  } catch (error) {
    logger.error('Error fetching feedback statistics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;