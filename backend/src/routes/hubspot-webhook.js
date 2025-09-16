import express from 'express';
import { generateTrackingId } from '../utils/crypto.js';
import logger from '../utils/logger.js';
import { processHubSpotLead, fetchHubSpotLeadById, syncHubSpotLeads } from '../services/hubspot-lead-service.js';

const router = express.Router();

/**
 * HubSpot webhook verification endpoint
 * GET /webhook/hubspot
 */
router.get('/', (req, res) => {
  // HubSpot webhook verification
  logger.info('HubSpot webhook verification attempt');
  
  // For HubSpot, we typically just return a 200 status for verification
  res.status(200).json({
    status: 'verified',
    message: 'HubSpot webhook endpoint verified',
    timestamp: new Date().toISOString()
  });
});

/**
 * HubSpot webhook event handler
 * POST /webhook/hubspot
 */
router.post('/', express.json(), async (req, res) => {
  const trackingId = generateTrackingId();
  const webhookData = req.body;

  logger.info('HubSpot webhook received', {
    trackingId,
    eventType: webhookData.subscriptionType,
    objectType: webhookData.objectType,
    eventId: webhookData.eventId
  });

  try {
    // Validate webhook data
    if (!webhookData || !Array.isArray(webhookData)) {
      logger.warn('Invalid HubSpot webhook data format', {
        trackingId,
        receivedData: typeof webhookData
      });
      return res.status(400).json({
        error: 'Invalid webhook data format',
        trackingId
      });
    }

    const results = [];

    // Process each event in the webhook
    for (const event of webhookData) {
      try {
        await processHubSpotWebhookEvent(event, trackingId);
        results.push({
          eventId: event.eventId,
          objectId: event.objectId,
          success: true
        });
      } catch (eventError) {
        logger.logError(eventError, {
          context: 'hubspot_webhook_event_processing',
          trackingId,
          eventId: event.eventId,
          objectId: event.objectId
        });
        results.push({
          eventId: event.eventId,
          objectId: event.objectId,
          success: false,
          error: eventError.message
        });
      }
    }

    logger.info('HubSpot webhook processing completed', {
      trackingId,
      totalEvents: webhookData.length,
      successfulEvents: results.filter(r => r.success).length,
      failedEvents: results.filter(r => !r.success).length
    });

    res.status(200).json({
      success: true,
      trackingId,
      results
    });

  } catch (error) {
    logger.logError(error, {
      context: 'hubspot_webhook_processing',
      trackingId
    });

    res.status(500).json({
      success: false,
      trackingId,
      error: error.message
    });
  }
});

/**
 * Process individual HubSpot webhook event
 * @param {Object} event - HubSpot webhook event
 * @param {string} trackingId - Tracking ID for logging
 */
async function processHubSpotWebhookEvent(event, trackingId) {
  const { subscriptionType, objectType, objectId, eventId, occurredAt } = event;

  logger.logLeadProcessing(trackingId, 'hubspot_webhook_event_received', {
    eventId,
    subscriptionType,
    objectType,
    objectId,
    occurredAt
  });

  // Only process contact-related events
  if (objectType !== 'contact') {
    logger.info('Skipping non-contact event', {
      trackingId,
      eventId,
      objectType
    });
    return;
  }

  // Process different types of contact events
  switch (subscriptionType) {
    case 'contact.creation':
    case 'contact.propertyChange':
      await handleContactEvent(objectId, subscriptionType, trackingId);
      break;
    
    case 'contact.deletion':
      await handleContactDeletion(objectId, trackingId);
      break;
    
    default:
      logger.info('Unhandled HubSpot event type', {
        trackingId,
        eventId,
        subscriptionType
      });
  }
}

/**
 * Handle contact creation or property change events
 * @param {string} contactId - HubSpot contact ID
 * @param {string} eventType - Type of event
 * @param {string} trackingId - Tracking ID for logging
 */
