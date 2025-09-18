import express from 'express';
// Rate limiting imports removed
import { 
  verifyCalendlySignature, 
  generateTrackingId, 
  enhancedWebhookVerification,
  verifyCalendlyApiToken 
} from '../utils/crypto.js';
import { calendlyConfig } from '../config/index.js';
import logger from '../utils/logger.js';
import { processCalendlyEvent } from '../services/calendly-service.js';

// Security middleware for request size limiting
const requestSizeLimit = express.json({ 
  limit: '1mb',
  verify: (req, res, buf, encoding) => {
    // Additional verification for JSON payloads
    if (buf.length > 1024 * 1024) { // 1MB limit
      const error = new Error('Request payload too large');
      error.status = 413;
      throw error;
    }
  }
});



// Request validation middleware
const validateRequest = (req, res, next) => {
  const trackingId = generateTrackingId();
  
  // Check for required headers - only user-agent is required for all requests
  const requiredHeaders = ['user-agent'];
  const missingHeaders = requiredHeaders.filter(header => !req.get(header));
  
  if (missingHeaders.length > 0) {
    logger.logValidation('request_headers', {
      isValid: false,
      errors: [`Missing headers: ${missingHeaders.join(', ')}`]
    }, {
      trackingId,
      ip: req.ip,
      path: req.path
    });
    
    return res.status(400).json({
      error: 'Missing required headers',
      code: 'MISSING_HEADERS',
      missingHeaders,
      trackingId
    });
  }
  
  // Validate content type only for POST requests to webhook endpoints
  if (req.method === 'POST' && req.path.includes('/webhook') && !req.get('content-type')?.includes('application/json')) {
    logger.logValidation('content_type', {
      isValid: false,
      errors: ['Invalid content type for webhook request']
    }, {
      trackingId,
      contentType: req.get('content-type'),
      ip: req.ip
    });
    
    return res.status(400).json({
      error: 'Invalid content type. Expected application/json',
      code: 'INVALID_CONTENT_TYPE',
      trackingId
    });
  }
  
  req.trackingId = trackingId;
  next();
};

const router = express.Router();

// Rate limiting removed for simplified configuration

// Test rate limiting removed for simplified configuration

/**
 * Calendly webhook event handler
 * POST /webhook/calendly
 */
// Custom middleware to capture raw body for signature verification
const captureRawBody = (req, res, next) => {
  let data = '';
  req.setEncoding('utf8');
  req.on('data', chunk => {
    data += chunk;
  });
  req.on('end', () => {
    req.rawBody = data;
    try {
      req.body = JSON.parse(data);
    } catch (err) {
      req.body = {};
    }
    next();
  });
};

