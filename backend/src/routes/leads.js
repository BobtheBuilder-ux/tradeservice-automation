import express from 'express';
import { db } from '../config/index.js';
import { leads, agents } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';
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

// GET /api/leads - Get all leads
router.get('/', verifyToken, async (req, res) => {
  try {
    const leadsData = await db.select()
      .from(leads)
      .orderBy(desc(leads.createdAt));

    res.json({ leads: leadsData || [] });
  } catch (error) {
    console.error('Error in leads route:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;