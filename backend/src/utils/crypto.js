import crypto from 'crypto';
import { calendlyConfig } from '../config/index.js';
import logger from './logger.js';

/**
 * Verify Calendly webhook signature
 * @param {string} payload - Raw request body
 * @param {string} signature - Calendly-Webhook-Signature header value
 * @param {string} webhookSecret - Calendly webhook secret
 * @returns {boolean} - True if signature is valid
 */
export function verifyCalendlySignature(payload, signature, webhookSecret) {
  if (!signature) {
    return false;
  }

  // Convert payload to string if it's a Buffer or Object
  let payloadString;
  if (Buffer.isBuffer(payload)) {
    payloadString = payload.toString('utf8');
  } else if (typeof payload === 'object') {
    payloadString = JSON.stringify(payload);
  } else {
    payloadString = payload;
  }

  const expectedSignature = crypto
    .createHmac('sha256', webhookSecret)
    .update(payloadString, 'utf8')
    .digest('base64');

  // Ensure both buffers have the same length for comparison
  const expectedBuffer = Buffer.from(expectedSignature);
  const signatureBuffer = Buffer.from(signature);
  
  if (expectedBuffer.length !== signatureBuffer.length) {
    return false;
  }
  
  return crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
}

/**
 * Validate Calendly API token format
 * @param {string} token - Calendly API token
 * @returns {boolean} - True if token format is valid
 */
export function validateCalendlyTokenFormat(token) {
  if (!token || typeof token !== 'string') {
    return false;
  }

  // Calendly tokens typically start with 'eyJ' (JWT format) or have specific patterns
  // This is a basic format validation
  return token.length > 20 && (token.startsWith('eyJ') || token.includes('_'));
}

/**
 * Verify Calendly API token by making a test API call
 * @param {string} token - Calendly API token
 * @param {string} trackingId - Tracking ID for logging
 * @returns {Promise<boolean>} - True if token is valid
 */
export async function verifyCalendlyApiToken(token, trackingId) {
  if (!validateCalendlyTokenFormat(token)) {
    logger.warn('Invalid Calendly token format', { trackingId });
    return false;
  }

  try {
    const response = await fetch('https://api.calendly.com/users/me', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      const userData = await response.json();
      logger.info('Calendly API token validated successfully', {
        trackingId,
        userUri: userData.resource?.uri ? '[PROVIDED]' : '[MISSING]'
      });
      return true;
    } else {
      logger.warn('Calendly API token validation failed', {
        trackingId,
        status: response.status,
        statusText: response.statusText
      });
      return false;
    }
  } catch (error) {
    logger.error('Error validating Calendly API token', {
      trackingId,
      error: error.message
    });
    return false;
  }
}

/**
 * Enhanced webhook signature verification with additional security checks
 * @param {Object} req - Express request object
 * @param {string} webhookSecret - Calendly webhook secret
 * @param {string} trackingId - Tracking ID for logging
 * @returns {Object} - Verification result with details
 */
export function enhancedWebhookVerification(req, webhookSecret, trackingId) {
  const signature = req.get('Calendly-Webhook-Signature');
  const timestamp = req.get('Calendly-Webhook-Timestamp');
  const userAgent = req.get('User-Agent');
  const body = req.body;

  const result = {
    isValid: false,
    errors: [],
    warnings: []
  };

  // Check if webhook secret is configured
  if (!webhookSecret) {
    result.errors.push('Webhook secret not configured');
    return result;
  }

  // Check signature presence
  if (!signature) {
    result.errors.push('Missing webhook signature');
    return result;
  }

  // Verify signature
  if (!verifyCalendlySignature(body, signature, webhookSecret)) {
    result.errors.push('Invalid webhook signature');
    return result;
  }

  // Check timestamp if provided (replay attack protection)
  if (timestamp) {
    const webhookTime = new Date(timestamp);
    const currentTime = new Date();
    const timeDiff = Math.abs(currentTime - webhookTime) / 1000; // seconds

    // Allow up to 5 minutes difference
    if (timeDiff > 300) {
      result.warnings.push(`Webhook timestamp is ${Math.round(timeDiff)} seconds old`);
    }
  } else {
    result.warnings.push('Missing webhook timestamp');
  }

  // Check User-Agent (basic validation)
  if (!userAgent || !userAgent.includes('Calendly')) {
    result.warnings.push('Unexpected User-Agent header');
  }

  result.isValid = true;
  logger.info('Enhanced webhook verification completed', {
    trackingId,
    isValid: result.isValid,
    errorCount: result.errors.length,
    warningCount: result.warnings.length
  });

  return result;
}

/**
 * Generate a unique ID for tracking purposes
 * @returns {string} - Unique identifier
 */
export function generateTrackingId() {
  return crypto.randomUUID();
}

/**
 * Hash sensitive data for logging
 * @param {string} data - Data to hash
 * @returns {string} - Hashed data
 */
export function hashForLogging(data) {
  return crypto
    .createHash('sha256')
    .update(data)
    .digest('hex')
    .substring(0, 8);
}