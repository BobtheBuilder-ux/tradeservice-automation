import express from 'express';
import twilio from 'twilio';
import voiceCallScriptService from '../services/voice-call-script-service.js';
import voiceCallWorker from '../services/voice-call-worker.js';
import insforgeDataService from '../services/insforge-data-service.js';
import leadConversationService from '../services/lead-conversation-service.js';
import twilioSmsService from '../services/twilio-sms-service.js';
import logger from '../utils/logger.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = express.Router();

function getParam(req, key) {
  return req.body?.[key] || req.query?.[key];
}

function requireTwilioSignature(req, res, next) {
  const shouldValidate = process.env.NODE_ENV === 'production' && process.env.TWILIO_VALIDATE_WEBHOOKS !== 'false';
  if (!shouldValidate) {
    return next();
  }

  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const signature = req.get('x-twilio-signature');
  if (!authToken || !signature) {
    return res.status(403).send('Invalid Twilio signature');
  }

  const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
  const isValid = twilio.validateRequest(authToken, signature, url, req.body || {});
  if (!isValid) {
    return res.status(403).send('Invalid Twilio signature');
  }

  return next();
}

function buildGatherResponse({ prompt, actionId, leadId, conversationId, step }) {
  const response = new twilio.twiml.VoiceResponse();
  const gather = response.gather({
    input: 'speech dtmf',
    action: `/api/voice/gather?actionId=${encodeURIComponent(actionId || '')}&leadId=${encodeURIComponent(leadId || '')}&conversationId=${encodeURIComponent(conversationId || '')}&step=${encodeURIComponent(step || 'permission')}`,
    method: 'POST',
    speechTimeout: 'auto',
    timeout: 6,
  });
  gather.say({ voice: 'Polly.Joanna' }, prompt);
  response.say({ voice: 'Polly.Joanna' }, 'I did not hear a response. I will send the booking link by text if available. Thank you.');
  response.hangup();
  return response.toString();
}

function sendTwiML(res, twiml) {
  res.type('text/xml').send(twiml);
}

async function logCallReply({ action, lead, conversationId, step, reply, callSid }) {
  if (!lead) return null;
  return leadConversationService.logSystemEvent({
    lead,
    conversationId,
    channel: 'phone',
    messageType: 'call_transcript',
    subject: `Bob captured call reply: ${step}`,
    bodyText: reply || '(no reply captured)',
    metadata: {
      bobActionId: action?.id,
      callSid,
      step,
      direction: 'inbound',
    },
  });
}

router.post('/calls/start', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    if (process.env.VOICE_CALLING_ENABLED !== 'true') {
      return res.status(409).json({
        success: false,
        error: 'Voice calling is disabled. Set VOICE_CALLING_ENABLED=true after controlled testing.',
      });
    }

    const result = await voiceCallWorker.processQueuedCalls();
    return res.json({ success: true, result });
  } catch (error) {
    logger.error(error.message, { context: 'voice_calls_start', stack: error.stack });
    return res.status(500).json({ success: false, error: 'Failed to start queued calls' });
  }
});

router.post('/twiml/intro', requireTwilioSignature, async (req, res) => {
  try {
    const actionId = getParam(req, 'actionId');
    const leadId = getParam(req, 'leadId');
    const conversationId = getParam(req, 'conversationId');
    const lead = leadId ? await insforgeDataService.getLeadById(leadId) : null;
    const step = voiceCallScriptService.initialStep(lead || {});

    if (actionId) {
      const existingAction = await insforgeDataService.getBobActionById(actionId);
      await insforgeDataService.updateBobAction(actionId, {
        status: 'calling',
        result: {
          ...(existingAction?.result || {}),
          callSid: req.body?.CallSid,
          currentStep: step.step,
          providerStatus: 'answered',
        },
        updatedAt: new Date(),
      });
    }

    return sendTwiML(res, buildGatherResponse({ prompt: step.prompt, actionId, leadId, conversationId, step: step.step }));
  } catch (error) {
    logger.error(error.message, { context: 'voice_twiml_intro', stack: error.stack });
    const response = new twilio.twiml.VoiceResponse();
    response.say('Sorry, we could not start this call. A team member will follow up. Goodbye.');
    response.hangup();
    return sendTwiML(res, response.toString());
  }
});

