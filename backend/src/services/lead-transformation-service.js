import logger from '../utils/logger.js';
import { hashForLogging } from '../utils/crypto.js';

/**
 * Unified lead transformation service that handles multiple data sources
 * Prioritizes HubSpot format as the standard format
 */

/**
 * Transform any lead data to standardized HubSpot-compatible format
 * @param {Object} leadData - Raw lead data from any source
 * @param {string} source - Source type ('hubspot_crm', 'facebook_lead_ads', etc.)
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
    case 'facebook_lead_ads':
      transformedLead = transformFacebookLeadToHubSpotFormat(leadData, trackingId);
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
 * Transform Facebook lead data to HubSpot-compatible format
 * @param {Object} facebookLead - Raw lead data from Facebook
 * @param {string} trackingId - Tracking ID for logging
 * @returns {Object} Standardized lead data in HubSpot format
 */
export function transformFacebookLeadToHubSpotFormat(facebookLead, trackingId) {
  const transformedLead = {
    id: facebookLead.id,
    facebook_lead_id: facebookLead.id,
    email: '',
    first_name: '',
    last_name: '',
    full_name: '',
    phone: '',
    company: '',
    job_title: '',
    website: '',
    city: '',
    state: '',
    country: '',
    zip: '',
    
    // Facebook specific data mapped to HubSpot format
    lead_source: 'Facebook Lead Ads',
    analytics_source: 'facebook',
    analytics_source_data_1: facebookLead.ad_name || '',
    analytics_source_data_2: facebookLead.campaign_name || '',
    lifecycle_stage: 'lead',
    
    // Facebook metadata
    facebook_ad_id: facebookLead.ad_id,
    facebook_ad_name: facebookLead.ad_name,
    facebook_adset_id: facebookLead.adset_id,
    facebook_adset_name: facebookLead.adset_name,
    facebook_campaign_id: facebookLead.campaign_id,
    facebook_campaign_name: facebookLead.campaign_name,
    facebook_form_id: facebookLead.form_id,
    facebook_form_name: facebookLead.form_name,
    facebook_is_organic: facebookLead.is_organic,
    facebook_platform: facebookLead.platform,
    
    // Metadata
    source: 'facebook_lead_ads',
    created_time: facebookLead.created_time,
    raw_data: facebookLead,
    fields: {}
  };

  // Transform Facebook field_data array to key-value pairs
  if (facebookLead.field_data && Array.isArray(facebookLead.field_data)) {
    for (const field of facebookLead.field_data) {
      const fieldName = field.name?.toLowerCase();
      const fieldValue = field.values?.[0] || '';
      
      if (fieldName && fieldValue) {
        transformedLead.fields[fieldName] = fieldValue;
        
        // Map common fields to HubSpot standard properties
        switch (fieldName) {
          case 'email':
          case 'email_address':
          case 'e_mail':
            transformedLead.email = fieldValue;
            break;
          case 'first_name':
          case 'firstname':
          case 'given_name':
            transformedLead.first_name = fieldValue;
            break;
          case 'last_name':
          case 'lastname':
          case 'family_name':
          case 'surname':
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
          case 'mobile':
          case 'telephone':
            transformedLead.phone = fieldValue;
            break;
          case 'company':
          case 'company_name':
            transformedLead.company = fieldValue;
            break;
          case 'job_title':
          case 'title':
          case 'jobtitle':
            transformedLead.job_title = fieldValue;
            break;
          case 'website':
          case 'url':
            transformedLead.website = fieldValue;
            break;
          case 'city':
            transformedLead.city = fieldValue;
            break;
          case 'state':
          case 'province':
            transformedLead.state = fieldValue;
            break;
          case 'country':
            transformedLead.country = fieldValue;
            break;
          case 'zip':
          case 'postal_code':
          case 'zipcode':
            transformedLead.zip = fieldValue;
            break;
        }
      }
    }
  }

  // Generate full name if not provided but first/last names are available
  if (!transformedLead.full_name && (transformedLead.first_name || transformedLead.last_name)) {
    transformedLead.full_name = `${transformedLead.first_name} ${transformedLead.last_name}`.trim();
  }

  logger.logLeadProcessing(trackingId, 'facebook_lead_transformed_to_hubspot_format', {
    facebookLeadId: facebookLead.id,
    email: transformedLead.email ? hashForLogging(transformedLead.email) : '[MISSING]',
    firstName: transformedLead.first_name ? '[PROVIDED]' : '[MISSING]',
    lastName: transformedLead.last_name ? '[PROVIDED]' : '[MISSING]',
    phone: transformedLead.phone ? '[PROVIDED]' : '[MISSING]',
    fieldCount: Object.keys(transformedLead.fields).length
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