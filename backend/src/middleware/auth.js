import jwt from 'jsonwebtoken';
import { db } from '../db/connection.js';
import { agents } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { logger } from '../../utils/logger.js';

// Middleware to verify JWT token
export const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        error: 'No valid authorization token provided' 
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Fetch user details from database
      const user = await db
        .select({
          id: agents.id,
          email: agents.email,
          fullName: agents.fullName,
          role: agents.role,
          emailVerified: agents.emailVerified,
          isActive: agents.isActive,
        })
        .from(agents)
        .where(eq(agents.id, decoded.userId))
        .limit(1);

      if (user.length === 0) {
        return res.status(401).json({ error: 'User not found' });
      }

      const userRecord = user[0];

      // Check if user is verified and active
      if (!userRecord.emailVerified) {
        return res.status(401).json({ error: 'Account not verified' });
      }

      if (!userRecord.isActive) {
        return res.status(401).json({ error: 'Account is inactive' });
      }

      // Add user info to request object
      req.user = {
        id: userRecord.id,
        email: userRecord.email,
        fullName: userRecord.fullName,
        role: userRecord.role,
      };

      next();
    } catch (jwtError) {
      logger.error('JWT verification failed:', jwtError);
      return res.status(401).json({ error: 'Invalid token' });
    }
  } catch (error) {
    logger.error('Authentication middleware error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// Middleware to require specific role
export const requireRole = (requiredRole) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (req.user.role !== requiredRole) {
      return res.status(403).json({ 
        error: `Access denied. ${requiredRole} role required.` 
      });
    }

    next();
  };
};

// Middleware to require admin or specific user access
export const requireAdminOrSelf = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const targetUserId = req.params.userId || req.params.agentId;
  
  if (req.user.role === 'admin' || req.user.id === targetUserId) {
    next();
  } else {
    return res.status(403).json({ 
      error: 'Access denied. Admin role or self-access required.' 
    });
  }
};