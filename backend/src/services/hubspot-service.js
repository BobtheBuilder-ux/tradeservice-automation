import { hubspotClient } from '../config/index.js';
import logger from '../utils/logger.js';
import { hashForLogging } from '../utils/crypto.js';

/**
 * Search for existing HubSpot contact by email
 * @param {string} email - Contact email
 * @param {string} trackingId - Tracking ID for logging
 * @returns {Object|null} Existing contact or null
 */
export async function findHubSpotContactByEmail(email, trackingId) {
  if (!email) {
    return null;
  }

  try {
    logger.logLeadProcessing(trackingId, 'searching_hubspot_contact', {
      email: hashForLogging(email)
    });

    const searchRequest = {
      filterGroups: [{
        filters: [{
          propertyName: 'email',
          operator: 'EQ',
          value: email
        }]
      }],
      properties: ['id', 'email', 'firstname', 'lastname', 'phone', 'company'],
      limit: 1
    };

    const response = await hubspotClient.crm.contacts.searchApi.doSearch(searchRequest);
    
    if (response.results && response.results.length > 0) {
      const contact = response.results[0];
      logger.logLeadProcessing(trackingId, 'hubspot_contact_found', {
        contactId: contact.id,
        email: hashForLogging(email)
      });
      return contact;
    }

    logger.logLeadProcessing(trackingId, 'hubspot_contact_not_found', {
      email: hashForLogging(email)
    });
    return null;

  } catch (error) {
    logger.logError(error, {
      context: 'hubspot_contact_search',
      trackingId,
      email: hashForLogging(email)
    });
    throw error;
  }
}

/**
 * Create a new HubSpot contact
 * @param {Object} leadData - Transformed lead data
 * @param {string} trackingId - Tracking ID for logging
 * @returns {Object} Created contact
 */
export async function createHubSpotContact(leadData, trackingId) {
  try {
    logger.logLeadProcessing(trackingId, 'creating_hubspot_contact', {
      email: leadData.email ? hashForLogging(leadData.email) : '[MISSING]'
    });

    const contactProperties = {
      email: leadData.email || '',
      firstname: leadData.first_name || '',
      lastname: leadData.last_name || '',
      phone: leadData.phone || '',
      company: leadData.company || '',
      jobtitle: leadData.job_title || '',
      lead_source: 'HubSpot CRM',
      lead_source_detail: leadData.source || 'Direct Import'
    };

    // Remove empty values to avoid HubSpot validation errors
    Object.keys(contactProperties).forEach(key => {
      if (contactProperties[key] === '' || contactProperties[key] === null || contactProperties[key] === undefined) {
        delete contactProperties[key];
      }
    });

    const createRequest = {
      properties: contactProperties
    };

    const response = await hubspotClient.crm.contacts.basicApi.create(createRequest);
    
    logger.logLeadProcessing(trackingId, 'hubspot_contact_created', {
      contactId: response.id,
      email: leadData.email ? hashForLogging(leadData.email) : '[MISSING]'
    });

    return response;

  } catch (error) {
    logger.logError(error, {
      context: 'hubspot_contact_creation',
      trackingId,
      leadId: leadData.id,
      email: leadData.email ? hashForLogging(leadData.email) : '[MISSING]'
    });
    throw error;
  }
}

/**
 * Update an existing HubSpot contact
 * @param {string} contactId - HubSpot contact ID
 * @param {Object} leadData - Transformed lead data
 * @param {string} trackingId - Tracking ID for logging
 * @returns {Object} Updated contact
 */
export async function updateHubSpotContact(contactId, leadData, trackingId) {
  try {
    logger.logLeadProcessing(trackingId, 'updating_hubspot_contact', {
      contactId,
      email: leadData.email ? hashForLogging(leadData.email) : '[MISSING]'
    });

    const updateProperties = {
      // Update basic fields only if they have values and are different
      ...(leadData.first_name && { firstname: leadData.first_name }),
      ...(leadData.last_name && { lastname: leadData.last_name }),
      ...(leadData.phone && { phone: leadData.phone }),
      ...(leadData.company && { company: leadData.company }),
      ...(leadData.job_title && { jobtitle: leadData.job_title }),
      last_updated_date: new Date().toISOString()
    };

    // Remove empty values
    Object.keys(updateProperties).forEach(key => {
      if (updateProperties[key] === '' || updateProperties[key] === null || updateProperties[key] === undefined) {
        delete updateProperties[key];
      }
    });

    const updateRequest = {
      properties: updateProperties
    };

    const response = await hubspotClient.crm.contacts.basicApi.update(contactId, updateRequest);
    
    logger.logLeadProcessing(trackingId, 'hubspot_contact_updated', {
      contactId,
      email: leadData.email ? hashForLogging(leadData.email) : '[MISSING]'
    });

    return response;

  } catch (error) {
    logger.logError(error, {
      context: 'hubspot_contact_update',
      trackingId,
      contactId,
      leadId: leadData.id,
      email: leadData.email ? hashForLogging(leadData.email) : '[MISSING]'
    });
    throw error;
  }
}

/**
 * Upsert (create or update) a HubSpot contact
 * @param {Object} leadData - Transformed lead data
 * @param {string} trackingId - Tracking ID for logging
 * @returns {Object} Contact data and operation type
 */
export async function upsertHubSpotContact(leadData, trackingId) {
  try {
    logger.logLeadProcessing(trackingId, 'hubspot_upsert_started', {
      leadId: leadData.id,
      email: leadData.email ? hashForLogging(leadData.email) : '[MISSING]'
    });

    let contact;
    let operation;

    // Try to find existing contact by email
    if (leadData.email) {
      const existingContact = await findHubSpotContactByEmail(leadData.email, trackingId);
      
      if (existingContact) {
        // Update existing contact
        contact = await updateHubSpotContact(existingContact.id, leadData, trackingId);
        operation = 'updated';
      } else {
        // Create new contact
        contact = await createHubSpotContact(leadData, trackingId);
        operation = 'created';
      }
    } else {
      // No email provided, create new contact anyway
      logger.logLeadProcessing(trackingId, 'hubspot_no_email_creating_anyway', {
        leadId: leadData.id
      });
      contact = await createHubSpotContact(leadData, trackingId);
      operation = 'created';
    }

    logger.logLeadProcessing(trackingId, 'hubspot_upsert_completed', {
      contactId: contact.id,
      operation,
      email: leadData.email ? hashForLogging(leadData.email) : '[MISSING]'
    });

    return {
      ...contact,
      operation
    };

  } catch (error) {
    logger.logError(error, {
      context: 'hubspot_upsert',
      trackingId,
      leadId: leadData.id,
      email: leadData.email ? hashForLogging(leadData.email) : '[MISSING]'
    });
    throw error;
  }
}