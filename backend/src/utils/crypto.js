import crypto from 'crypto';

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

  const expectedSignature = crypto
    .createHmac('sha256', webhookSecret)
    .update(payload, 'utf8')
    .digest('base64');

  return crypto.timingSafeEqual(
    Buffer.from(expectedSignature),
    Buffer.from(signature)
  );
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