import { facebookConfig } from '../config/index.js';
import logger from '../utils/logger.js';
import { upsertHubSpotContact } from './hubspot-service.js';
import { upsertLeadToSupabase } from './supabase-service.js';


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
 * Transform Facebook lead data to standardized format
 * @param {Object} facebookLead - Raw lead data from Facebook
 * @param {string} trackingId - Tracking ID for logging
 * @returns {Object} Standardized lead data
 */
export function transformFacebookLead(facebookLead, trackingId) {
  const transformedLead = {
    id: facebookLead.id,
    created_time: facebookLead.created_time,
    ad_id: facebookLead.ad_id,
    ad_name: facebookLead.ad_name,
    adset_id: facebookLead.adset_id,
    adset_name: facebookLead.adset_name,
    campaign_id: facebookLead.campaign_id,
    campaign_name: facebookLead.campaign_name,
    form_id: facebookLead.form_id,
    form_name: facebookLead.form_name,
    is_organic: facebookLead.is_organic,
    platform: facebookLead.platform,
    fields: {},
    raw_data: facebookLead
  };

  // Transform field_data array to key-value pairs
  if (facebookLead.field_data && Array.isArray(facebookLead.field_data)) {
    for (const field of facebookLead.field_data) {
      const fieldName = field.name?.toLowerCase();
      const fieldValue = field.values?.[0] || '';
      
      if (fieldName && fieldValue) {
        transformedLead.fields[fieldName] = fieldValue;
        
        // Map common fields to standard properties
        switch (fieldName) {
          case 'email':
            transformedLead.email = fieldValue;
            break;
          case 'first_name':
          case 'firstname':
            transformedLead.first_name = fieldValue;
            break;
          case 'last_name':
          case 'lastname':
            transformedLead.last_name = fieldValue;
            break;
          case 'full_name':
          case 'name':
            transformedLead.full_name = fieldValue;
            // Try to split full name if first/last not provided
            if (!transformedLead.first_name && !transformedLead.last_name) {
              const nameParts = fieldValue.split(' ');
              transformedLead.first_name = nameParts[0] || '';
              transformedLead.last_name = nameParts.slice(1).join(' ') || '';
            }
            break;
          case 'phone':
          case 'phone_number':
            transformedLead.phone = fieldValue;
            break;
          case 'company':
          case 'company_name':
            transformedLead.company = fieldValue;
            break;
          case 'job_title':
          case 'title':
            transformedLead.job_title = fieldValue;
            break;
        }
      }
    }
  }

  logger.logLeadProcessing(trackingId, 'lead_transformed', {
    leadId: transformedLead.id,
    email: transformedLead.email ? '[PROVIDED]' : '[MISSING]',
    firstName: transformedLead.first_name ? '[PROVIDED]' : '[MISSING]',
    lastName: transformedLead.last_name ? '[PROVIDED]' : '[MISSING]',
    phone: transformedLead.phone ? '[PROVIDED]' : '[MISSING]',
    fieldCount: Object.keys(transformedLead.fields).length
  });

  return transformedLead;
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

    // Step 2: Transform the lead data
    const transformedLead = transformFacebookLead(facebookLead, trackingId);

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

    // Step 4: Upsert lead to Supabase
    try {
      const supabaseResult = await upsertLeadToSupabase(transformedLead, trackingId);
      results.supabase = { success: true, data: supabaseResult };
      logger.logLeadProcessing(trackingId, 'supabase_upsert_completed', {
        leadId: supabaseResult.id
      });
    } catch (supabaseError) {
      logger.logError(supabaseError, {
        context: 'supabase_upsert',
        trackingId,
        leadgenId
      });
      results.supabase = { success: false, error: supabaseError.message };
      results.errors.push(`Supabase: ${supabaseError.message}`);
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