import { calendlyConfig, db } from '../config/index.js';
import { leads, meetings } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import logger from '../utils/logger.js';
import { hashForLogging } from '../utils/crypto.js';
import { updateLeadStatus } from './database-service.js';
import meetingService from './meeting-service.js';

/**
 * Process Calendly webhook events with comprehensive validation and consistency checks
 * @param {Object} webhookData - Calendly webhook payload
 * @param {string} trackingId - Tracking ID for logging
 * @returns {Object} Processing results
 */
export async function processCalendlyEvent(webhookData, trackingId) {
  // Validate webhook data structure
  const validationResult = validateWebhookData(webhookData, trackingId);
  if (!validationResult.isValid) {
    const error = new Error(`Invalid webhook data: ${validationResult.errors.join(', ')}`);
    logger.logError(error, {
      context: 'calendly_webhook_validation',
      trackingId,
      errors: validationResult.errors
    });
    throw error;
  }

  const eventType = webhookData.event;
  const payload = webhookData.payload;

  logger.logLeadProcessing(trackingId, 'calendly_event_processing_started', {
    event: eventType,
    eventTypeUri: payload?.event_type?.uri,
    inviteeEmail: payload?.invitee?.email ? hashForLogging(payload.invitee.email) : '[MISSING]',
    eventUri: payload?.event?.uri,
    validationWarnings: validationResult.warnings
  });

  const results = {
    event: eventType,
    trackingId,
    processed: false,
    leadUpdated: false,
    meetingCreated: false,
    meetingUpdated: false,
    errors: [],
    warnings: validationResult.warnings,
    dataConsistencyChecks: {
      duplicateCheck: false,
      leadExists: false,
      meetingExists: false
    }
  };

  try {
    // Perform data consistency checks before processing
    await performDataConsistencyChecks(payload, results, trackingId);

    switch (eventType) {
      case 'invitee.created':
        results.processed = await handleInviteeCreated(payload, trackingId, results);
        break;
      
      case 'invitee.canceled':
        results.processed = await handleInviteeCanceled(payload, trackingId, results);
        break;
      
      case 'invitee_no_show.created':
        results.processed = await handleInviteeNoShow(payload, trackingId, results);
        break;
      
      case 'invitee.rescheduled':
        results.processed = await handleInviteeRescheduled(payload, trackingId, results);
        break;
      
      default:
        logger.logWebhookProcessing(trackingId, eventType, 'event_type_not_handled', {
          event: eventType
        });
        results.processed = false;
        break;
    }

    // Perform post-processing consistency validation
    await validatePostProcessingState(payload, results, trackingId);

    logger.logLeadProcessing(trackingId, 'calendly_event_processing_completed', {
      event: eventType,
      processed: results.processed,
      leadUpdated: results.leadUpdated,
      meetingCreated: results.meetingCreated,
      meetingUpdated: results.meetingUpdated,
      consistencyChecks: results.dataConsistencyChecks
    });

    return results;

  } catch (error) {
    logger.logError(error, {
      context: 'calendly_event_processing',
      trackingId,
      event: eventType,
      consistencyChecks: results.dataConsistencyChecks
    });
    
    results.errors.push(error.message);
    throw error;
  }
}

/**
 * Validate webhook data structure and required fields
 * @param {Object} webhookData - Webhook data to validate
 * @param {string} trackingId - Tracking ID for logging
 * @returns {Object} Validation result with isValid, errors, and warnings
 */
