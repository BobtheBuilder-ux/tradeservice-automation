import express from 'express';
import twilio from 'twilio';
import voiceCallScriptService from '../services/voice-call-script-service.js';
import {
  buildCompletedCallActionPatch,
  buildTerminalCallActionPatch,
  shouldSendPostCallBookingSms,
} from '../services/voice-call-outcome-service.js';
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
  gather.say(voiceCallScriptService.getSayOptions(), prompt);
  response.say(voiceCallScriptService.getSayOptions(), 'I did not hear a response. I will send the booking link by text if available. Thank you.');
  response.hangup();
  return response.toString();
}

function sendTwiML(res, twiml) {
  res.type('text/xml').send(twiml);
}

function getBookingLink() {
  return process.env.CALENDLY_SCHEDULING_URL || process.env.CALENDLY_BOOKING_URL || process.env.CALENDLY_LINK;
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

async function sendCallFollowUpSms({ lead, action, conversationId, outcome, callSid }) {
  if (!lead?.phone) return null;
  const bookingLink = getBookingLink();
  if (!bookingLink) return null;

  const trackingId = `call_${callSid || action?.id || lead.id}`;
  const smsResult = outcome === 'callback_requested'
    ? await twilioSmsService.sendCallbackConfirmation(lead, bookingLink, trackingId)
    : await twilioSmsService.sendLeadBookingReminder(lead, bookingLink, trackingId);

  if (conversationId) {
    await leadConversationService.logSystemEvent({
      lead,
      conversationId,
      channel: 'sms',
      messageType: outcome === 'callback_requested' ? 'callback_confirmation_sms' : 'booking_link_sms',
      subject: smsResult.success ? 'Bob sent an SMS follow-up after the call' : 'Bob could not send SMS follow-up after the call',
      bodyText: smsResult.success ? smsResult.message : `SMS failed after call: ${smsResult.error}`,
      metadata: {
        bobActionId: action?.id,
        callSid: callSid || null,
        outcome,
        providerMessageId: smsResult.messageSid || null,
        status: smsResult.status || null,
        success: smsResult.success,
      },
    });
  }

  return smsResult;
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

    const smsResult = next.done && ['send_booking_link', 'callback_requested'].includes(next.outcome)
      ? await sendCallFollowUpSms({ lead, action, conversationId, outcome: next.outcome, callSid })
      : null;

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
          bookingSmsAttempted: smsResult ? true : action?.result?.bookingSmsAttempted || false,
          bookingSmsSent: smsResult ? Boolean(smsResult.success) : action?.result?.bookingSmsSent || false,
          bookingSmsMessageSid: smsResult?.messageSid || action?.result?.bookingSmsMessageSid || null,
          bookingSmsStatus: smsResult?.status || action?.result?.bookingSmsStatus || null,
          bookingSmsError: smsResult?.success === false ? smsResult.error : action?.result?.bookingSmsError || null,
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
      response.say(voiceCallScriptService.getSayOptions(), next.prompt);
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
      const lead = existingAction?.leadId ? await insforgeDataService.getLeadById(existingAction.leadId) : null;
      const terminalStatus = ['completed', 'busy', 'failed', 'no-answer', 'canceled'].includes(callStatus);
      let smsResult = null;

      if (lead && shouldSendPostCallBookingSms(existingAction, callStatus)) {
        const bookingLink = getBookingLink();
        if (bookingLink) {
          smsResult = await twilioSmsService.sendLeadBookingReminder(lead, bookingLink, `post_call_${req.body?.CallSid || actionId}`);
          if (existingAction?.conversationId) {
            await leadConversationService.logSystemEvent({
              lead,
              conversationId: existingAction.conversationId,
              channel: 'sms',
              messageType: 'post_call_booking_sms',
              subject: smsResult.success ? 'Bob sent the booking link after the call' : 'Bob could not send the booking link after the call',
              bodyText: smsResult.success ? smsResult.message : `SMS failed after call: ${smsResult.error}`,
              metadata: {
                bobActionId: actionId,
                callSid: req.body?.CallSid || null,
                providerMessageId: smsResult.messageSid || null,
                status: smsResult.status || null,
                success: smsResult.success,
              },
            });
          }
        }
      }

      if (callStatus === 'completed') {
        await insforgeDataService.updateBobAction(actionId, buildCompletedCallActionPatch({
          action: existingAction,
          callSid: req.body?.CallSid,
          callStatus,
          callDuration: req.body?.CallDuration || null,
          smsResult,
        }));
      } else if (terminalStatus) {
        const patch = buildTerminalCallActionPatch({
          action: existingAction,
          callSid: req.body?.CallSid,
          callStatus,
          callDuration: req.body?.CallDuration || null,
        });
        await insforgeDataService.updateBobAction(actionId, patch);

        if (lead && patch.result.retryExhausted) {
          await insforgeDataService.updateLead(lead.id, {
            requiresHumanReview: true,
            escalationReason: `voice_call_${callStatus || 'failed'}_retry_limit`,
            updatedAt: new Date(),
          });
        }

        if (existingAction?.conversationId) {
          await insforgeDataService.updateConversation(existingAction.conversationId, {
            nextAction: patch.result.retryExhausted ? 'needs_human_review' : 'retry_voice_call',
            nextActionAt: patch.scheduledFor || null,
            lastSummary: patch.result.retryExhausted
              ? `Bob voice call ended with ${callStatus}; retry limit reached.`
              : `Bob voice call ended with ${callStatus}; retry scheduled.`,
            updatedAt: new Date(),
          });
        }
      } else {
        await insforgeDataService.updateBobAction(actionId, {
          status: terminalStatus ? 'awaiting_call' : 'calling',
          result: {
            ...(existingAction?.result || {}),
            callSid: req.body?.CallSid,
            providerStatus: callStatus,
            callDuration: req.body?.CallDuration || null,
          },
          updatedAt: new Date(),
        });
      }
    }
    return res.json({ success: true });
  } catch (error) {
    logger.error(error.message, { context: 'voice_status', stack: error.stack });
    return res.status(500).json({ success: false });
  }
});

export default router;
export { buildGatherResponse };
