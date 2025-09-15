import express from 'express';
import { verifyCalendlySignature, generateTrackingId } from '../utils/crypto.js';
import { calendlyConfig } from '../config/index.js';
import logger from '../utils/logger.js';
import { processCalendlyEvent } from '../services/calendly-service.js';

const router = express.Router();

/**
 * Calendly webhook event handler
 * POST /webhook/calendly
 */
router.post('/', express.raw({ type: 'application/json' }), async (req, res) => {
  const signature = req.get('Calendly-Webhook-Signature');
  const body = req.body;
  const trackingId = generateTrackingId();

  logger.logRequest(req, { trackingId, hasSignature: !!signature });

  try {
    // Verify the webhook signature if secret is configured
    if (calendlyConfig.webhookSecret) {
      if (!verifyCalendlySignature(body, signature, calendlyConfig.webhookSecret)) {
        logger.warn('Calendly webhook signature verification failed', {
          trackingId,
          signature: signature ? 'provided' : 'missing'
        });
        return res.sendStatus(401);
      }
      logger.info('Calendly webhook signature verified', { trackingId });
    } else {
      logger.warn('Calendly webhook secret not configured, skipping signature verification', {
        trackingId
      });
    }

    // Parse the webhook payload
    let webhookData;
    try {
      webhookData = JSON.parse(body.toString());
    } catch (parseError) {
      logger.error('Failed to parse Calendly webhook payload', {
        trackingId,
        error: parseError.message
      });
      return res.sendStatus(400);
    }

    logger.info('Calendly webhook payload received', {
      trackingId,
      event: webhookData.event,
      eventType: webhookData.payload?.event_type?.name,
      inviteeEmail: webhookData.payload?.invitee?.email ? '[PROVIDED]' : '[MISSING]'
    });

    // Process the webhook event
    try {
      await processCalendlyEvent(webhookData, trackingId);
      logger.logLeadProcessing(trackingId, 'calendly_processing_completed');
    } catch (processingError) {
      logger.logError(processingError, {
        context: 'calendly_event_processing',
        trackingId,
        event: webhookData.event
      });
      // Continue and respond with 200 to prevent retries
    }

    // Always respond with 200 to acknowledge receipt
    res.sendStatus(200);
    logger.logResponse(req, res, { trackingId });

  } catch (error) {
    logger.logError(error, {
      context: 'calendly_webhook_handler',
      trackingId
    });
    
    // Still respond with 200 to prevent Calendly from retrying
    res.sendStatus(200);
  }
});

/**
 * Test endpoint for manual Calendly event processing
 * POST /webhook/calendly/test
 */
router.post('/test', express.json(), async (req, res) => {
  const { eventData } = req.body;
  const trackingId = generateTrackingId();

  if (!eventData) {
    return res.status(400).json({
      error: 'Missing eventData in request body'
    });
  }

  logger.info('Manual Calendly event processing test initiated', {
    trackingId,
    event: eventData.event
  });

  try {
    const result = await processCalendlyEvent(eventData, trackingId);
    
    res.json({
      success: true,
      trackingId,
      event: eventData.event,
      result
    });

  } catch (error) {
    logger.logError(error, {
      context: 'manual_calendly_processing',
      trackingId,
      event: eventData.event
    });

    res.status(500).json({
      success: false,
      trackingId,
      event: eventData.event,
      error: error.message
    });
  }
});

/**
 * Health check endpoint for Calendly webhook
 * GET /webhook/calendly/health
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'calendly-webhook',
    timestamp: new Date().toISOString(),
    configuration: {
      webhookSecretConfigured: !!calendlyConfig.webhookSecret,
      apiTokenConfigured: !!calendlyConfig.apiToken
    }
  });
});

export default router;