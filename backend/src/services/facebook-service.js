import { facebookConfig } from '../config/index.js';
import logger from '../utils/logger.js';
import { upsertHubSpotContact } from './hubspot-service.js';
import { upsertLeadToDatabase } from './database-service.js';
import { transformLead } from './lead-transformation-service.js';


/**
 * Fetch lead data from Facebook Graph API
 * @param {string} leadgenId - The leadgen ID from Facebook
 * @param {string} trackingId - Tracking ID for logging
 * @returns {Object} Lead data from Facebook
 */
export async function fetchFacebookLead(leadgenId, trackingId) {
  const url = `${facebookConfig.graphApiUrl}/${leadgenId}?access_token=${facebookConfig.accessToken}`;
  
  logger.logLeadProcessing(trackingId, 'fetching_from_facebook', {
    leadgenId,
    url: url.replace(facebookConfig.accessToken, '[REDACTED]')
  });

  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Facebook API error: ${response.status} - ${errorText}`);
    }

    const leadData = await response.json();
    
    logger.logLeadProcessing(trackingId, 'facebook_data_fetched', {
      leadgenId,
      hasFieldData: !!leadData.field_data,
      fieldCount: leadData.field_data?.length || 0
    });

    return leadData;

  } catch (error) {
    logger.logError(error, {
      context: 'facebook_api_fetch',
      trackingId,
      leadgenId
    });
    throw error;
  }
}

/**
 * Transform Facebook lead data to standardized format (deprecated - use transformLead instead)
 * @param {Object} facebookLead - Raw lead data from Facebook
 * @param {string} trackingId - Tracking ID for logging
 * @returns {Object} Standardized lead data
 * @deprecated Use transformLead from lead-transformation-service.js instead
 */
export function transformFacebookLead(facebookLead, trackingId) {
  logger.logLeadProcessing(trackingId, 'using_deprecated_facebook_transform', {
    leadId: facebookLead.id,
    message: 'Consider using transformLead from lead-transformation-service.js'
  });
  
  return transformLead(facebookLead, 'facebook_lead_ads', trackingId);
}

/**
 * Process a Facebook lead through the complete pipeline
 * @param {Object} webhookData - Webhook data from Facebook
 * @param {string} trackingId - Tracking ID for logging
 * @returns {Object} Processing results
 */
export async function processFacebookLead(webhookData, trackingId) {
  const leadgenId = webhookData.leadgen_id;
  
  if (!leadgenId) {
    throw new Error('Missing leadgen_id in webhook data');
  }

  logger.logLeadProcessing(trackingId, 'processing_started', {
    leadgenId,
    webhookData: {
      page_id: webhookData.page_id,
      form_id: webhookData.form_id,
      adgroup_id: webhookData.adgroup_id,
      ad_id: webhookData.ad_id
    }
  });

  const results = {
    leadgenId,
    trackingId,
    facebook: null,
    hubspot: null,
    supabase: null,

    errors: []
  };

  try {
    // Step 1: Fetch lead data from Facebook Graph API
    const facebookLead = await fetchFacebookLead(leadgenId, trackingId);
    results.facebook = { success: true, data: facebookLead };

    // Step 2: Transform the lead data using unified transformation service
    const transformedLead = transformLead(facebookLead, 'facebook_lead_ads', trackingId);

    // Step 3: Upsert contact to HubSpot
    try {
      const hubspotResult = await upsertHubSpotContact(transformedLead, trackingId);
      results.hubspot = { success: true, data: hubspotResult };
      logger.logLeadProcessing(trackingId, 'hubspot_upsert_completed', {
        contactId: hubspotResult.id
      });
    } catch (hubspotError) {
      logger.logError(hubspotError, {
        context: 'hubspot_upsert',
        trackingId,
        leadgenId
      });
      results.hubspot = { success: false, error: hubspotError.message };
      results.errors.push(`HubSpot: ${hubspotError.message}`);
    }

    // Step 4: Upsert lead to Database
    try {
      const databaseResult = await upsertLeadToDatabase(transformedLead, trackingId);
      results.supabase = { success: true, data: databaseResult };
      logger.logLeadProcessing(trackingId, 'database_upsert_completed', {
        leadId: databaseResult.id
      });
    } catch (databaseError) {
      logger.logError(databaseError, {
        context: 'database_upsert',
        trackingId,
        leadgenId
      });
      results.supabase = { success: false, error: databaseError.message };
      results.errors.push(`Database: ${databaseError.message}`);
    }



    logger.logLeadProcessing(trackingId, 'processing_completed', {
      leadgenId,
      successCount: Object.values(results).filter(r => r?.success).length,
      errorCount: results.errors.length
    });

    return results;

  } catch (error) {
    logger.logError(error, {
      context: 'facebook_lead_processing',
      trackingId,
      leadgenId
    });
    
    results.errors.push(`Processing: ${error.message}`);
    throw error;
  }
}