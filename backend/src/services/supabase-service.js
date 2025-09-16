import { supabase } from '../config/index.js';
import logger from '../utils/logger.js';
import EmailService from './email-service.js';
import { hashForLogging } from '../utils/crypto.js';

/**
 * Create the leads table schema if it doesn't exist
 * This function should be called during application startup
 */
export async function createLeadsTableIfNotExists() {
  try {
    logger.info('Checking if leads table exists');
    
    // Check if table exists by trying to select from it
    const { error: checkError } = await supabase
      .from('leads')
      .select('count', { count: 'exact', head: true })
      .limit(1);

    if (checkError && checkError.code === 'PGRST116') {
      // Table doesn't exist, create it
      logger.info('Creating leads table');
      
      const { error: createError } = await supabase.rpc('create_leads_table');
      
      if (createError) {
        logger.error('Failed to create leads table', { error: createError });
        throw createError;
      }
      
      logger.info('Leads table created successfully');
    } else if (checkError) {
      logger.error('Error checking leads table', { error: checkError });
      throw checkError;
    } else {
      logger.info('Leads table already exists');
    }

  } catch (error) {
    logger.logError(error, { context: 'create_leads_table' });
    throw error;
  }
}

/**
 * Find existing lead by HubSpot contact ID
 * @param {string} hubspotContactId - HubSpot contact ID
 * @param {string} trackingId - Tracking ID for logging
 * @returns {Object|null} Existing lead or null
 */
export async function findLeadByHubSpotId(hubspotContactId, trackingId) {
  try {
    logger.logLeadProcessing(trackingId, 'searching_supabase_lead', {
      hubspotContactId
    });

    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .eq('hubspot_contact_id', hubspotContactId)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    if (data) {
      logger.logLeadProcessing(trackingId, 'supabase_lead_found', {
        leadId: data.id,
        hubspotContactId
      });
      return data;
    }

    logger.logLeadProcessing(trackingId, 'supabase_lead_not_found', {
      hubspotContactId
    });
    return null;

  } catch (error) {
    logger.logError(error, {
      context: 'supabase_lead_search',
      trackingId,
      hubspotContactId
    });
    throw error;
  }
}

/**
 * Find existing lead by email address
 * @param {string} email - Email address
 * @param {string} trackingId - Tracking ID for logging
 * @returns {Object|null} Existing lead or null
 */
export async function findLeadByEmail(email, trackingId) {
  try {
    logger.logLeadProcessing(trackingId, 'searching_supabase_lead_by_email', {
      email: hashForLogging(email)
    });

    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .eq('email', email)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    if (data) {
      logger.logLeadProcessing(trackingId, 'supabase_lead_found_by_email', {
        leadId: data.id,
        email: hashForLogging(email)
      });
      return data;
    }

    logger.logLeadProcessing(trackingId, 'supabase_lead_not_found_by_email', {
      email: hashForLogging(email)
    });
    return null;

  } catch (error) {
    logger.logError(error, {
      context: 'supabase_lead_search_by_email',
      trackingId,
      email: hashForLogging(email)
    });
    throw error;
  }
}

/**
 * Create a new lead in Supabase
 * @param {Object} leadData - Transformed lead data
 * @param {string} trackingId - Tracking ID for logging
 * @returns {Object} Created lead
 */
