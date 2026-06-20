import express from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import tenantIdentityService from '../services/tenant-identity-service.js';

const router = express.Router();
const verifyTenantAdmin = [authenticateToken, requireRole('admin')];

function handleRouteError(res, error, fallback = 'Internal server error') {
  const statusCode = error.statusCode || 500;
  if (statusCode >= 500) {
    console.error('Tenant settings route error:', error);
  }
  return res.status(statusCode).json({ success: false, error: statusCode >= 500 ? fallback : error.message });
}

router.get('/summary', verifyTenantAdmin, async (req, res) => {
  try {
    const summary = await tenantIdentityService.getSettingsSummary(req.user);
    res.json({ success: true, ...summary });
  } catch (error) {
    handleRouteError(res, error, 'Failed to load tenant settings');
  }
});

router.get('/agents', verifyTenantAdmin, async (req, res) => {
  try {
    const agents = await tenantIdentityService.listAgents(req.user);
    res.json({ success: true, agents });
  } catch (error) {
    handleRouteError(res, error, 'Failed to load AI agents');
  }
});

router.post('/agents', verifyTenantAdmin, async (req, res) => {
  try {
    const agent = await tenantIdentityService.createAgent(req.body, req.user);
    res.status(201).json({ success: true, agent });
  } catch (error) {
    handleRouteError(res, error, 'Failed to create AI agent');
  }
});

router.post('/agents/default', verifyTenantAdmin, async (req, res) => {
  try {
    const agent = await tenantIdentityService.ensureDefaultTenantAgent(req.user);
    res.json({ success: true, agent });
  } catch (error) {
    handleRouteError(res, error, 'Failed to create default AI agent');
  }
});

router.patch('/agents/:agentId', verifyTenantAdmin, async (req, res) => {
  try {
    const agent = await tenantIdentityService.updateAgent(req.params.agentId, req.body, req.user);
    if (!agent) {
      return res.status(404).json({ success: false, error: 'AI agent not found' });
    }
    res.json({ success: true, agent });
  } catch (error) {
    handleRouteError(res, error, 'Failed to update AI agent');
  }
});

router.post('/agents/:agentId/archive', verifyTenantAdmin, async (req, res) => {
  try {
    const agent = await tenantIdentityService.archiveAgent(req.params.agentId, req.user);
    if (!agent) {
      return res.status(404).json({ success: false, error: 'AI agent not found' });
    }
    res.json({ success: true, agent });
  } catch (error) {
    handleRouteError(res, error, 'Failed to archive AI agent');
  }
});

router.post('/agents/:agentId/assign-lead', verifyTenantAdmin, async (req, res) => {
  try {
    const lead = await tenantIdentityService.assignLeadToAgent(req.body.leadId, req.params.agentId, req.user);
    res.json({ success: true, lead });
  } catch (error) {
    handleRouteError(res, error, 'Failed to assign lead');
  }
});

router.put('/email-identity', verifyTenantAdmin, async (req, res) => {
  try {
    const emailIdentity = await tenantIdentityService.upsertEmailIdentity(req.body, req.user);
    res.json({ success: true, emailIdentity });
  } catch (error) {
    handleRouteError(res, error, 'Failed to save email identity');
  }
});

router.put('/booking-integration', verifyTenantAdmin, async (req, res) => {
  try {
    const bookingIntegration = await tenantIdentityService.upsertBookingIntegration(req.body, req.user);
    res.json({ success: true, bookingIntegration });
  } catch (error) {
    handleRouteError(res, error, 'Failed to save booking integration');
  }
});

export default router;
