import express from 'express';
import twilio from 'twilio';
import bobOrchestrator from '../services/bob-orchestrator.js';
import bobActionExecutor from '../services/bob-action-executor.js';
import insforgeDataService from '../services/insforge-data-service.js';
import leadConversationService from '../services/lead-conversation-service.js';
import voiceCallWorker from '../services/voice-call-worker.js';
import { generateTrackingId } from '../utils/crypto.js';

const router = express.Router();
const LIVE_TEST_CONFIRMATION = 'RUN LIVE TEST';

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

function requireEmail(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    const error = new Error('Email must be a valid email address');
    error.statusCode = 400;
    throw error;
  }
  return normalized;
}

function minutesFrom(now, minutes) {
  return new Date(now.getTime() + minutes * 60 * 1000);
}

function buildLiveTestPlan({ includeEmail, includeSms, includeCall }) {
  const plan = [];

  if (includeEmail) {
    plan.push({
      offsetMinutes: 0,
      actionType: 'send_booking_invite',
      channel: 'email',
      reason: 'Live 15-minute test: initial booking email',
    });
  }

  if (includeSms) {
    plan.push({
      offsetMinutes: 6,
      actionType: 'send_sms_reminder',
      channel: 'sms',
      reason: 'Live 15-minute test: SMS booking outreach',
    });
  }

  if (includeCall) {
    plan.push({
      offsetMinutes: 10,
      actionType: 'queue_call_attempt',
      channel: 'phone',
      reason: 'Live 15-minute test: queued Bob voice call',
    });
  }

  return plan;
}

