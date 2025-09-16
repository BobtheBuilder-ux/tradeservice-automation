import { db } from '../config/index.js';
import { leads, agents } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import logger from '../utils/logger.js';
import EmailService from './email-service.js';
import { hashForLogging } from '../utils/crypto.js';

/**
 * Check database connection
 * This function should be called during application startup
 */
export async function checkDatabaseConnection() {
  try {
    logger.info('Checking database connection');
    
    // Simple query to test connection
    await db.select().from(leads).limit(1);
    
    logger.info('Database connection successful');
    return true;

  } catch (error) {
    logger.logError(error, { context: 'check_database_connection' });
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
    logger.logLeadProcessing(trackingId, 'searching_database_lead', {
      hubspotContactId
    });

    const result = await db
      .select()
      .from(leads)
      .where(eq(leads.hubspotContactId, hubspotContactId))
      .limit(1);

    const data = result[0] || null;

    if (data) {
      logger.logLeadProcessing(trackingId, 'database_lead_found', {
        leadId: data.id,
        hubspotContactId
      });
      return data;
    }

    logger.logLeadProcessing(trackingId, 'database_lead_not_found', {
      hubspotContactId
    });
    return null;

  } catch (error) {
    logger.logError(error, {
      context: 'database_lead_search',
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
    logger.logLeadProcessing(trackingId, 'searching_database_lead_by_email', {
      email: hashForLogging(email)
    });

    const result = await db
      .select()
      .from(leads)
      .where(eq(leads.email, email))
      .limit(1);

    const data = result[0] || null;

    if (data) {
      logger.logLeadProcessing(trackingId, 'database_lead_found_by_email', {
        leadId: data.id,
        email: hashForLogging(email)
      });
      return data;
    }

    logger.logLeadProcessing(trackingId, 'database_lead_not_found_by_email', {
      email: hashForLogging(email)
    });
    return null;

  } catch (error) {
    logger.logError(error, {
      context: 'database_lead_search_by_email',
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
    logger.logLeadProcessing(trackingId, 'creating_database_lead', {
      hubspotContactId: leadData.hubspot_contact_id,
      email: leadData.email ? hashForLogging(leadData.email) : '[MISSING]'
    });

    const leadRecord = {
      hubspotContactId: leadData.hubspot_contact_id,
      email: leadData.email,
      firstName: leadData.first_name,
      lastName: leadData.last_name,
      fullName: leadData.full_name,
      phone: leadData.phone,
      jobTitle: leadData.job_title,
      website: leadData.website,
      city: leadData.city,
      state: leadData.state,
      country: leadData.country,
      leadSource: leadData.lead_source,
      lifecycleStage: leadData.lifecycle_stage,
      hubspotOwnerId: leadData.hubspot_owner_id,
      hubspotDealIds: leadData.hubspot_deal_ids,
      customProperties: leadData.custom_properties,
      hubspotRawData: leadData.hubspot_raw_data,
      status: 'new',
      source: 'hubspot_crm',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Remove null/undefined values
    Object.keys(leadRecord).forEach(key => {
      if (leadRecord[key] === null || leadRecord[key] === undefined) {
        delete leadRecord[key];
      }
    });

    const result = await db
      .insert(leads)
      .values(leadRecord)
      .returning();

    const data = result[0];

    logger.logLeadProcessing(trackingId, 'database_lead_created', {
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
    logger.logLeadProcessing(trackingId, 'updating_database_lead', {
      leadId,
      hubspotContactId: leadData.hubspot_contact_id,
      email: leadData.email ? hashForLogging(leadData.email) : '[MISSING]'
    });

    const updateData = {
      // Update basic contact info if provided
      ...(leadData.email && { email: leadData.email }),
      ...(leadData.first_name && { firstName: leadData.first_name }),
      ...(leadData.last_name && { lastName: leadData.last_name }),
      ...(leadData.full_name && { fullName: leadData.full_name }),
      ...(leadData.phone && { phone: leadData.phone }),
      ...(leadData.job_title && { jobTitle: leadData.job_title }),
      ...(leadData.website && { website: leadData.website }),
      ...(leadData.city && { city: leadData.city }),
      ...(leadData.state && { state: leadData.state }),
      ...(leadData.country && { country: leadData.country }),
      // Always update HubSpot-specific data
      leadSource: leadData.lead_source,
      lifecycleStage: leadData.lifecycle_stage,
      hubspotOwnerId: leadData.hubspot_owner_id,
      hubspotDealIds: leadData.hubspot_deal_ids,
      customProperties: leadData.custom_properties,
      hubspotRawData: leadData.hubspot_raw_data,
      updatedAt: new Date(),
      lastHubspotUpdate: new Date()
    };

    // Remove null/undefined values
    Object.keys(updateData).forEach(key => {
      if (updateData[key] === null || updateData[key] === undefined) {
        delete updateData[key];
      }
    });

    const result = await db
      .update(leads)
      .set(updateData)
      .where(eq(leads.id, leadId))
      .returning();

    const data = result[0];

    logger.logLeadProcessing(trackingId, 'database_lead_updated', {
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
export async function upsertLeadToDatabase(leadData, trackingId) {
  try {
    logger.logLeadProcessing(trackingId, 'database_upsert_started', {
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

    logger.logLeadProcessing(trackingId, 'database_upsert_completed', {
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
      context: 'database_upsert',
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

    const result = await db
      .update(leads)
      .set({
        status,
        updatedAt: new Date()
      })
      .where(eq(leads.id, leadId))
      .returning();

    const data = result[0];

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
    const result = await db
      .select({
        email: agents.email,
        fullName: agents.fullName
      })
      .from(agents)
      .where(eq(agents.isActive, true));

    const emails = result.map(user => user.email);
    
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