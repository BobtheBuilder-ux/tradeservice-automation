import express from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { emailService } from '../services/emailService.js';
import insforgeDataService from '../services/insforge-data-service.js';
import { logger } from '../../utils/logger.js';

const router = express.Router();

function canAccessFeedback(user, feedback) {
  return user.role === 'admin' || feedback.agentId === user.id;
}

function paginate(rows, page = 1, limit = 20) {
  const pageNumber = Math.max(Number(page) || 1, 1);
  const pageSize = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const start = (pageNumber - 1) * pageSize;
  return {
    rows: rows.slice(start, start + pageSize),
    pageNumber,
    pageSize,
  };
}

router.get('/agent/:agentId', authenticateToken, async (req, res) => {
  try {
    const { agentId } = req.params;
    const { page = 1, limit = 10, status, leadId } = req.query;

    if (req.user.role !== 'admin' && req.user.id !== agentId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const rows = (await insforgeDataService.listFeedback(req.user))
      .filter((feedback) => feedback.agentId === agentId)
      .filter((feedback) => !status || feedback.status === status)
      .filter((feedback) => !leadId || feedback.leadId === leadId);
    const pageData = paginate(rows, page, limit);

    res.json({
      feedback: pageData.rows,
      pagination: {
        page: pageData.pageNumber,
        limit: pageData.pageSize,
        total: rows.length,
        totalPages: Math.ceil(rows.length / pageData.pageSize),
      },
    });
  } catch (error) {
    logger.error('Error fetching agent feedback:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/all', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { page = 1, limit = 20, status, priority, agentId } = req.query;
    const rows = (await insforgeDataService.listFeedback(req.user))
      .filter((feedback) => !status || feedback.status === status)
      .filter((feedback) => !priority || feedback.priority === priority)
      .filter((feedback) => !agentId || feedback.agentId === agentId);
    const pageData = paginate(rows, page, limit);

    res.json({ feedback: pageData.rows });
  } catch (error) {
    logger.error('Error fetching all feedback:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', authenticateToken, async (req, res) => {
  try {
    const { leadId, feedbackType, subject, content, priority, tags } = req.body;

    if (!leadId || !subject || !content) {
      return res.status(400).json({ error: 'Lead ID, subject, and content are required' });
    }

    const lead = await insforgeDataService.getLeadById(leadId, req.user);
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    if (req.user.role !== 'admin' && lead.assignedAgentId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied - lead not assigned to you' });
    }

    const feedback = await insforgeDataService.createFeedback({
      agentId: req.user.id,
      leadId,
      feedbackType: feedbackType || 'general',
      subject,
      content,
      priority: priority || 'medium',
      tags: tags || null,
    }, req.user);

    try {
      await emailService.sendFeedbackNotification({
        type: 'new',
        agentName: req.user.name || req.user.email,
        agentEmail: req.user.email,
        leadEmail: lead.email,
        leadName: lead.fullName || `${lead.firstName || ''} ${lead.lastName || ''}`.trim(),
        subject,
        content,
        priority,
        feedbackId: feedback.id,
      });
    } catch (emailError) {
      logger.error('Error sending feedback notification email:', emailError);
    }

    res.status(201).json({
      message: 'Feedback created successfully',
      feedback,
    });
  } catch (error) {
    logger.error('Error creating feedback:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { subject, content, priority, tags, status, adminResponse } = req.body;
    const feedback = await insforgeDataService.getFeedbackById(id, req.user);

    if (!feedback) {
      return res.status(404).json({ error: 'Feedback not found' });
    }

    if (!canAccessFeedback(req.user, feedback)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const isAdmin = req.user.role === 'admin';
    const updateData = {
      updatedAt: new Date().toISOString(),
    };

    if (subject !== undefined) updateData.subject = subject;
    if (content !== undefined) updateData.content = content;
    if (priority !== undefined) updateData.priority = priority;
    if (tags !== undefined) updateData.tags = tags;

    if (isAdmin) {
      if (status !== undefined) updateData.status = status;
      if (adminResponse !== undefined) {
        updateData.adminResponse = adminResponse;
        updateData.adminRespondedBy = req.user.id;
        updateData.adminRespondedAt = new Date().toISOString();
      }
    }

    const updatedFeedback = await insforgeDataService.updateFeedback(id, updateData, req.user);
    res.json({
      message: 'Feedback updated successfully',
      feedback: updatedFeedback,
    });
  } catch (error) {
    logger.error('Error updating feedback:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.patch('/:id/read', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const feedback = await insforgeDataService.updateFeedback(req.params.id, {
      isRead: true,
      updatedAt: new Date().toISOString(),
    }, req.user);

    if (!feedback) {
      return res.status(404).json({ error: 'Feedback not found' });
    }

    res.json({
      message: 'Feedback marked as read',
      feedback,
    });
  } catch (error) {
    logger.error('Error marking feedback as read:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const feedback = await insforgeDataService.deleteFeedback(req.params.id, req.user);
    if (!feedback) {
      return res.status(404).json({ error: 'Feedback not found' });
    }

    res.json({ message: 'Feedback deleted successfully' });
  } catch (error) {
    logger.error('Error deleting feedback:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/stats/overview', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const rows = await insforgeDataService.listFeedback(req.user);
    const byStatus = {};
    const byPriority = {};

    rows.forEach((feedback) => {
      byStatus[feedback.status] = (byStatus[feedback.status] || 0) + 1;
      byPriority[feedback.priority] = (byPriority[feedback.priority] || 0) + 1;
    });

    res.json({
      total: rows.length,
      byStatus,
      byPriority,
    });
  } catch (error) {
    logger.error('Error fetching feedback statistics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