export async function createLead(leadData, trackingId) {
  try {
    logger.logLeadProcessing(trackingId, 'creating_supabase_lead', {
      hubspotContactId: leadData.hubspot_contact_id,
      email: leadData.email ? hashForLogging(leadData.email) : '[MISSING]'
    });

    const leadRecord = {
      hubspot_contact_id: leadData.hubspot_contact_id,
      email: leadData.email,
      first_name: leadData.first_name,
      last_name: leadData.last_name,
      full_name: leadData.full_name,
      phone: leadData.phone,
      company: leadData.company,
      job_title: leadData.job_title,
      website: leadData.website,
      city: leadData.city,
      state: leadData.state,
      country: leadData.country,
      lead_source: leadData.lead_source,
      lifecycle_stage: leadData.lifecycle_stage,
      hubspot_owner_id: leadData.hubspot_owner_id,
      hubspot_deal_ids: leadData.hubspot_deal_ids,
      custom_properties: leadData.custom_properties,
      hubspot_raw_data: leadData.hubspot_raw_data,
      status: 'new',
      source: 'hubspot_crm',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // Remove null/undefined values
    Object.keys(leadRecord).forEach(key => {
      if (leadRecord[key] === null || leadRecord[key] === undefined) {
        delete leadRecord[key];
      }
    });

    const { data, error } = await supabase
      .from('leads')
      .insert([leadRecord])
      .select()
      .single();

    if (error) {
      throw error;
    }

    logger.logLeadProcessing(trackingId, 'supabase_lead_created', {
      leadId: data.id,
      hubspotContactId: leadData.hubspot_contact_id,
      email: leadData.email ? hashForLogging(leadData.email) : '[MISSING]'
    });

    // Send email notifications to agents
       try {
         const agentEmails = await getActiveAgentEmails(trackingId);
         if (agentEmails.length > 0) {
           // Send notification to each agent
           for (const agentEmail of agentEmails) {
             await EmailService.sendLeadNotification(agentEmail, data, trackingId);
           }
         
         logger.logLeadProcessing(trackingId, 'lead_notifications_sent', {
           leadId: data.id,
           agentCount: agentEmails.length
         });
       } else {
         logger.logLeadProcessing(trackingId, 'no_active_agents_for_notification', {
           leadId: data.id
         });
       }
     } catch (notificationError) {
       // Don't fail lead creation if notification fails
       logger.logError(notificationError, {
         context: 'lead_notification_failed',
         trackingId,
         leadId: data.id
       });
     }

    return data;

  } catch (error) {
    logger.logError(error, {
      context: 'supabase_lead_creation',
      trackingId,
      hubspotContactId: leadData.hubspot_contact_id,
      email: leadData.email ? hashForLogging(leadData.email) : '[MISSING]'
    });
    throw error;
  }
}

/**
 * Update an existing lead in Supabase
 * @param {string} leadId - Supabase lead ID
 * @param {Object} leadData - Transformed lead data
 * @param {string} trackingId - Tracking ID for logging
 * @returns {Object} Updated lead
 */
export async function updateLead(leadId, leadData, trackingId) {
  try {
    logger.logLeadProcessing(trackingId, 'updating_supabase_lead', {
      leadId,
      hubspotContactId: leadData.hubspot_contact_id,
      email: leadData.email ? hashForLogging(leadData.email) : '[MISSING]'
    });

    const updateData = {
      // Update basic contact info if provided
      ...(leadData.email && { email: leadData.email }),
      ...(leadData.first_name && { first_name: leadData.first_name }),
      ...(leadData.last_name && { last_name: leadData.last_name }),
      ...(leadData.full_name && { full_name: leadData.full_name }),
      ...(leadData.phone && { phone: leadData.phone }),
      ...(leadData.company && { company: leadData.company }),
      ...(leadData.job_title && { job_title: leadData.job_title }),
      ...(leadData.website && { website: leadData.website }),
      ...(leadData.city && { city: leadData.city }),
      ...(leadData.state && { state: leadData.state }),
      ...(leadData.country && { country: leadData.country }),
      // Always update HubSpot-specific data
      lead_source: leadData.lead_source,
      lifecycle_stage: leadData.lifecycle_stage,
      hubspot_owner_id: leadData.hubspot_owner_id,
      hubspot_deal_ids: leadData.hubspot_deal_ids,
      custom_properties: leadData.custom_properties,
      hubspot_raw_data: leadData.hubspot_raw_data,
      updated_at: new Date().toISOString(),
      last_hubspot_update: new Date().toISOString()
    };

    // Remove null/undefined values
    Object.keys(updateData).forEach(key => {
      if (updateData[key] === null || updateData[key] === undefined) {
        delete updateData[key];
      }
    });

    const { data, error } = await supabase
      .from('leads')
      .update(updateData)
      .eq('id', leadId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    logger.logLeadProcessing(trackingId, 'supabase_lead_updated', {
      leadId: data.id,
      hubspotContactId: leadData.hubspot_contact_id,
      email: leadData.email ? hashForLogging(leadData.email) : '[MISSING]'
    });

    return data;

  } catch (error) {
    logger.logError(error, {
      context: 'supabase_lead_update',
      trackingId,
      leadId,
      hubspotContactId: leadData.hubspot_contact_id,
      email: leadData.email ? hashForLogging(leadData.email) : '[MISSING]'
    });
    throw error;
  }
}

/**
 * Upsert (create or update) a lead in Supabase
 * @param {Object} leadData - Transformed lead data
 * @param {string} trackingId - Tracking ID for logging
 * @returns {Object} Lead data and operation type
 */
export async function upsertLeadToSupabase(leadData, trackingId) {
  try {
    logger.logLeadProcessing(trackingId, 'supabase_upsert_started', {
      hubspotContactId: leadData.hubspot_contact_id,
      email: leadData.email ? hashForLogging(leadData.email) : '[MISSING]'
    });

    let lead;
    let operation;

    // Try to find existing lead by HubSpot contact ID first
    let existingLead = await findLeadByHubSpotId(leadData.hubspot_contact_id, trackingId);
    
    // If not found by HubSpot ID, try by email as fallback
    if (!existingLead && leadData.email) {
      existingLead = await findLeadByEmail(leadData.email, trackingId);
      if (existingLead) {
        logger.logLeadProcessing(trackingId, 'lead_found_by_email_fallback', {
          leadId: existingLead.id,
          hubspotContactId: leadData.hubspot_contact_id,
          email: hashForLogging(leadData.email)
        });
      }
    }
    
    if (existingLead) {
      // Update existing lead
      lead = await updateLead(existingLead.id, leadData, trackingId);
      operation = 'updated';
    } else {
      // Create new lead
      lead = await createLead(leadData, trackingId);
      operation = 'created';
    }

    logger.logLeadProcessing(trackingId, 'supabase_upsert_completed', {
      leadId: lead.id,
      operation,
      hubspotContactId: leadData.hubspot_contact_id,
      email: leadData.email ? hashForLogging(leadData.email) : '[MISSING]'
    });

    return {
      ...lead,
      operation
    };

  } catch (error) {
    logger.logError(error, {
      context: 'supabase_upsert',
      trackingId,
      hubspotContactId: leadData.hubspot_contact_id,
      email: leadData.email ? hashForLogging(leadData.email) : '[MISSING]'
    });
    throw error;
  }
}

/**
 * Update lead status
 * @param {string} leadId - Supabase lead ID
 * @param {string} status - New status
 * @param {string} trackingId - Tracking ID for logging
 * @returns {Object} Updated lead
 */
export async function updateLeadStatus(leadId, status, trackingId) {
  try {
    logger.logLeadProcessing(trackingId, 'updating_lead_status', {
      leadId,
      status
    });

    const { data, error } = await supabase
      .from('leads')
      .update({
        status,
        updated_at: new Date().toISOString()
      })
      .eq('id', leadId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    logger.logLeadProcessing(trackingId, 'lead_status_updated', {
      leadId: data.id,
      status
    });

    return data;

  } catch (error) {
    logger.logError(error, {
      context: 'update_lead_status',
      trackingId,
      leadId,
      status
    });
    throw error;
  }
}

/**
 * Get active agent emails for notifications
 * @param {string} trackingId - Tracking ID for logging
 * @returns {Array} Array of agent email addresses
 */
export async function getActiveAgentEmails(trackingId) {
  try {
    logger.logLeadProcessing(trackingId, 'fetching_agent_emails', {});

    // Use agents table to get active agent emails
    const { data, error } = await supabase
      .from('agents')
      .select('email, full_name')
      .eq('is_active', true);

    if (error) {
      throw error;
    }

    const emails = data.map(user => user.email);
    
    logger.logLeadProcessing(trackingId, 'agent_emails_fetched', {
      agentCount: emails.length
    });

    return emails;

  } catch (error) {
    logger.logError(error, {
      context: 'get_active_agent_emails',
      trackingId
    });
    throw error;
  }
}