function validateWebhookData(webhookData, trackingId) {
  const errors = [];
  const warnings = [];

  // Check required top-level fields
  if (!webhookData || typeof webhookData !== 'object') {
    errors.push('Webhook data must be an object');
    return { isValid: false, errors, warnings };
  }

  if (!webhookData.event || typeof webhookData.event !== 'string') {
    errors.push('Missing or invalid event type');
  }

  if (!webhookData.payload || typeof webhookData.payload !== 'object') {
    errors.push('Missing or invalid payload');
  }

  const payload = webhookData.payload;
  if (payload) {
    // Check for required payload fields based on event type
    if (!payload.invitee || typeof payload.invitee !== 'object') {
      errors.push('Missing or invalid invitee data');
    } else {
      if (!payload.invitee.email || typeof payload.invitee.email !== 'string') {
        errors.push('Missing or invalid invitee email');
      }
      if (!payload.invitee.uri || typeof payload.invitee.uri !== 'string') {
        warnings.push('Missing invitee URI');
      }
    }

    if (!payload.event || typeof payload.event !== 'object') {
      errors.push('Missing or invalid event data');
    } else {
      if (!payload.event.uri || typeof payload.event.uri !== 'string') {
        errors.push('Missing or invalid event URI');
      }
      
      // Check time fields for scheduling events
      if (['invitee.created', 'invitee.rescheduled'].includes(webhookData.event)) {
        if (!payload.event.start_time || !payload.event.end_time) {
          errors.push('Missing required start_time or end_time for scheduling event');
        }
      }
    }

    if (!payload.event_type || typeof payload.event_type !== 'object') {
      warnings.push('Missing event_type data');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Perform data consistency checks before processing
 * @param {Object} payload - Event payload
 * @param {Object} results - Results object to update
 * @param {string} trackingId - Tracking ID for logging
 */
async function performDataConsistencyChecks(payload, results, trackingId) {
  try {
    const inviteeEmail = payload.invitee?.email;
    const eventUri = payload.event?.uri;
    
    if (inviteeEmail) {
      // Check if lead exists
      const existingLead = await findLeadByEmail(inviteeEmail, trackingId);
      results.dataConsistencyChecks.leadExists = !!existingLead;
      
      if (existingLead) {
        logger.info('Lead found for consistency check', {
          trackingId,
          leadId: existingLead.id,
          email: hashForLogging(inviteeEmail)
        });
      }
    }
    
    if (eventUri) {
      // Check if meeting already exists
      const eventId = eventUri.split('/').pop();
      const existingMeeting = await db
        .select({ id: meetings.id, status: meetings.status })
        .from(meetings)
        .where(eq(meetings.calendly_event_id, eventId))
        .limit(1);
        
      results.dataConsistencyChecks.meetingExists = existingMeeting.length > 0;
      results.dataConsistencyChecks.duplicateCheck = true;
      
      if (existingMeeting.length > 0) {
        logger.info('Existing meeting found for consistency check', {
          trackingId,
          meetingId: existingMeeting[0].id,
          status: existingMeeting[0].status,
          eventId
        });
      }
    }
    
  } catch (error) {
    logger.warn('Data consistency check failed', {
      trackingId,
      error: error.message
    });
    // Don't throw - consistency checks are informational
  }
}

/**
 * Validate post-processing state for data consistency
 * @param {Object} payload - Event payload
 * @param {Object} results - Processing results
 * @param {string} trackingId - Tracking ID for logging
 */
async function validatePostProcessingState(payload, results, trackingId) {
  try {
    const inviteeEmail = payload.invitee?.email;
    const eventUri = payload.event?.uri;
    
    if (results.processed && inviteeEmail) {
      // Verify lead state is consistent
      const lead = await findLeadByEmail(inviteeEmail, trackingId);
      if (!lead) {
        logger.warn('Post-processing validation: Lead not found after processing', {
          trackingId,
          email: hashForLogging(inviteeEmail)
        });
      }
    }
    
    if (results.meetingCreated && eventUri) {
      // Verify meeting was actually created
      const eventId = eventUri.split('/').pop();
      const meeting = await db
        .select({ id: meetings.id })
        .from(meetings)
        .where(eq(meetings.calendly_event_id, eventId))
        .limit(1);
        
      if (meeting.length === 0) {
        logger.error('Post-processing validation: Meeting not found after creation', {
          trackingId,
          eventId
        });
      }
    }
    
  } catch (error) {
    logger.warn('Post-processing validation failed', {
      trackingId,
      error: error.message
    });
    // Don't throw - validation is informational
  }
}

/**
 * Handle invitee.created event (meeting scheduled) with enhanced consistency checks
 * @param {Object} payload - Event payload
 * @param {string} trackingId - Tracking ID for logging
 * @param {Object} results - Results object to update
 * @returns {boolean} Success status
 */
async function handleInviteeCreated(payload, trackingId, results) {
  try {
    const invitee = payload.invitee;
    const event = payload.event;
    
    logger.logWebhookProcessing(trackingId, 'invitee.created', 'handler_start', {
      inviteeEmail: invitee.email ? hashForLogging(invitee.email) : '[MISSING]',
      eventStartTime: event.start_time,
      eventEndTime: event.end_time
    });

    // Find lead by email
    const lead = await findLeadByEmail(invitee.email, trackingId);
    
    if (lead) {
      // Check for duplicate meeting before creation
      if (results.dataConsistencyChecks.meetingExists) {
        logger.warn('Meeting already exists, skipping creation', {
          trackingId,
          leadId: lead.id
        });
        results.meetingUpdated = true;
        return true;
      }

      // Create meeting record in the new meetings table
      const meetingData = {
        uri: event.uri,
        name: payload.event_type?.name || 'Consultation Meeting',
        description: payload.event_type?.description || '',
        start_time: event.start_time,
        end_time: event.end_time,
        timezone: invitee.timezone || 'UTC',
        location: event.location || {}
      };
      
      const meeting = await meetingService.createMeeting(meetingData, trackingId);
      results.meetingCreated = true;
      
      // Update lead with scheduling information (legacy fields for compatibility)
      await updateLeadWithCalendlyData(lead.id, {
        status: 'scheduled',
        calendly_event_uri: event.uri,
        calendly_invitee_uri: invitee.uri,
        scheduled_at: event.start_time,
        meeting_end_time: event.end_time,
        meeting_location: event.location?.join(', ') || null,
        calendly_event_type: payload.event_type?.name,
        calendly_questions: invitee.questions_and_answers || [],
        calendly_tracking_data: {
          utm_campaign: invitee.tracking?.utm_campaign,
          utm_source: invitee.tracking?.utm_source,
          utm_medium: invitee.tracking?.utm_medium,
          utm_content: invitee.tracking?.utm_content,
          utm_term: invitee.tracking?.utm_term
        }
      }, trackingId);
      results.leadUpdated = true;
      
      logger.logLeadProcessing(trackingId, 'lead_updated_with_scheduling', {
        leadId: lead.id,
        meetingId: meeting.id,
        scheduledAt: event.start_time
      });
      
      return true;
    } else {
      logger.logLeadProcessing(trackingId, 'lead_not_found_for_scheduling', {
        inviteeEmail: invitee.email ? hashForLogging(invitee.email) : '[MISSING]'
      });
      
      // Optionally create a new lead record for the scheduled meeting
      await createLeadFromCalendlyEvent(payload, trackingId);
      results.leadUpdated = true;
      return true;
    }

  } catch (error) {
    logger.logError(error, {
      context: 'handle_invitee_created',
      trackingId
    });
    throw error;
  }
}

/**
 * Handle invitee.canceled event (meeting canceled) with enhanced consistency checks
 * @param {Object} payload - Event payload
 * @param {string} trackingId - Tracking ID for logging
 * @param {Object} results - Results object to update
 * @returns {boolean} Success status
 */
async function handleInviteeCanceled(payload, trackingId, results) {
  try {
    const invitee = payload.invitee;
    
    logger.logWebhookProcessing(trackingId, 'invitee.canceled', 'handler_start', {
      inviteeEmail: invitee.email ? hashForLogging(invitee.email) : '[MISSING]',
      canceledAt: invitee.canceled_at
    });

    // Find lead by email
    const lead = await findLeadByEmail(invitee.email, trackingId);
    
    if (lead) {
      // Check if meeting exists before updating
      if (!results.dataConsistencyChecks.meetingExists) {
        logger.warn('Meeting not found for cancellation', {
          trackingId,
          leadId: lead.id
        });
        return false;
      }

      // Update meeting status in meetings table
      const eventId = payload.event.uri.split('/').pop();
      await meetingService.updateMeetingStatus(eventId, 'canceled', {
        canceledAt: new Date(),
        cancelReason: invitee.cancellation?.reason || 'Canceled by invitee'
      }, trackingId);
      results.meetingUpdated = true;
      
      // Update lead status (legacy compatibility)
      await updateLeadWithCalendlyData(lead.id, {
        status: 'canceled',
        canceled_at: invitee.canceled_at,
        cancellation_reason: invitee.cancellation?.reason || null
      }, trackingId);
      results.leadUpdated = true;
      
      logger.logLeadProcessing(trackingId, 'lead_updated_with_cancellation', {
        leadId: lead.id,
        canceledAt: invitee.canceled_at
      });
      
      return true;
    } else {
      logger.logLeadProcessing(trackingId, 'lead_not_found_for_cancellation', {
        inviteeEmail: invitee.email ? hashForLogging(invitee.email) : '[MISSING]'
      });
      return false;
    }

  } catch (error) {
    logger.logError(error, {
      context: 'handle_invitee_canceled',
      trackingId
    });
    throw error;
  }
}

/**
 * Handle invitee_no_show.created event (meeting no-show) with enhanced consistency checks
 * @param {Object} payload - Event payload
 * @param {string} trackingId - Tracking ID for logging
 * @param {Object} results - Results object to update
 * @returns {boolean} Success status
 */
async function handleInviteeNoShow(payload, trackingId, results) {
  try {
    const invitee = payload.invitee;
    
    logger.logWebhookProcessing(trackingId, 'invitee.no_show', 'handler_start', {
      inviteeEmail: invitee.email ? hashForLogging(invitee.email) : '[MISSING]'
    });

    // Find lead by email
    const lead = await findLeadByEmail(invitee.email, trackingId);
    
    if (lead) {
      // Check if meeting exists before updating
      if (!results.dataConsistencyChecks.meetingExists) {
        logger.warn('Meeting not found for no-show update', {
          trackingId,
          leadId: lead.id
        });
        return false;
      }

      // Update meeting status
      const eventId = payload.event.uri.split('/').pop();
      await meetingService.updateMeetingStatus(eventId, 'no_show', {
        noShowAt: new Date()
      }, trackingId);
      results.meetingUpdated = true;

      await updateLeadWithCalendlyData(lead.id, {
        status: 'no_show',
        no_show_at: new Date().toISOString()
      }, trackingId);
      results.leadUpdated = true;
      
      logger.logLeadProcessing(trackingId, 'lead_updated_with_no_show', {
        leadId: lead.id
      });
      
      return true;
    } else {
      logger.logLeadProcessing(trackingId, 'lead_not_found_for_no_show', {
        inviteeEmail: invitee.email ? hashForLogging(invitee.email) : '[MISSING]'
      });
      return false;
    }

  } catch (error) {
    logger.logError(error, {
      context: 'handle_invitee_no_show',
      trackingId
    });
    throw error;
  }
}

/**
 * Handle invitee.rescheduled event (meeting rescheduled) with enhanced consistency checks
 * @param {Object} payload - Event payload
 * @param {string} trackingId - Tracking ID for logging
 * @param {Object} results - Results object to update
 * @returns {boolean} Success status
 */
async function handleInviteeRescheduled(payload, trackingId, results) {
  try {
    const invitee = payload.invitee;
    const event = payload.event;
    
    logger.logWebhookProcessing(trackingId, 'invitee.rescheduled', 'handler_start', {
      inviteeEmail: invitee.email ? hashForLogging(invitee.email) : '[MISSING]',
      newStartTime: event.start_time,
      rescheduledAt: invitee.rescheduled_at
    });

    // Find lead by email
    const lead = await findLeadByEmail(invitee.email, trackingId);
    
    if (lead) {
      // Check if meeting exists before updating
      if (!results.dataConsistencyChecks.meetingExists) {
        logger.warn('Meeting not found for reschedule update', {
          trackingId,
          leadId: lead.id
        });
        return false;
      }

      // Update meeting with new schedule
      const eventId = payload.event.uri.split('/').pop();
      await meetingService.updateMeetingStatus(eventId, 'rescheduled', {
        startTime: new Date(event.start_time),
        endTime: new Date(event.end_time),
        rescheduledAt: new Date(invitee.rescheduled_at || new Date())
      }, trackingId);
      results.meetingUpdated = true;

      await updateLeadWithCalendlyData(lead.id, {
        status: 'rescheduled',
        scheduled_at: event.start_time,
        meeting_end_time: event.end_time,
        rescheduled_at: invitee.rescheduled_at,
        previous_scheduled_at: lead.scheduled_at // Keep track of previous time
      }, trackingId);
      results.leadUpdated = true;
      
      logger.logLeadProcessing(trackingId, 'lead_updated_with_reschedule', {
        leadId: lead.id,
        newScheduledAt: event.start_time
      });
      
      return true;
    } else {
      logger.logLeadProcessing(trackingId, 'lead_not_found_for_reschedule', {
        inviteeEmail: invitee.email ? hashForLogging(invitee.email) : '[MISSING]'
      });
      return false;
    }

  } catch (error) {
    logger.logError(error, {
      context: 'handle_invitee_rescheduled',
      trackingId
    });
    throw error;
  }
}

/**
 * Find lead by email address
 * @param {string} email - Email address
 * @param {string} trackingId - Tracking ID for logging
 * @returns {Object|null} Lead record or null
 */
async function findLeadByEmail(email, trackingId) {
  if (!email) {
    return null;
  }

  try {
    logger.logLeadProcessing(trackingId, 'searching_lead_by_email', {
      email: hashForLogging(email)
    });

    const [lead] = await db
       .select()
       .from(leads)
       .where(eq(leads.email, email))
       .orderBy(desc(leads.createdAt))
       .limit(1);

    if (lead) {
      logger.logLeadProcessing(trackingId, 'lead_found_by_email', {
        leadId: lead.id,
        email: hashForLogging(email)
      });
      return lead;
    }

    return null;

  } catch (error) {
    logger.logError(error, {
      context: 'find_lead_by_email',
      trackingId,
      email: hashForLogging(email)
    });
    throw error;
  }
}

/**
 * Update lead with Calendly data
 * @param {string} leadId - Lead ID
 * @param {Object} calendlyData - Calendly event data
 * @param {string} trackingId - Tracking ID for logging
 * @returns {Object} Updated lead
 */
async function updateLeadWithCalendlyData(leadId, calendlyData, trackingId) {
  try {
    logger.logLeadProcessing(trackingId, 'updating_lead_with_calendly_data', {
      leadId,
      status: calendlyData.status
    });

    const updateData = {
      ...calendlyData,
      updatedAt: new Date(),
      lastCalendlyUpdate: new Date()
    };

    const [lead] = await db
      .update(leads)
      .set(updateData)
      .where(eq(leads.id, leadId))
      .returning();

    if (!lead) {
      throw new Error(`Lead not found: ${leadId}`);
    }

    logger.logLeadProcessing(trackingId, 'lead_updated_with_calendly_data', {
      leadId: lead.id,
      status: lead.status
    });

    return lead;

  } catch (error) {
    logger.logError(error, {
      context: 'update_lead_with_calendly_data',
      trackingId,
      leadId
    });
    throw error;
  }
}

/**
 * Create a new lead record from Calendly event (for cases where lead doesn't exist)
 * @param {Object} payload - Calendly event payload
 * @param {string} trackingId - Tracking ID for logging
 * @returns {Object} Created lead
 */
async function createLeadFromCalendlyEvent(payload, trackingId) {
  try {
    const invitee = payload.invitee;
    const event = payload.event;
    
    logger.logLeadProcessing(trackingId, 'creating_lead_from_calendly', {
      inviteeEmail: invitee.email ? hashForLogging(invitee.email) : '[MISSING]'
    });

    const leadRecord = {
      email: invitee.email,
      firstName: invitee.first_name || '',
      lastName: invitee.last_name || '',
      fullName: invitee.name || `${invitee.first_name || ''} ${invitee.last_name || ''}`.trim(),
      status: 'scheduled',
      source: 'calendly_direct',
      calendlyEventUri: event.uri,
      calendlyInviteeUri: invitee.uri,
      calendlyStartTime: new Date(event.start_time),
      calendlyEndTime: new Date(event.end_time),
      meetingLocation: event.location?.join(', ') || null,
      calendlyEventType: payload.event_type?.name,
      calendlyQuestions: invitee.questions_and_answers || [],
      calendlyTrackingData: {
        utm_campaign: invitee.tracking?.utm_campaign,
        utm_source: invitee.tracking?.utm_source,
        utm_medium: invitee.tracking?.utm_medium,
        utm_content: invitee.tracking?.utm_content,
        utm_term: invitee.tracking?.utm_term
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Remove null/undefined values
    Object.keys(leadRecord).forEach(key => {
      if (leadRecord[key] === null || leadRecord[key] === undefined || leadRecord[key] === '') {
        delete leadRecord[key];
      }
    });

    const [lead] = await db
      .insert(leads)
      .values(leadRecord)
      .returning();

    if (!lead) {
      throw new Error('Failed to create lead from Calendly event');
    }

    logger.logLeadProcessing(trackingId, 'lead_created_from_calendly', {
      leadId: lead.id,
      email: invitee.email ? hashForLogging(invitee.email) : '[MISSING]'
    });

    return lead;

  } catch (error) {
    logger.logError(error, {
      context: 'create_lead_from_calendly',
      trackingId
    });
    throw error;
  }
}