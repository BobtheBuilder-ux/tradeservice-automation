import { calendlyConfig } from '../config/index.js';
import { supabase } from '../config/index.js';
import logger from '../utils/logger.js';
import { hashForLogging } from '../utils/crypto.js';
import { updateLeadStatus } from './supabase-service.js';
import MeetingService from './meeting-service.js';

/**
 * Process Calendly webhook events
 * @param {Object} webhookData - Calendly webhook payload
 * @param {string} trackingId - Tracking ID for logging
 * @returns {Object} Processing results
 */
export async function processCalendlyEvent(webhookData, trackingId) {
  const eventType = webhookData.event;
  const payload = webhookData.payload;

  logger.logLeadProcessing(trackingId, 'calendly_event_processing_started', {
    event: eventType,
    eventTypeUri: payload?.event_type?.uri,
    inviteeEmail: payload?.invitee?.email ? hashForLogging(payload.invitee.email) : '[MISSING]'
  });

  const results = {
    event: eventType,
    trackingId,
    processed: false,
    leadUpdated: false,
    errors: []
  };

  try {
    switch (eventType) {
      case 'invitee.created':
        results.processed = await handleInviteeCreated(payload, trackingId);
        break;
      
      case 'invitee.canceled':
        results.processed = await handleInviteeCanceled(payload, trackingId);
        break;
      
      case 'invitee_no_show.created':
        results.processed = await handleInviteeNoShow(payload, trackingId);
        break;
      
      case 'invitee.rescheduled':
        results.processed = await handleInviteeRescheduled(payload, trackingId);
        break;
      
      default:
        logger.info('Calendly event type not handled', {
          trackingId,
          event: eventType
        });
        results.processed = false;
        break;
    }

    logger.logLeadProcessing(trackingId, 'calendly_event_processing_completed', {
      event: eventType,
      processed: results.processed
    });

    return results;

  } catch (error) {
    logger.logError(error, {
      context: 'calendly_event_processing',
      trackingId,
      event: eventType
    });
    
    results.errors.push(error.message);
    throw error;
  }
}

/**
 * Handle invitee.created event (meeting scheduled)
 * @param {Object} payload - Event payload
 * @param {string} trackingId - Tracking ID for logging
 * @returns {boolean} Success status
 */
async function handleInviteeCreated(payload, trackingId) {
  try {
    const invitee = payload.invitee;
    const event = payload.event;
    
    logger.logLeadProcessing(trackingId, 'handling_invitee_created', {
      inviteeEmail: invitee.email ? hashForLogging(invitee.email) : '[MISSING]',
      eventStartTime: event.start_time,
      eventEndTime: event.end_time
    });

    // Find lead by email
    const lead = await findLeadByEmail(invitee.email, trackingId);
    
    if (lead) {
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
      
      const meeting = await MeetingService.createMeeting(meetingData, lead.id, trackingId);
      
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
 * Handle invitee.canceled event (meeting canceled)
 * @param {Object} payload - Event payload
 * @param {string} trackingId - Tracking ID for logging
 * @returns {boolean} Success status
 */
async function handleInviteeCanceled(payload, trackingId) {
  try {
    const invitee = payload.invitee;
    
    logger.logLeadProcessing(trackingId, 'handling_invitee_canceled', {
      inviteeEmail: invitee.email ? hashForLogging(invitee.email) : '[MISSING]',
      canceledAt: invitee.canceled_at
    });

    // Find lead by email
    const lead = await findLeadByEmail(invitee.email, trackingId);
    
    if (lead) {
      // Update meeting status in meetings table
      await MeetingService.updateMeetingStatus(
        payload.event.uri,
        'canceled',
        {
          canceled_by: 'invitee',
          reason: invitee.cancellation?.reason || 'No reason provided'
        },
        trackingId
      );
      
      // Update lead status (legacy compatibility)
      await updateLeadWithCalendlyData(lead.id, {
        status: 'canceled',
        canceled_at: invitee.canceled_at,
        cancellation_reason: invitee.cancellation?.reason || null
      }, trackingId);
      
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
 * Handle invitee_no_show.created event (meeting no-show)
 * @param {Object} payload - Event payload
 * @param {string} trackingId - Tracking ID for logging
 * @returns {boolean} Success status
 */
async function handleInviteeNoShow(payload, trackingId) {
  try {
    const invitee = payload.invitee;
    
    logger.logLeadProcessing(trackingId, 'handling_invitee_no_show', {
      inviteeEmail: invitee.email ? hashForLogging(invitee.email) : '[MISSING]'
    });

    // Find lead by email
    const lead = await findLeadByEmail(invitee.email, trackingId);
    
    if (lead) {
      await updateLeadWithCalendlyData(lead.id, {
        status: 'no_show',
        no_show_at: new Date().toISOString()
      }, trackingId);
      
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
 * Handle invitee.rescheduled event (meeting rescheduled)
 * @param {Object} payload - Event payload
 * @param {string} trackingId - Tracking ID for logging
 * @returns {boolean} Success status
 */
async function handleInviteeRescheduled(payload, trackingId) {
  try {
    const invitee = payload.invitee;
    const event = payload.event;
    
    logger.logLeadProcessing(trackingId, 'handling_invitee_rescheduled', {
      inviteeEmail: invitee.email ? hashForLogging(invitee.email) : '[MISSING]',
      newStartTime: event.start_time,
      rescheduledAt: invitee.rescheduled_at
    });

    // Find lead by email
    const lead = await findLeadByEmail(invitee.email, trackingId);
    
    if (lead) {
      await updateLeadWithCalendlyData(lead.id, {
        status: 'rescheduled',
        scheduled_at: event.start_time,
        meeting_end_time: event.end_time,
        rescheduled_at: invitee.rescheduled_at,
        previous_scheduled_at: lead.scheduled_at // Keep track of previous time
      }, trackingId);
      
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

    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .eq('email', email)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    if (data) {
      logger.logLeadProcessing(trackingId, 'lead_found_by_email', {
        leadId: data.id,
        email: hashForLogging(email)
      });
      return data;
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
      updated_at: new Date().toISOString(),
      last_calendly_update: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('leads')
      .update(updateData)
      .eq('id', leadId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    logger.logLeadProcessing(trackingId, 'lead_updated_with_calendly_data', {
      leadId: data.id,
      status: data.status
    });

    return data;

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
      first_name: invitee.first_name || '',
      last_name: invitee.last_name || '',
      full_name: invitee.name || `${invitee.first_name || ''} ${invitee.last_name || ''}`.trim(),
      status: 'scheduled',
      source: 'calendly_direct',
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
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // Remove null/undefined values
    Object.keys(leadRecord).forEach(key => {
      if (leadRecord[key] === null || leadRecord[key] === undefined || leadRecord[key] === '') {
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

    logger.logLeadProcessing(trackingId, 'lead_created_from_calendly', {
      leadId: data.id,
      email: invitee.email ? hashForLogging(invitee.email) : '[MISSING]'
    });

    return data;

  } catch (error) {
    logger.logError(error, {
      context: 'create_lead_from_calendly',
      trackingId
    });
    throw error;
  }
}