async function handleContactEvent(contactId, eventType, trackingId) {
  try {
    logger.logLeadProcessing(trackingId, 'processing_hubspot_contact_event', {
      contactId,
      eventType
    });

    // Fetch the updated contact data from HubSpot
    const hubspotContact = await fetchHubSpotLeadById(contactId, trackingId);
    
    // Process the contact through our lead pipeline
    const result = await processHubSpotLead(hubspotContact, trackingId);
    
    logger.logLeadProcessing(trackingId, 'hubspot_contact_event_processed', {
      contactId,
      eventType,
      success: true,
      leadId: result.supabase?.data?.id
    });

  } catch (error) {
    logger.logError(error, {
      context: 'hubspot_contact_event_handling',
      trackingId,
      contactId,
      eventType
    });
    throw error;
  }
}

/**
 * Handle contact deletion events
 * @param {string} contactId - HubSpot contact ID
 * @param {string} trackingId - Tracking ID for logging
 */
async function handleContactDeletion(contactId, trackingId) {
  try {
    logger.logLeadProcessing(trackingId, 'processing_hubspot_contact_deletion', {
      contactId
    });

    // Note: We might want to mark the lead as deleted rather than actually deleting it
    // This preserves historical data and audit trails
    
    // For now, we'll just log the deletion event
    // In a production system, you might want to:
    // 1. Mark the lead as deleted in your database
    // 2. Update the lead status
    // 3. Preserve the data for compliance/audit purposes
    
    logger.logLeadProcessing(trackingId, 'hubspot_contact_deletion_noted', {
      contactId,
      action: 'logged_only' // Indicate we're not actually deleting data
    });

  } catch (error) {
    logger.logError(error, {
      context: 'hubspot_contact_deletion_handling',
      trackingId,
      contactId
    });
    throw error;
  }
}

/**
 * Manual HubSpot lead processing endpoint for testing
 * POST /webhook/hubspot/test
 */
router.post('/test', express.json(), async (req, res) => {
  const { contactId } = req.body;
  const trackingId = generateTrackingId();

  if (!contactId) {
    return res.status(400).json({
      error: 'Missing contactId in request body'
    });
  }

  logger.info('Manual HubSpot lead processing test initiated', {
    trackingId,
    contactId
  });

  try {
    // Fetch the contact from HubSpot
    const hubspotContact = await fetchHubSpotLeadById(contactId, trackingId);
    
    // Process the contact
    const result = await processHubSpotLead(hubspotContact, trackingId);
    
    res.json({
      success: true,
      trackingId,
      contactId,
      result
    });

  } catch (error) {
    logger.logError(error, {
      context: 'manual_hubspot_lead_processing',
      trackingId,
      contactId
    });

    res.status(500).json({
      success: false,
      trackingId,
      contactId,
      error: error.message
    });
  }
});

/**
 * Manual HubSpot leads sync endpoint
 * POST /webhook/hubspot/sync
 */
router.post('/sync', express.json(), async (req, res) => {
  const { limit = 50, since } = req.body;
  const trackingId = generateTrackingId();

  logger.info('Manual HubSpot leads sync initiated', {
    trackingId,
    limit,
    since
  });

  try {
    const sinceDate = since ? new Date(since) : undefined;
    const result = await syncHubSpotLeads({ limit, since: sinceDate }, trackingId);
    
    res.json({
      success: true,
      trackingId,
      result
    });

  } catch (error) {
    logger.logError(error, {
      context: 'manual_hubspot_leads_sync',
      trackingId,
      limit,
      since
    });

    res.status(500).json({
      success: false,
      trackingId,
      error: error.message
    });
  }
});

/**
 * HubSpot webhook health check endpoint
 * GET /webhook/hubspot/health
 */
router.get('/health', async (req, res) => {
  try {
    // Basic health check - verify HubSpot API connectivity
    const { hubspotClient } = await import('../config/index.js');
    
    if (!hubspotClient) {
      throw new Error('HubSpot client not configured');
    }

    // Test HubSpot API connectivity
    await hubspotClient.crm.contacts.basicApi.getPage(1);
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      hubspot: 'connected'
    });

  } catch (error) {
    logger.logError(error, {
      context: 'hubspot_webhook_health_check'
    });

    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      hubspot: 'disconnected',
      error: error.message
    });
  }
});

export default router;