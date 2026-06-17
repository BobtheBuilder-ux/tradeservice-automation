import express from 'express';
import jwt from 'jsonwebtoken';
import { authenticateToken } from '../middleware/auth.js';
import { getJwtSecret } from '../utils/auth-config.js';
import insforgeDataService from '../services/insforge-data-service.js';

const router = express.Router();
const JWT_SECRET = getJwtSecret();

const verifyToken = authenticateToken;

// Helper: upsert agent integration tokens
async function upsertAgentIntegration(agentId, update) {
  return insforgeDataService.upsertAgentIntegration(agentId, update);
}

// GET /api/integrations/status
router.get('/status', verifyToken, async (req, res) => {
  try {
    const integ = await insforgeDataService.getAgentIntegration(req.user.id) || {};
    res.json({
      calendly: {
        connected: Boolean(integ.calendlyAccessToken),
        connectedAt: integ.connectedAt || null,
      },
    });
  } catch (error) {
    console.error('Error fetching integration status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/integrations/calendly/start
router.get('/calendly/start', verifyToken, async (req, res) => {
  try {
    const clientId = process.env.CALENDLY_CLIENT_ID;
    const redirectBase = process.env.BACKEND_URL || 'http://localhost:3001';
    const redirectUri = `${redirectBase}/api/integrations/calendly/callback`;

    if (!clientId) {
      return res.status(400).json({ error: 'Calendly client ID not configured' });
    }

    // Set frontend callback URL for after OAuth completion
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const frontendCallback = `${frontendUrl}/integration-callback?platform=calendly`;

    // Encode state with JWT to avoid server-side storage
    const statePayload = { userId: req.user.id, provider: 'calendly', redirect: frontendCallback };
    const stateToken = jwt.sign(statePayload, process.env.JWT_SECRET, { expiresIn: '10m' });

    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      state: stateToken,
    });

    const authorizeUrl = `https://auth.calendly.com/oauth/authorize?${params.toString()}`;
    res.json({ url: authorizeUrl });
  } catch (error) {
    console.error('Error creating Calendly authorize URL:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/integrations/calendly/callback
router.get('/calendly/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    if (!code || !state) {
      return res.status(400).send('Missing code or state');
    }

    let decoded;
    try {
      decoded = jwt.verify(state, process.env.JWT_SECRET);
    } catch (e) {
      return res.status(400).send('Invalid state');
    }

    const clientId = process.env.CALENDLY_CLIENT_ID;
    const clientSecret = process.env.CALENDLY_CLIENT_SECRET;
    const redirectBase = process.env.BACKEND_URL || 'http://localhost:3001';
    const redirectUri = `${redirectBase}/api/integrations/calendly/callback`;

    if (!clientId || !clientSecret) {
      return res.status(400).send('Calendly OAuth not configured');
    }

    const tokenRes = await fetch('https://auth.calendly.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error('Calendly token exchange failed:', errText);
      return res.status(500).send('Token exchange failed');
    }

    const tokenJson = await tokenRes.json();
    const accessToken = tokenJson.access_token;

    if (!accessToken) {
      return res.status(500).send('No access token returned');
    }

    await upsertAgentIntegration(decoded.userId, {
      calendlyAccessToken: accessToken,
    });

    // Redirect back to frontend if provided
    if (decoded.redirect) {
      const url = new URL(decoded.redirect);
      url.searchParams.set('connected', 'calendly');
      return res.redirect(url.toString());
    }

    return res.send('Calendly connected successfully. You can close this window.');
  } catch (error) {
    console.error('Calendly OAuth callback error:', error);
    res.status(500).send('Internal server error');
  }
});


export default router;
