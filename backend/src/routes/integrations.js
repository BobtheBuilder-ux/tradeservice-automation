import express from 'express';
import jwt from 'jsonwebtoken';
import { db } from '../config/index.js';
import { agentIntegrations, agents } from '../db/schema.js';
import { eq } from 'drizzle-orm';

const router = express.Router();

// JWT middleware (lighter than leads.js: does not require emailVerified)
const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }
    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await db
      .select({
        id: agents.id,
        agentId: agents.agentId,
        email: agents.email,
        firstName: agents.firstName,
        lastName: agents.lastName,
        role: agents.role,
        emailVerified: agents.emailVerified,
      })
      .from(agents)
      .where(eq(agents.id, decoded.userId))
      .limit(1);

    if (!user || user.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }

    req.user = user[0];
    next();
  } catch (error) {
    console.error('Token verification failed:', error);
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Helper: upsert agent integration tokens
async function upsertAgentIntegration(agentId, update) {
  const existing = await db
    .select()
    .from(agentIntegrations)
    .where(eq(agentIntegrations.agentId, agentId))
    .limit(1);

  if (existing && existing.length > 0) {
    const updated = await db
      .update(agentIntegrations)
      .set({ ...update, connectedAt: new Date() })
      .where(eq(agentIntegrations.agentId, agentId))
      .returning();
    return updated[0];
  } else {
    const inserted = await db
      .insert(agentIntegrations)
      .values({ agentId, ...update, connectedAt: new Date() })
      .returning();
    return inserted[0];
  }
}

// GET /api/integrations/status
router.get('/status', verifyToken, async (req, res) => {
  try {
    const rows = await db
      .select({
        calendlyAccessToken: agentIntegrations.calendlyAccessToken,
        zoomAccessToken: agentIntegrations.zoomAccessToken,
        zoomRefreshToken: agentIntegrations.zoomRefreshToken,
        connectedAt: agentIntegrations.connectedAt,
      })
      .from(agentIntegrations)
      .where(eq(agentIntegrations.agentId, req.user.id))
      .limit(1);

    const integ = rows[0] || {};
    res.json({
      calendly: {
        connected: Boolean(integ.calendlyAccessToken),
        connectedAt: integ.connectedAt || null,
      },
      zoom: {
        connected: Boolean(integ.zoomAccessToken),
        hasRefreshToken: Boolean(integ.zoomRefreshToken),
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

// GET /api/integrations/zoom/start
router.get('/zoom/start', verifyToken, async (req, res) => {
  try {
    const clientId = process.env.ZOOM_CLIENT_ID;
    const redirectBase = process.env.BACKEND_URL || 'http://localhost:3001';
    const redirectUri = `${redirectBase}/api/integrations/zoom/callback`;

    if (!clientId) {
      return res.status(400).json({ error: 'Zoom client ID not configured' });
    }

    // Set frontend callback URL for after OAuth completion
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const frontendCallback = `${frontendUrl}/integration-callback?platform=zoom`;

    const stateToken = jwt.sign({ userId: req.user.id, provider: 'zoom', redirect: frontendCallback }, process.env.JWT_SECRET, { expiresIn: '10m' });

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      state: stateToken,
    });

    const authorizeUrl = `https://zoom.us/oauth/authorize?${params.toString()}`;
    res.json({ url: authorizeUrl });
  } catch (error) {
    console.error('Error creating Zoom authorize URL:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/integrations/zoom/callback
router.get('/zoom/callback', async (req, res) => {
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

    const clientId = process.env.ZOOM_CLIENT_ID;
    const clientSecret = process.env.ZOOM_CLIENT_SECRET;
    const redirectBase = process.env.BACKEND_URL || 'http://localhost:3001';
    const redirectUri = `${redirectBase}/api/integrations/zoom/callback`;

    if (!clientId || !clientSecret) {
      return res.status(400).send('Zoom OAuth not configured');
    }

    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const tokenRes = await fetch(`https://zoom.us/oauth/token?grant_type=authorization_code&code=${encodeURIComponent(code)}&redirect_uri=${encodeURIComponent(redirectUri)}`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basicAuth}`,
      },
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error('Zoom token exchange failed:', errText);
      return res.status(500).send('Token exchange failed');
    }

    const tokenJson = await tokenRes.json();
    const accessToken = tokenJson.access_token;
    const refreshToken = tokenJson.refresh_token;

    if (!accessToken) {
      return res.status(500).send('No access token returned');
    }

    await upsertAgentIntegration(decoded.userId, {
      zoomAccessToken: accessToken,
      zoomRefreshToken: refreshToken || null,
    });

    if (decoded.redirect) {
      const url = new URL(decoded.redirect);
      url.searchParams.set('connected', 'zoom');
      return res.redirect(url.toString());
    }

    return res.send('Zoom connected successfully. You can close this window.');
  } catch (error) {
    console.error('Zoom OAuth callback error:', error);
    res.status(500).send('Internal server error');
  }
});

export default router;