router.post('/gather', requireTwilioSignature, async (req, res) => {
  try {
    const actionId = getParam(req, 'actionId');
    const leadId = getParam(req, 'leadId');
    const conversationId = getParam(req, 'conversationId');
    const currentStep = getParam(req, 'step') || 'permission';
    const reply = req.body?.SpeechResult || req.body?.Digits || '';
    const callSid = req.body?.CallSid;
    const [action, lead] = await Promise.all([
      actionId ? insforgeDataService.getBobActionById(actionId) : null,
      leadId ? insforgeDataService.getLeadById(leadId) : null,
    ]);

    await logCallReply({ action, lead, conversationId, step: currentStep, reply, callSid });
    const next = voiceCallScriptService.nextStep(currentStep, reply, { lead });
    const mergedExtracted = {
      ...(action?.result?.extracted || {}),
      ...(next.extracted || {}),
    };

    if (lead && next.extracted?.optedOut) {
      await insforgeDataService.updateLead(lead.id, {
        optedOut: true,
        automationPaused: true,
        requiresHumanReview: false,
        updatedAt: new Date(),
      });
    }

    if (lead && next.extracted?.serviceInterest) {
      await insforgeDataService.updateLead(lead.id, {
        serviceInterest: next.extracted.serviceInterest,
        qualificationStatus: 'partially_qualified',
        updatedAt: new Date(),
      });
    }

    if (lead && next.extracted?.locationSummary) {
      await insforgeDataService.updateLead(lead.id, {
        locationSummary: next.extracted.locationSummary,
        updatedAt: new Date(),
      });
    }

    if (lead && next.outcome === 'send_booking_link') {
      const bookingLink = process.env.CALENDLY_SCHEDULING_URL || process.env.CALENDLY_BOOKING_URL || process.env.CALENDLY_LINK;
      if (lead.phone && bookingLink) {
        await twilioSmsService.sendLeadBookingReminder(lead, bookingLink, `call_${callSid || actionId}`);
      }
    }

    if (actionId) {
      await insforgeDataService.updateBobAction(actionId, {
        status: next.done ? 'completed' : 'calling',
        executedAt: next.done ? new Date() : action?.executedAt || null,
        result: {
          ...(action?.result || {}),
          callSid,
          currentStep: next.step,
          outcome: next.outcome || null,
          extracted: mergedExtracted,
          lastReply: reply,
        },
        updatedAt: new Date(),
      });
    }

    if (conversationId) {
      await insforgeDataService.updateConversation(conversationId, {
        nextAction: next.done ? (next.outcome || 'call_completed') : next.step,
        lastSummary: `Bob call step ${currentStep}: ${reply || 'no reply captured'}`,
        updatedAt: new Date(),
      });
    }

    if (next.done) {
      const response = new twilio.twiml.VoiceResponse();
      response.say({ voice: 'Polly.Joanna' }, next.prompt);
      response.hangup();
      return sendTwiML(res, response.toString());
    }

    return sendTwiML(res, buildGatherResponse({ prompt: next.prompt, actionId, leadId, conversationId, step: next.step }));
  } catch (error) {
    logger.error(error.message, { context: 'voice_gather', stack: error.stack });
    const response = new twilio.twiml.VoiceResponse();
    response.say('Thank you. A team member will follow up. Goodbye.');
    response.hangup();
    return sendTwiML(res, response.toString());
  }
});

router.post('/status', requireTwilioSignature, async (req, res) => {
  try {
    const actionId = getParam(req, 'actionId');
    const callStatus = req.body?.CallStatus;
    if (actionId) {
      const existingAction = await insforgeDataService.getBobActionById(actionId);
      const terminalStatus = ['completed', 'busy', 'failed', 'no-answer', 'canceled'].includes(callStatus);
      await insforgeDataService.updateBobAction(actionId, {
        status: callStatus === 'completed' ? 'completed' : terminalStatus ? 'deferred' : 'calling',
        result: {
          ...(existingAction?.result || {}),
          callSid: req.body?.CallSid,
          providerStatus: callStatus,
          callDuration: req.body?.CallDuration || null,
        },
        updatedAt: new Date(),
      });
    }
    return res.json({ success: true });
  } catch (error) {
    logger.error(error.message, { context: 'voice_status', stack: error.stack });
    return res.status(500).json({ success: false });
  }
});

export default router;
export { buildGatherResponse };
