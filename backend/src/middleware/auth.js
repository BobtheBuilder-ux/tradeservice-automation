import { authenticateInsForgeRequest, assertPortalAccess } from '../services/insforge-auth-service.js';
import { logger } from '../../utils/logger.js';

export const authenticateToken = async (req, res, next) => {
  try {
    req.user = await authenticateInsForgeRequest(req);
    next();
  } catch (error) {
    if (error.statusCode === 401) {
      return res.status(401).json({ error: 'Session expired. Please sign in again.' });
    }

    logger.error('InsForge authentication middleware error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const requireRole = (requiredRole) => {
  return (req, res, next) => {
    try {
      assertPortalAccess(req.user, requiredRole);
      next();
    } catch (error) {
      return res.status(error.statusCode || 403).json({ error: error.message || 'Access denied' });
    }
  };
};

export const requireAdminOrSelf = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const targetUserId = req.params.userId || req.params.agentId;
  if (req.user.role === 'admin' || req.user.id === targetUserId || req.user.authUserId === targetUserId) {
    return next();
  }

  return res.status(403).json({ error: 'Access denied. Admin role or self-access required.' });
};
