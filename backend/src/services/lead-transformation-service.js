import logger from '../utils/logger.js';
import { hashForLogging } from '../utils/crypto.js';

/**
 * Unified lead transformation service that handles multiple data sources
 * Prioritizes HubSpot format as the standard format
 */

/**
 * Transform any lead data to standardized HubSpot-compatible format
 * @param {Object} leadData - Raw lead data from any source
 * @param {string} source - Source type ('hubspot_crm', 'generic', etc.)
 * @param {string} trackingId - Tracking ID for logging
 * @returns {Object} Standardized lead data in HubSpot format
 */
export function transformLead(leadData, source, trackingId) {
  logger.logLeadProcessing(trackingId, 'lead_transformation_started', {
    source,
    hasData: !!leadData
  });

  let transformedLead;

  switch (source) {
    case 'hubspot_crm':
      transformedLead = transformHubSpotLead(leadData, trackingId);
      break;
    default:
      transformedLead = transformGenericLeadToHubSpotFormat(leadData, source, trackingId);
  }

  logger.logLeadProcessing(trackingId, 'lead_transformation_completed', {
    source,
    email: transformedLead.email ? hashForLogging(transformedLead.email) : '[MISSING]',
    hasCustomFields: Object.keys(transformedLead.fields || {}).length > 0
  });

  return transformedLead;
}

/**
 * Transform HubSpot contact data to standardized format (primary format)
 * @param {Object} hubspotContact - Raw contact data from HubSpot
 * @param {string} trackingId - Tracking ID for logging
 * @returns {Object} Standardized lead data
 */
export function transformHubSpotLead(hubspotContact, trackingId) {
  const props = hubspotContact.properties || {};
  
  const transformedLead = {
    id: hubspotContact.id,
    hubspot_contact_id: hubspotContact.id,
    email: props.email || '',
    first_name: props.firstname || '',
    last_name: props.lastname || '',
    full_name: `${props.firstname || ''} ${props.lastname || ''}`.trim(),
    phone: props.phone || '',
    company: props.company || '',
    job_title: props.jobtitle || '',
    website: props.website || '',
    city: props.city || '',
    state: props.state || '',
    country: props.country || '',
    zip: props.zip || '',
    
    // HubSpot specific data
    hubspot_created_date: props.createdate,
    hubspot_modified_date: props.lastmodifieddate,
    hubspot_lead_status: props.hs_lead_status || '',
    lifecycle_stage: props.lifecyclestage || '',
    lead_source: props.lead_source || 'HubSpot CRM',
    analytics_source: props.hs_analytics_source || '',
    analytics_source_data_1: props.hs_analytics_source_data_1 || '',
    analytics_source_data_2: props.hs_analytics_source_data_2 || '',
    
    // Metadata
    source: 'hubspot_crm',
    created_time: props.createdate,
    raw_data: hubspotContact,
    
    // Custom fields from HubSpot properties
    fields: {
      ...Object.keys(props).reduce((acc, key) => {
        // Include all custom properties that aren't standard fields
        if (![
          'id', 'email', 'firstname', 'lastname', 'phone', 'company', 
          'jobtitle', 'website', 'city', 'state', 'country', 'zip',
          'createdate', 'lastmodifieddate', 'hs_lead_status',
          'lifecyclestage', 'lead_source', 'hs_analytics_source',
          'hs_analytics_source_data_1', 'hs_analytics_source_data_2'
        ].includes(key)) {
          acc[key] = props[key];
        }
        return acc;
      }, {})
    }
  };

  logger.logLeadProcessing(trackingId, 'hubspot_lead_transformed', {
    contactId: hubspotContact.id,
    email: transformedLead.email ? hashForLogging(transformedLead.email) : '[MISSING]',
    hasCustomFields: Object.keys(transformedLead.fields).length > 0
  });

  return transformedLead;
}

/**
 * Transform generic lead data to HubSpot-compatible format
 * @param {Object} leadData - Raw lead data from any source
 * @param {string} source - Source identifier
 * @param {string} trackingId - Tracking ID for logging
 * @returns {Object} Standardized lead data in HubSpot format
 */
export function transformGenericLeadToHubSpotFormat(leadData, source, trackingId) {
  const transformedLead = {
    id: leadData.id || leadData.contact_id || leadData.lead_id,
    email: leadData.email || '',
    first_name: leadData.first_name || leadData.firstname || '',
    last_name: leadData.last_name || leadData.lastname || '',
    full_name: leadData.full_name || '',
    phone: leadData.phone || leadData.phone_number || '',
    company: leadData.company || leadData.company_name || '',
    job_title: leadData.job_title || leadData.title || leadData.jobtitle || '',
    website: leadData.website || leadData.url || '',
    city: leadData.city || '',
    state: leadData.state || leadData.province || '',
    country: leadData.country || '',
    zip: leadData.zip || leadData.postal_code || leadData.zipcode || '',
    
    // Generic mapping to HubSpot format
    lead_source: leadData.lead_source || source || 'Unknown',
    lifecycle_stage: leadData.lifecycle_stage || 'lead',
    
    // Metadata
    source: source,
    created_time: leadData.created_time || leadData.created_at || new Date().toISOString(),
    raw_data: leadData,
    fields: leadData.fields || leadData.custom_fields || {}
  };

  // Generate full name if not provided but first/last names are available
  if (!transformedLead.full_name && (transformedLead.first_name || transformedLead.last_name)) {
    transformedLead.full_name = `${transformedLead.first_name} ${transformedLead.last_name}`.trim();
  }

  logger.logLeadProcessing(trackingId, 'generic_lead_transformed_to_hubspot_format', {
    source,
    leadId: transformedLead.id,
    email: transformedLead.email ? hashForLogging(transformedLead.email) : '[MISSING]',
    hasCustomFields: Object.keys(transformedLead.fields).length > 0
  });

  return transformedLead;
}

/**
 * Validate transformed lead data
 * @param {Object} transformedLead - Transformed lead data
 * @param {string} trackingId - Tracking ID for logging
 * @returns {Object} Validation result
 */
export function validateTransformedLead(transformedLead, trackingId) {
  const errors = [];
  const warnings = [];

  // Required fields validation
  if (!transformedLead.email) {
    errors.push('Email is required');
  }

  if (!transformedLead.first_name && !transformedLead.last_name && !transformedLead.full_name) {
    warnings.push('No name information provided');
  }

  // Email format validation
  if (transformedLead.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(transformedLead.email)) {
    errors.push('Invalid email format');
  }

  const isValid = errors.length === 0;

  logger.logLeadProcessing(trackingId, 'lead_validation_completed', {
    isValid,
    errorCount: errors.length,
    warningCount: warnings.length,
    email: transformedLead.email ? hashForLogging(transformedLead.email) : '[MISSING]'
  });

  return {
    isValid,
    errors,
    warnings
  };
}