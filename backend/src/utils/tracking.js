import { randomBytes } from 'crypto';

/**
 * Generate a unique tracking ID for email campaigns and lead tracking
 * @param {string} prefix - Optional prefix for the tracking ID
 * @returns {string} - Generated tracking ID
 */
export function generateTrackingId(prefix = 'track') {
  const timestamp = Date.now().toString(36);
  const randomPart = randomBytes(6).toString('hex');
  return `${prefix}_${timestamp}_${randomPart}`;
}

/**
 * Generate a unique email tracking ID
 * @param {string} leadId - Lead ID to associate with the email
 * @param {string} emailType - Type of email (welcome, follow_up, reminder, etc.)
 * @returns {string} - Generated email tracking ID
 */
export function generateEmailTrackingId(leadId, emailType) {
  const shortLeadId = leadId.substring(0, 8);
  const timestamp = Date.now().toString(36);
  const randomPart = randomBytes(4).toString('hex');
  return `email_${emailType}_${shortLeadId}_${timestamp}_${randomPart}`;
}

/**
 * Generate a unique workflow tracking ID
 * @param {string} leadId - Lead ID to associate with the workflow
 * @param {string} workflowType - Type of workflow (automation, follow_up, etc.)
 * @returns {string} - Generated workflow tracking ID
 */
export function generateWorkflowTrackingId(leadId, workflowType) {
  const shortLeadId = leadId.substring(0, 8);
  const timestamp = Date.now().toString(36);
  const randomPart = randomBytes(4).toString('hex');
  return `workflow_${workflowType}_${shortLeadId}_${timestamp}_${randomPart}`;
}

/**
 * Generate a unique meeting tracking ID
 * @param {string} leadId - Lead ID to associate with the meeting
 * @param {string} meetingType - Type of meeting (scheduled, reminder, etc.)
 * @returns {string} - Generated meeting tracking ID
 */
export function generateMeetingTrackingId(leadId, meetingType) {
  const shortLeadId = leadId.substring(0, 8);
  const timestamp = Date.now().toString(36);
  const randomPart = randomBytes(4).toString('hex');
  return `meeting_${meetingType}_${shortLeadId}_${timestamp}_${randomPart}`;
}

/**
 * Parse tracking ID to extract components
 * @param {string} trackingId - The tracking ID to parse
 * @returns {Object} - Parsed components of the tracking ID
 */
export function parseTrackingId(trackingId) {
  const parts = trackingId.split('_');
  
  if (parts.length < 3) {
    return {
      valid: false,
      error: 'Invalid tracking ID format'
    };
  }
  
  return {
    valid: true,
    type: parts[0],
    subtype: parts[1] || null,
    leadId: parts[2] || null,
    timestamp: parts[3] || null,
    randomPart: parts[4] || null,
    fullId: trackingId
  };
}

/**
 * Validate tracking ID format
 * @param {string} trackingId - The tracking ID to validate
 * @returns {boolean} - Whether the tracking ID is valid
 */
export function isValidTrackingId(trackingId) {
  if (!trackingId || typeof trackingId !== 'string') {
    return false;
  }
  
  const parsed = parseTrackingId(trackingId);
  return parsed.valid;
}

/**
 * Generate a short unique ID for quick reference
 * @param {number} length - Length of the ID (default: 8)
 * @returns {string} - Generated short ID
 */
export function generateShortId(length = 8) {
  return randomBytes(Math.ceil(length / 2)).toString('hex').substring(0, length);
}

export default {
  generateTrackingId,
  generateEmailTrackingId,
  generateWorkflowTrackingId,
  generateMeetingTrackingId,
  parseTrackingId,
  isValidTrackingId,
  generateShortId
};