async function buildLiveTestStatus({ leadId, conversationId }) {
  const [lead, conversation, actions, messages] = await Promise.all([
    insforgeDataService.getLeadById(leadId),
    conversationId ? insforgeDataService.getConversationById(conversationId) : null,
    insforgeDataService.listBobActions(10000),
    conversationId ? insforgeDataService.listConversationMessages(conversationId, 100) : [],
  ]);

  const leadActions = actions
    .filter((action) => action.leadId === leadId)
    .sort((a, b) => new Date(a.scheduledFor || a.createdAt || 0).getTime() - new Date(b.scheduledFor || b.createdAt || 0).getTime());

  return {
    lead,
    conversation,
    actions: leadActions,
    messages,
    workerStatus: {
      bobActionExecutor: bobActionExecutor.getStatus(),
      voiceCallWorker: voiceCallWorker.getStatus(),
    },
  };
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

router.post('/live-automation-run', async (req, res) => {
  try {
    const {
      email,
      firstName,
      lastName,
      phone,
      serviceInterest,
      locationSummary,
      preferredMeetingWindow,
      includeEmail = true,
      includeSms = true,
      includeCall = true,
      smsConsent = false,
      confirmationText,
      startImmediately = true,
    } = req.body;

    if (confirmationText !== LIVE_TEST_CONFIRMATION) {
      return res.status(400).json({ error: `Type ${LIVE_TEST_CONFIRMATION} to confirm this live automation test` });
    }

    const normalizedEmail = requireEmail(email);
    const needsPhone = includeSms || includeCall;
    const needsSmsConsent = includeSms;
    const normalizedPhone = needsPhone ? requirePhone(phone, 'Phone') : String(phone || '').trim();
    if (needsSmsConsent && smsConsent !== true) {
      return res.status(400).json({ error: 'SMS consent must be checked before sending live SMS' });
    }

    const existingLead = await insforgeDataService.getLeadByEmail(normalizedEmail);
    if (existingLead) {
      return res.status(409).json({ error: 'Lead with this email already exists. Use a fresh test email.' });
    }

    const now = new Date();
    const runId = `live_test_${generateTrackingId()}`;
    const plan = buildLiveTestPlan({ includeEmail, includeSms, includeCall });
    if (plan.length === 0) {
      return res.status(400).json({ error: 'Select at least one automation channel to test' });
    }

    const lead = await insforgeDataService.createLead({
      email: normalizedEmail,
      firstName: firstName || 'Live',
      lastName: lastName || 'Test',
      phone: normalizedPhone || null,
      source: 'live_automation_test',
      priority: 'high',
      status: 'new',
      qualificationStatus: 'qualified',
      qualificationScore: 85,
      leadStage: 'ready_to_book',
      schedulingState: 'not_started',
      preferredContactChannel: includeCall ? 'phone' : includeSms ? 'sms' : 'email',
      preferredMeetingWindow: preferredMeetingWindow || 'During the next 15-minute live test window',
      serviceInterest: serviceInterest || 'Trade service consultation',
      locationSummary: locationSummary || null,
      qualificationNotes: `Live automation test run ${runId}`,
      trackingId: runId,
      createdAt: now,
      updatedAt: now,
    });

    const conversation = await leadConversationService.ensurePrimaryConversation(lead, 'email');
    await leadConversationService.updateConversation(conversation.id, {
      metadata: {
        ...(conversation.metadata || {}),
        liveTestRunId: runId,
        liveTestStartedAt: now.toISOString(),
        liveTestEndsAt: minutesFrom(now, 15).toISOString(),
        smsOptIn: includeSms ? true : conversation.metadata?.smsOptIn,
      },
      conversationStatus: 'live_test_running',
      nextAction: 'live_automation_test',
      nextActionAt: now,
      lastIntent: 'live_automation_test_started',
      lastIntentAt: now,
      lastSummary: 'Live 15-minute automation test started.',
    });

    const actions = [];
    for (const item of plan) {
      const action = await insforgeDataService.createBobAction({
        leadId: lead.id,
        conversationId: conversation.id,
        actionType: item.actionType,
        channel: item.channel,
        status: 'pending',
        reason: item.reason,
        payload: {
          liveTestRunId: runId,
          offsetMinutes: item.offsetMinutes,
          durationMinutes: 15,
          createdBy: 'public_live_test_form',
        },
        scheduledFor: minutesFrom(now, item.offsetMinutes),
      });
      actions.push(action);
    }

    let tick = null;
    if (startImmediately) {
      const executor = await bobActionExecutor.processDueActions();
      const voice = process.env.VOICE_CALLING_ENABLED === 'true'
        ? await voiceCallWorker.processQueuedCalls()
        : { disabled: true, reason: 'VOICE_CALLING_ENABLED is not true' };
      tick = { executor, voice };
    }

    res.status(201).json({
      success: true,
      runId,
      durationMinutes: 15,
      lead,
      conversation,
      plan,
      actions,
      tick,
      status: await buildLiveTestStatus({ leadId: lead.id, conversationId: conversation.id }),
    });
  } catch (error) {
    const statusCode = error.statusCode || error.status || 500;
    res.status(statusCode).json({ error: error.message || 'Failed to start live automation test' });
  }
});

router.post('/live-automation-run/:leadId/tick', async (req, res) => {
  try {
    const { leadId } = req.params;
    const conversationId = req.body?.conversationId || req.query?.conversationId;
    const executor = await bobActionExecutor.processDueActions();
    const voice = process.env.VOICE_CALLING_ENABLED === 'true'
      ? await voiceCallWorker.processQueuedCalls()
      : { disabled: true, reason: 'VOICE_CALLING_ENABLED is not true' };

    res.json({
      success: true,
      tick: { executor, voice },
      status: await buildLiveTestStatus({ leadId, conversationId }),
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to process live automation tick' });
  }
});

router.get('/live-automation-run/:leadId/status', async (req, res) => {
  try {
    const { leadId } = req.params;
    const conversationId = req.query.conversationId;
    res.json({
      success: true,
      status: await buildLiveTestStatus({ leadId, conversationId }),
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to fetch live automation status' });
  }
});

router.post('/live-automation-run/:leadId/actions/:actionId/skip', async (req, res) => {
  try {
    const { leadId, actionId } = req.params;
    const conversationId = req.body?.conversationId || req.query?.conversationId;
    const action = await insforgeDataService.getBobActionById(actionId);

    if (!action || action.leadId !== leadId) {
      return res.status(404).json({ error: 'Action not found for this live test run' });
    }

    if (!['pending', 'deferred', 'awaiting_call'].includes(action.status)) {
      return res.status(409).json({ error: `Cannot skip action with status ${action.status}` });
    }

    const now = new Date();
    await insforgeDataService.updateBobAction(action.id, {
      status: 'skipped',
      executedAt: now,
      updatedAt: now,
      result: {
        ...(action.result || {}),
        skippedAt: now.toISOString(),
        skippedBy: 'live_automation_test',
        skipReason: req.body?.reason || 'Skipped from live automation test flow',
      },
    });

    const lead = await insforgeDataService.getLeadById(leadId);
    if (lead && conversationId) {
      await leadConversationService.logSystemEvent({
        lead,
        conversationId,
        channel: 'system',
        messageType: 'live_test_action_skipped',
        subject: 'Live test action skipped',
        bodyText: `Skipped ${action.actionType} in the live automation test flow.`,
        metadata: {
          bobActionId: action.id,
          actionType: action.actionType,
          previousStatus: action.status,
        },
      });
    }

    res.json({
      success: true,
      status: await buildLiveTestStatus({ leadId, conversationId }),
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to skip live automation action' });
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
