import express from 'express';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

router.get('/me', authenticateToken, async (req, res) => {
  res.json({
    success: true,
    user: req.user,
  });
});

router.post('/logout', async (req, res) => {
  res.json({
    success: true,
    message: 'Logged out successfully',
  });
});

export default router;
