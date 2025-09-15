import express from 'express';
import { verifyFacebookSignature, generateTrackingId } from '../utils/crypto.js';
import { facebookConfig } from '../config/index.js';
import logger from '../utils/logger.js';
import { processFacebookLead } from '../services/facebook-service.js';

const router = express.Router();

/**
 * Facebook webhook verification endpoint
 * GET /webhook/facebook
 */
router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  logger.info('Facebook webhook verification attempt', {
    mode,
    token: token ? 'provided' : 'missing',
    challenge: challenge ? 'provided' : 'missing'
  });

  // Check if a token and mode were sent
  if (mode && token) {
    // Check the mode and token sent are correct
    if (mode === 'subscribe' && token === facebookConfig.verifyToken) {
      logger.info('Facebook webhook verified successfully');
      res.status(200).send(challenge);
    } else {
      logger.warn('Facebook webhook verification failed', {
        expectedToken: facebookConfig.verifyToken ? 'configured' : 'missing',
        receivedMode: mode
      });
      res.sendStatus(403);
    }
  } else {
    logger.warn('Facebook webhook verification failed - missing parameters');
    res.sendStatus(400);
  }
});

/**
 * Facebook webhook event handler
 * POST /webhook/facebook
 */
router.post('/', express.raw({ type: 'application/json' }), async (req, res) => {
  const signature = req.get('X-Hub-Signature-256');
  const body = req.body;
  const trackingId = generateTrackingId();

  logger.logRequest(req, { trackingId, hasSignature: !!signature });

  try {
    // Verify the webhook signature
    if (!verifyFacebookSignature(body, signature, facebookConfig.appSecret)) {
      logger.warn('Facebook webhook signature verification failed', {
        trackingId,
        signature: signature ? 'provided' : 'missing'
      });
      return res.sendStatus(401);
    }

    logger.info('Facebook webhook signature verified', { trackingId });

    // Parse the webhook payload
    let webhookData;
    try {
      webhookData = JSON.parse(body.toString());
    } catch (parseError) {
      logger.error('Failed to parse Facebook webhook payload', {
        trackingId,
        error: parseError.message
      });
      return res.sendStatus(400);
    }

    logger.info('Facebook webhook payload received', {
      trackingId,
      object: webhookData.object,
      entryCount: webhookData.entry?.length || 0
    });

    // Process the webhook data
    if (webhookData.object === 'page') {
      for (const entry of webhookData.entry || []) {
        logger.info('Processing Facebook page entry', {
          trackingId,
          pageId: entry.id,
          changesCount: entry.changes?.length || 0
        });

        for (const change of entry.changes || []) {
          if (change.field === 'leadgen') {
            logger.logLeadProcessing(trackingId, 'webhook_received', {
              changeField: change.field,
              leadgenId: change.value?.leadgen_id
            });

            try {
              await processFacebookLead(change.value, trackingId);
              logger.logLeadProcessing(trackingId, 'processing_completed');
            } catch (processingError) {
              logger.logError(processingError, {
                context: 'facebook_lead_processing',
                trackingId,
                leadgenId: change.value?.leadgen_id
              });
              // Continue processing other leads even if one fails
            }
          } else {
            logger.info('Ignoring non-leadgen change', {
              trackingId,
              field: change.field
            });
          }
        }
      }
    } else {
      logger.warn('Received webhook for unsupported object type', {
        trackingId,
        object: webhookData.object
      });
    }

    // Always respond with 200 to acknowledge receipt
    res.sendStatus(200);
    logger.logResponse(req, res, { trackingId });

  } catch (error) {
    logger.logError(error, {
      context: 'facebook_webhook_handler',
      trackingId
    });
    
    // Still respond with 200 to prevent Facebook from retrying
    res.sendStatus(200);
  }
});

/**
 * Test endpoint for manual lead processing
 * POST /webhook/facebook/test
 */
router.post('/test', express.json(), async (req, res) => {
  const { leadgenId } = req.body;
  const trackingId = generateTrackingId();

  if (!leadgenId) {
    return res.status(400).json({
      error: 'Missing leadgenId in request body'
    });
  }

  logger.info('Manual lead processing test initiated', {
    trackingId,
    leadgenId
  });

  try {
    const result = await processFacebookLead({ leadgen_id: leadgenId }, trackingId);
    
    res.json({
      success: true,
      trackingId,
      leadgenId,
      result
    });

  } catch (error) {
    logger.logError(error, {
      context: 'manual_lead_processing',
      trackingId,
      leadgenId
    });

    res.status(500).json({
      success: false,
      trackingId,
      leadgenId,
      error: error.message
    });
  }
});

export default router;