router.post('/', 
  validateRequest,
  captureRawBody,
  async (req, res) => {
  const signature = req.get('Calendly-Webhook-Signature');
  const rawBody = req.rawBody;
  const trackingId = generateTrackingId();

  const startTime = Date.now();
  
  logger.logWebhookProcessing(trackingId, 'unknown', 'received', {
    hasSignature: !!signature,
    bodyLength: rawBody?.length || 0,
    userAgent: req.get('User-Agent'),
    ip: req.ip
  });

  try {
    // Parse and normalize the webhook payload to handle both test and real Calendly formats
    let webhookData;
    try {
      const raw = req.body;
      
      // Log the raw payload for debugging
      logger.info('📥 Raw Calendly Payload:', {
        trackingId,
        payload: JSON.stringify(raw, null, 2)
      });
      
      if (!raw || Object.keys(raw).length === 0) {
        throw new Error('Empty or invalid JSON payload');
      }
      
      // 🔧 Normalize payload format - support both test format and real Calendly format
      const payload = 
        raw?.eventData?.payload ||  // <-- Test curl format (eventData wrapper)
        raw?.payload ||             // <-- Real Calendly webhook format
        null;
      
      const event = 
        raw?.eventData?.event ||    // <-- Test format event field
        raw?.event ||               // <-- Real Calendly format event field
        null;
      
      if (!payload || !payload.event || !payload.invitee) {
        logger.error('❌ Invalid Calendly payload structure received:', {
          trackingId,
          hasPayload: !!payload,
          hasEvent: !!(payload?.event),
          hasInvitee: !!(payload?.invitee),
          rawStructure: Object.keys(raw)
        });
        return res.status(400).json({ 
          success: false, 
          error: 'invalid_payload',
          trackingId
        });
      }
      
      // Construct normalized webhook data
      webhookData = {
        event: event || payload.event?.uri?.includes('invitee') ? 'invitee.created' : 'unknown',
        time: raw.time || new Date().toISOString(),
        payload: payload
      };
      
      logger.info('✅ Normalized webhook payload:', {
        trackingId,
        originalFormat: raw?.eventData ? 'test_format' : 'calendly_format',
        event: webhookData.event,
        hasInvitee: !!webhookData.payload.invitee,
        hasEvent: !!webhookData.payload.event
      });
      
    } catch (parseError) {
      logger.error('Failed to parse Calendly webhook payload', {
        trackingId,
        error: parseError.message,
        rawBody: rawBody?.substring(0, 200) // Log first 200 chars for debugging
      });
      return res.sendStatus(400);
    }

    // Enhanced webhook verification with additional security checks
    // Use webhookSigningKey for signature verification (not webhookSecret)
    const signingKey = calendlyConfig.webhookSigningKey || calendlyConfig.webhookSecret;
    const verificationResult = enhancedWebhookVerification(req, signingKey, trackingId);
    
    if (!verificationResult.isValid) {
      logger.warn('Calendly webhook verification failed', {
        trackingId,
        errors: verificationResult.errors,
        warnings: verificationResult.warnings
      });
      return res.status(401).json({
        error: 'Webhook verification failed',
        details: verificationResult.errors
      });
    }

    // Log any warnings from verification
    if (verificationResult.warnings.length > 0) {
      logger.warn('Calendly webhook verification warnings', {
        trackingId,
        warnings: verificationResult.warnings
      });
    }

    logger.logWebhookProcessing(trackingId, webhookData.event, 'verification_success', {
      inviteeEmail: webhookData.payload?.invitee?.email ? 'present' : 'missing'
    });

    logger.info('Calendly webhook payload received', {
      trackingId,
      event: webhookData.event,
      eventType: webhookData.payload?.event_type?.name,
      inviteeEmail: webhookData.payload?.invitee?.email ? '[PROVIDED]' : '[MISSING]'
    });

    // Process the webhook event
    try {
      const results = await processCalendlyEvent(webhookData, trackingId);
      const processingTime = Date.now() - startTime;
      
      logger.logWebhookProcessing(trackingId, results.event, 'processing_completed', {
        processed: results.processed,
        leadUpdated: results.leadUpdated,
        meetingCreated: results.meetingCreated,
        meetingUpdated: results.meetingUpdated
      });
      
      logger.logPerformance('webhook_processing', processingTime, {
        trackingId,
        event: results.event
      });
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
router.post('/test', 
  validateRequest,
  requestSizeLimit, 
  async (req, res) => {
  const { eventData, skipAuth } = req.body;
  const trackingId = generateTrackingId();

  if (!eventData) {
    return res.status(400).json({
      error: 'Missing eventData in request body'
    });
  }

  // Validate API token unless explicitly skipped
  if (!skipAuth && calendlyConfig.apiToken) {
    const tokenValid = await verifyCalendlyApiToken(calendlyConfig.apiToken, trackingId);
    if (!tokenValid) {
      return res.status(401).json({
        error: 'Invalid Calendly API token',
        trackingId
      });
    }
  }

  logger.info('Manual Calendly event processing test initiated', {
    trackingId,
    event: eventData.event,
    authSkipped: !!skipAuth
  });

  try {
    const result = await processCalendlyEvent(eventData, trackingId);
    
    res.json({
      success: true,
      trackingId,
      event: eventData.event,
      result,
      authentication: {
        apiTokenValidated: !skipAuth && !!calendlyConfig.apiToken
      }
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
router.get('/health', validateRequest, async (req, res) => {
  const trackingId = generateTrackingId();
  
  const healthStatus = {
    status: 'ok',
    service: 'calendly-webhook',
    timestamp: new Date().toISOString(),
    configuration: {
      webhookSigningKeyConfigured: !!calendlyConfig.webhookSigningKey,
      apiTokenConfigured: !!calendlyConfig.apiToken
    },
    authentication: {
      webhookSigningKeyValid: !!calendlyConfig.webhookSigningKey,
      apiTokenValid: false
    }
  };

  // Test API token if configured
  if (calendlyConfig.apiToken) {
    try {
      healthStatus.authentication.apiTokenValid = await verifyCalendlyApiToken(
        calendlyConfig.apiToken, 
        trackingId
      );
    } catch (error) {
      logger.error('Error testing Calendly API token in health check', {
        trackingId,
        error: error.message
      });
      healthStatus.authentication.apiTokenValid = false;
    }
  }

  // Set overall status based on authentication
  if (!healthStatus.authentication.webhookSigningKeyValid || !healthStatus.authentication.apiTokenValid) {
    healthStatus.status = 'degraded';
  }

  const statusCode = healthStatus.status === 'ok' ? 200 : 503;
  res.status(statusCode).json(healthStatus);
});

export default router;