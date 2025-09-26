import { hubspotClient } from '../config/index.js';
import logger from '../utils/logger.js';
import { hashForLogging } from '../utils/crypto.js';
import { upsertLeadToDatabase } from './database-service.js';
import { transformLead } from './lead-transformation-service.js';

/**
 * Fetch recent leads from HubSpot CRM
 * @param {Object} options - Query options
 * @param {number} options.limit - Number of leads to fetch (default: 100)
 * @param {Date} options.since - Fetch leads created since this date
 * @param {string} trackingId - Tracking ID for logging
 * @returns {Array} Array of HubSpot contacts
 */
export async function fetchHubSpotLeads(options = {}, trackingId) {
  const { limit = 100, since } = options;
  
  logger.logLeadProcessing(trackingId, 'fetching_hubspot_leads', {
    limit,
    since: since ? since.toISOString() : 'all_time'
  });

  try {
    const searchRequest = {
      filterGroups: [],
      properties: [
        // Standard properties
        'id', 'email', 'firstname', 'lastname', 'phone', 'company', 
        'jobtitle', 'website', 'city', 'state', 'country', 'zip',
        'createdate', 'lastmodifieddate', 'hs_lead_status',
        'lifecyclestage', 'lead_source', 'hs_analytics_source',
        'hs_analytics_source_data_1', 'hs_analytics_source_data_2',
        // Custom properties from the discovery file
        'address', 'annualrevenue', 'anything_specific_about_your_hiring_needs',
        'are_you_currently_covered_by_any_form_of_mortgage_insurance',
        'area_of_interest', 'availability_to_start', 'budget_range',
        'business_type', 'current_challenges', 'desired_outcome',
        'experience_level', 'industry', 'lead_score', 'lead_priority',
        'marketing_source', 'notes', 'preferred_contact_method',
        'project_timeline', 'referral_source', 'service_interest'
      ],
      sorts: [{
        propertyName: 'createdate',
        direction: 'DESCENDING'
      }],
      limit
    };

    // Add date filter if specified
    if (since) {
      searchRequest.filterGroups.push({
        filters: [{
          propertyName: 'createdate',
          operator: 'GTE',
          value: since.getTime().toString()
        }]
      });
    }

    // Add filter for leads only (exclude existing customers)
    searchRequest.filterGroups.push({
      filters: [{
        propertyName: 'lifecyclestage',
        operator: 'IN',
        values: ['lead', 'marketingqualifiedlead', 'salesqualifiedlead', 'subscriber']
      }]
    });

    const response = await hubspotClient.crm.contacts.searchApi.doSearch(searchRequest);
    
    logger.logLeadProcessing(trackingId, 'hubspot_leads_fetched', {
      count: response.results?.length || 0,
      hasMore: !!response.paging?.next
    });

    return response.results || [];

  } catch (error) {
    logger.logError(error, {
      context: 'hubspot_leads_fetch',
      trackingId,
      options
    });
    throw error;
  }
}

/**
 * Fetch a specific lead from HubSpot by contact ID
 * @param {string} contactId - HubSpot contact ID
 * @param {string} trackingId - Tracking ID for logging
 * @returns {Object} HubSpot contact data
 */
export async function fetchHubSpotLeadById(contactId, trackingId) {
  logger.logLeadProcessing(trackingId, 'fetching_hubspot_lead_by_id', {
    contactId
  });

  try {
    const response = await hubspotClient.crm.contacts.basicApi.getById(
      contactId,
      [
        // Standard properties
        'id', 'email', 'firstname', 'lastname', 'phone', 'company', 
        'jobtitle', 'website', 'city', 'state', 'country', 'zip',
        'createdate', 'lastmodifieddate', 'hs_lead_status',
        'lifecyclestage', 'lead_source', 'hs_analytics_source',
        'hs_analytics_source_data_1', 'hs_analytics_source_data_2',
        // Custom properties from the discovery file
        'address', 'annualrevenue', 'anything_specific_about_your_hiring_needs',
        'are_you_currently_covered_by_any_form_of_mortgage_insurance',
        'area_of_interest', 'availability_to_start', 'budget_range',
        'business_type', 'current_challenges', 'desired_outcome',
        'experience_level', 'industry', 'lead_score', 'lead_priority',
        'marketing_source', 'notes', 'preferred_contact_method',
        'project_timeline', 'referral_source', 'service_interest'
      ]
    );
    
    logger.logLeadProcessing(trackingId, 'hubspot_lead_fetched_by_id', {
      contactId,
      email: response.properties.email ? hashForLogging(response.properties.email) : '[MISSING]'
    });

    return response;

  } catch (error) {
    logger.logError(error, {
      context: 'hubspot_lead_fetch_by_id',
      trackingId,
      contactId
    });
    throw error;
  }
}

