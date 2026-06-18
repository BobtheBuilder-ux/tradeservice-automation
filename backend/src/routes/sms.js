import express from 'express';
import twilio from 'twilio';
import insforgeDataService from '../services/insforge-data-service.js';
import leadConversationService from '../services/lead-conversation-service.js';
import logger from '../utils/logger.js';
import { hashForLogging } from '../utils/crypto.js';

const router = express.Router();
const STOP_PATTERNS = [/\bstop\b/i, /unsubscribe/i, /do not contact/i, /don't text/i, /don't call/i, /not interested/i];

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

function isStopReply(body = '') {
  return STOP_PATTERNS.some((pattern) => pattern.test(String(body || '')));
}

router.post('/inbound', requireTwilioSignature, async (req, res) => {
  try {
    const from = req.body?.From;
    const body = req.body?.Body || '';
    const messageSid = req.body?.MessageSid || req.body?.SmsMessageSid || null;
    const lead = await insforgeDataService.getLeadByPhone(from);

    if (!lead) {
      logger.warn('Inbound SMS received for unknown lead phone', {
        context: 'sms_inbound',
        from: from ? hashForLogging(from) : 'unknown',
        messageSid,
      });
      return res.type('text/xml').send(new twilio.twiml.MessagingResponse().toString());
    }

    const conversation = await leadConversationService.ensurePrimaryConversation(lead, 'sms');
    await leadConversationService.logMessage({
      leadId: lead.id,
      conversationId: conversation.id,
      direction: 'inbound',
      channel: 'sms',
      messageType: 'sms_reply',
      bodyText: body,
      status: 'received',
      providerMessageId: messageSid,
      metadata: {
        from: hashForLogging(from),
        to: req.body?.To ? hashForLogging(req.body.To) : null,
        providerStatus: req.body?.SmsStatus || null,
      },
    });

    const stopReply = isStopReply(body);
    await leadConversationService.updateConversation(conversation.id, {
      lastInboundAt: new Date(),
      conversationStatus: stopReply ? 'closed_opted_out' : 'lead_replied_sms',
      nextAction: stopReply ? 'do_not_contact' : 'review_sms_reply',
      nextActionAt: null,
      lastIntent: 'sms_reply',
      lastIntentAt: new Date(),
      lastSummary: stopReply ? 'Lead opted out by SMS reply.' : `Lead replied by SMS: ${body}`,
      humanReviewRequired: !stopReply,
      metadata: {
        ...(conversation.metadata || {}),
        lastSmsReplyAt: new Date().toISOString(),
        lastSmsReplyProviderMessageId: messageSid,
        smsOptIn: stopReply ? false : conversation.metadata?.smsOptIn,
      },
    });

    if (stopReply) {
      await insforgeDataService.updateLead(lead.id, {
        optedOut: true,
        automationPaused: true,
        requiresHumanReview: false,
        updatedAt: new Date(),
      });
    } else {
      await insforgeDataService.updateLead(lead.id, {
        lastContactedAt: new Date(),
        requiresHumanReview: true,
        escalationReason: 'sms_reply_needs_review',
        updatedAt: new Date(),
      });
    }

    return res.type('text/xml').send(new twilio.twiml.MessagingResponse().toString());
  } catch (error) {
    logger.error(error.message, { context: 'sms_inbound', stack: error.stack });
    return res.status(500).send('SMS webhook failed');
  }
});

router.post('/status', requireTwilioSignature, async (req, res) => {
  try {
    const to = req.body?.To;
    const messageSid = req.body?.MessageSid || req.body?.SmsSid || null;
    const status = req.body?.MessageStatus || req.body?.SmsStatus || null;
    const lead = await insforgeDataService.getLeadByPhone(to);

    if (lead) {
      const conversation = await leadConversationService.ensurePrimaryConversation(lead, 'sms');
      await leadConversationService.logSystemEvent({
        lead,
        conversationId: conversation.id,
        channel: 'sms',
        messageType: 'sms_delivery_status',
        subject: `SMS delivery status: ${status || 'unknown'}`,
        bodyText: `Twilio message ${messageSid || 'unknown'} status is ${status || 'unknown'}.`,
        metadata: {
          providerMessageId: messageSid,
          status,
          errorCode: req.body?.ErrorCode || null,
          errorMessage: req.body?.ErrorMessage || null,
        },
      });
    } else {
      logger.info('SMS status callback received for unknown lead phone', {
        context: 'sms_status',
        to: to ? hashForLogging(to) : 'unknown',
        messageSid,
        status,
      });
    }

    return res.json({ success: true });
  } catch (error) {
    logger.error(error.message, { context: 'sms_status', stack: error.stack });
    return res.status(500).json({ success: false });
  }
});

export default router;
export { isStopReply };
