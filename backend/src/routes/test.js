import express from 'express';
import twilio from 'twilio';
import bobOrchestrator from '../services/bob-orchestrator.js';
import insforgeDataService from '../services/insforge-data-service.js';

const router = express.Router();

function requirePhone(value, fieldName) {
  const normalized = String(value || '').trim();
  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
    const error = new Error(`${fieldName} must be an E.164 phone number, like +14384838093`);
    error.statusCode = 400;
    throw error;
  }
  return normalized;
}

function requireHttpUrl(value, fieldName) {
  const normalized = String(value || '').trim();
  try {
    const url = new URL(normalized);
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error('Invalid protocol');
    }
    return url.toString();
  } catch {
    const error = new Error(`${fieldName} must be a valid HTTP or HTTPS URL`);
    error.statusCode = 400;
    throw error;
  }
}

router.get('/agents', async (req, res) => {
  try {
    const agents = await insforgeDataService.listAvailableAgents();
    res.json({ agents });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to fetch test agents' });
  }
});

router.post('/lead', async (req, res) => {
  try {
    const {
      email,
      firstName,
      lastName,
      phone,
      source = 'manual_test',
      priority = 'medium',
      assignedAgentId,
      qualificationStatus = 'unqualified',
      qualificationScore,
      leadStage = 'new_inquiry',
      schedulingState = 'not_started',
      preferredContactChannel = 'email',
      preferredMeetingWindow,
      serviceInterest,
      timeline,
      budgetRange,
      locationSummary,
      qualificationNotes,
      runAutomation = false,
    } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existingLead = await insforgeDataService.getLeadByEmail(normalizedEmail);

    if (existingLead) {
      return res.status(409).json({ error: 'Lead with this email already exists' });
    }

    const newLead = await insforgeDataService.createLead({
      email: normalizedEmail,
      firstName: firstName || null,
      lastName: lastName || null,
      phone: phone || null,
      source,
      priority,
      status: 'new',
      assignedAgentId: assignedAgentId || null,
      qualificationStatus,
      qualificationScore: qualificationScore === '' || qualificationScore === undefined ? 0 : Number(qualificationScore),
      leadStage,
      schedulingState,
      preferredContactChannel,
      preferredMeetingWindow: preferredMeetingWindow || null,
      serviceInterest: serviceInterest || null,
      timeline: timeline || null,
      budgetRange: budgetRange || null,
      locationSummary: locationSummary || null,
      qualificationNotes: qualificationNotes || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    let automation = null;
    if (runAutomation) {
      automation = await bobOrchestrator.syncLead(newLead);
    }

    res.status(201).json({
      message: 'Test lead created successfully',
      lead: newLead,
      automation,
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to create test lead' });
  }
});

router.post('/twilio-call', async (req, res) => {
  try {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    if (!accountSid || !authToken) {
      return res.status(500).json({ error: 'Twilio credentials are not configured' });
    }

    const to = requirePhone(req.body.to, 'To');
    const from = requirePhone(req.body.from || process.env.TWILIO_PHONE_NUMBER, 'From');
    const url = requireHttpUrl(req.body.url || 'http://demo.twilio.com/docs/voice.xml', 'TwiML URL');

    const client = twilio(accountSid, authToken);
    const call = await client.calls.create({ to, from, url });

    res.status(201).json({
      success: true,
      call: {
        sid: call.sid,
        status: call.status,
        direction: call.direction,
        from: call.from,
        to: call.to,
        queueTime: call.queueTime,
        uri: call.uri,
      },
    });
  } catch (error) {
    const statusCode = error.statusCode || error.status || 500;
    res.status(statusCode).json({
      error: error.message || 'Failed to create Twilio test call',
      code: error.code || null,
    });
  }
});

export default router;