/**
 * Transform HubSpot contact data to standardized lead format (deprecated - use transformLead instead)
 * @param {Object} hubspotContact - Raw contact data from HubSpot
 * @param {string} trackingId - Tracking ID for logging
 * @returns {Object} Standardized lead data
 * @deprecated Use transformLead from lead-transformation-service.js instead
 */
export function transformHubSpotLead(hubspotContact, trackingId) {
  logger.logLeadProcessing(trackingId, 'using_deprecated_hubspot_transform', {
    contactId: hubspotContact.id,
    message: 'Consider using transformLead from lead-transformation-service.js'
  });
  
  return transformLead(hubspotContact, 'hubspot_crm', trackingId);
}

/**
 * Process a HubSpot lead through the complete pipeline
 * @param {Object} hubspotContact - HubSpot contact data
 * @param {string} trackingId - Tracking ID for logging
 * @returns {Object} Processing results
 */
export async function processHubSpotLead(hubspotContact, trackingId) {
  const contactId = hubspotContact.id;
  
  if (!contactId) {
    throw new Error('Missing contact ID in HubSpot contact data');
  }

  logger.logLeadProcessing(trackingId, 'hubspot_processing_started', {
    contactId,
    email: hubspotContact.properties?.email ? hashForLogging(hubspotContact.properties.email) : '[MISSING]'
  });

  const results = {
    contactId,
    trackingId,
    hubspot: null,
    supabase: null,
    errors: []
  };

  try {
    // Step 1: Transform the lead data using unified transformation service
    const transformedLead = transformLead(hubspotContact, 'hubspot_crm', trackingId);
    results.hubspot = { success: true, data: transformedLead };

    // Step 2: Upsert lead to Database
    try {
      const databaseResult = await upsertLeadToDatabase(transformedLead, trackingId);
      results.supabase = { success: true, data: databaseResult };
      logger.logLeadProcessing(trackingId, 'database_upsert_completed', {
        leadId: databaseResult.id,
        contactId
      });
    } catch (databaseError) {
      logger.logError(databaseError, {
        context: 'database_upsert',
        trackingId,
        contactId
      });
      results.supabase = { success: false, error: databaseError.message };
      results.errors.push(`Database: ${databaseError.message}`);
    }

    logger.logLeadProcessing(trackingId, 'hubspot_processing_completed', {
      contactId,
      successCount: Object.values(results).filter(r => r?.success).length,
      errorCount: results.errors.length
    });

    return results;

  } catch (error) {
    logger.logError(error, {
      context: 'hubspot_lead_processing',
      trackingId,
      contactId
    });
    
    results.errors.push(`Processing: ${error.message}`);
    throw error;
  }
}

/**
 * Sync recent HubSpot leads to the system
 * @param {Object} options - Sync options
 * @param {number} options.limit - Number of leads to sync (default: 50)
 * @param {Date} options.since - Sync leads created since this date
 * @param {string} trackingId - Tracking ID for logging
 * @returns {Object} Sync results
 */
export async function syncHubSpotLeads(options = {}, trackingId) {
  const { limit = 50, since } = options;
  
  logger.logLeadProcessing(trackingId, 'hubspot_sync_started', {
    limit,
    since: since ? since.toISOString() : 'all_time'
  });

  const results = {
    total: 0,
    processed: 0,
    errors: 0,
    details: []
  };

  try {
    // Fetch leads from HubSpot
    const hubspotLeads = await fetchHubSpotLeads({ limit, since }, trackingId);
    results.total = hubspotLeads.length;

    // Process each lead
    for (const hubspotLead of hubspotLeads) {
      try {
        const processResult = await processHubSpotLead(hubspotLead, trackingId);
        results.processed++;
        results.details.push({
          contactId: hubspotLead.id,
          success: true,
          result: processResult
        });
      } catch (error) {
        results.errors++;
        results.details.push({
          contactId: hubspotLead.id,
          success: false,
          error: error.message
        });
        logger.logError(error, {
          context: 'hubspot_lead_sync_individual',
          trackingId,
          contactId: hubspotLead.id
        });
      }
    }

    logger.logLeadProcessing(trackingId, 'hubspot_sync_completed', {
      total: results.total,
      processed: results.processed,
      errors: results.errors
    });

    return results;

  } catch (error) {
    logger.logError(error, {
      context: 'hubspot_leads_sync',
      trackingId,
      options
    });
    throw error;
  }
}