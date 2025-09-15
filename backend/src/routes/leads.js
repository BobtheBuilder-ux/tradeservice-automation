import express from 'express';
import { supabase } from '../config/index.js';
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
    const { data: user, error } = await supabase
      .from('users')
      .select('id, name, email, role, email_verified')
      .eq('id', decoded.userId)
      .single();

    if (error || !user) {
      return res.status(401).json({ error: 'User not found' });
    }

    if (!user.email_verified) {
      return res.status(401).json({ error: 'Email not verified' });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Token verification failed:', error);
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// GET /api/leads - Get all leads
router.get('/', verifyToken, async (req, res) => {
  try {
    const { data: leads, error } = await supabase
      .from('leads')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching leads:', error);
      return res.status(500).json({ error: 'Failed to fetch leads' });
    }

    res.json({ leads: leads || [] });
  } catch (error) {
    console.error('Error in leads route:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;