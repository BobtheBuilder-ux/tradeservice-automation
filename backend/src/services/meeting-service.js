import { db } from '../config/index.js';
import { leads, meetings, meetingReminders } from '../db/schema.js';
import { eq, and, gte, lte, lt, isNull, asc } from 'drizzle-orm';
import logger from '../utils/logger.js';
import { hashForLogging } from '../utils/crypto.js';
import TwilioSmsService from './twilio-sms-service.js';
import EmailTemplateService from './email-template-service.js';

// Retry configuration
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 10000, // 10 seconds
  backoffMultiplier: 2
};

// Database error types that should be retried
const RETRYABLE_ERROR_CODES = [
  'ECONNRESET',
  'ENOTFOUND',
  'ECONNREFUSED',
  'ETIMEDOUT',
  '40001', // PostgreSQL serialization failure
  '40P01', // PostgreSQL deadlock detected
  '53300', // PostgreSQL too many connections
  '08006', // PostgreSQL connection failure
  '08001', // PostgreSQL unable to connect
  '08004'  // PostgreSQL connection rejected
];

/**
 * Meeting Service - Handles all meeting-related database operations
 */
class MeetingService {
  /**
   * Execute database operation with retry logic
   * @param {Function} operation - Database operation to execute
   * @param {string} operationName - Name of the operation for logging
   * @param {string} trackingId - Tracking ID for logging
   * @param {Object} retryConfig - Retry configuration override
   * @returns {Promise<any>} - Operation result
   */
  async executeWithRetry(operation, operationName, trackingId, retryConfig = RETRY_CONFIG) {
    let lastError;
    
    for (let attempt = 1; attempt <= retryConfig.maxRetries; attempt++) {
      try {
        const startTime = Date.now();
        const result = await operation();
        const duration = Date.now() - startTime;
        
        if (attempt > 1) {
          logger.info(`Database operation succeeded after retry`, {
            trackingId,
            operation: operationName,
            attempt,
            duration
          });
        }
        
        return result;
      } catch (error) {
        lastError = error;
        const isRetryable = this.isRetryableError(error);
        const isLastAttempt = attempt === retryConfig.maxRetries;
        
        logger.warn(`Database operation failed`, {
          trackingId,
          operation: operationName,
          attempt,
          error: error.message,
          errorCode: error.code,
          isRetryable,
          isLastAttempt
        });
        
        if (!isRetryable || isLastAttempt) {
          break;
        }
        
        // Calculate delay with exponential backoff
        const delay = Math.min(
          retryConfig.baseDelay * Math.pow(retryConfig.backoffMultiplier, attempt - 1),
          retryConfig.maxDelay
        );
        
        logger.info(`Retrying database operation after delay`, {
          trackingId,
          operation: operationName,
          attempt: attempt + 1,
          delay
        });
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    // If we get here, all retries failed
    logger.error(`Database operation failed after all retries`, {
      trackingId,
      operation: operationName,
      maxRetries: retryConfig.maxRetries,
      finalError: lastError.message
    });
    
    throw lastError;
  }
  
  /**
   * Check if an error is retryable
   * @param {Error} error - Error to check
   * @returns {boolean} - True if error is retryable
   */
  isRetryableError(error) {
    if (!error) return false;
    
    // Check error code
    if (error.code && RETRYABLE_ERROR_CODES.includes(error.code)) {
      return true;
    }
    
    // Check error message for common retryable patterns
    const errorMessage = error.message?.toLowerCase() || '';
    const retryablePatterns = [
      'connection',
      'timeout',
      'network',
      'temporary',
      'deadlock',
      'serialization',
      'lock wait timeout'
    ];
    
    return retryablePatterns.some(pattern => errorMessage.includes(pattern));
  }
  
  /**
   * Execute database transaction with retry logic
   * @param {Function} transactionFn - Transaction function
   * @param {string} operationName - Name of the operation for logging
   * @param {string} trackingId - Tracking ID for logging
   * @returns {Promise<any>} - Transaction result
   */
  async executeTransaction(transactionFn, operationName, trackingId) {
    return this.executeWithRetry(async () => {
      return await db.transaction(async (tx) => {
        logger.info(`Starting database transaction`, {
          trackingId,
          operation: operationName
        });
        
        try {
          const result = await transactionFn(tx);
          
          logger.info(`Database transaction completed successfully`, {
            trackingId,
            operation: operationName
          });
          
          return result;
        } catch (error) {
          logger.error(`Database transaction failed, rolling back`, {
            trackingId,
            operation: operationName,
            error: error.message
          });
          throw error;
        }
      });
    }, `transaction_${operationName}`, trackingId);
  }
  
  /**
   * Create a new meeting record with comprehensive error handling
   * @param {Object} meetingData - Meeting information from Calendly
   * @param {string} leadId - Associated lead ID
   * @param {string} trackingId - Tracking ID for logging
   * @returns {Object} Created meeting record
   */
  async createMeeting(meetingData, leadId, trackingId) {
    // Validate input data
    if (!meetingData || !leadId) {
      const error = new Error('Missing required parameters: meetingData and leadId are required');
      logger.logError(error, { context: 'create_meeting_validation', trackingId, leadId });
      throw error;
    }

    if (!meetingData.start_time || !meetingData.end_time) {
      const error = new Error('Missing required meeting times: start_time and end_time are required');
      logger.logError(error, { context: 'create_meeting_validation', trackingId, leadId });
      throw error;
    }

    return this.executeTransaction(async (tx) => {
      logger.logMeetingOperation('create_meeting_start', null, {
        trackingId,
        leadId,
        calendlyEventId: meetingData.uri,
        startTime: meetingData.start_time
      });

      // Extract Calendly event ID from URI
      const calendlyEventId = meetingData.uri ? meetingData.uri.split('/').pop() : null;
      
      // Check for existing meeting with same Calendly event ID
      if (calendlyEventId) {
        const existingMeeting = await tx
          .select({ id: meetings.id })
          .from(meetings)
          .where(eq(meetings.calendlyEventId, calendlyEventId))
          .limit(1);
          
        if (existingMeeting.length > 0) {
          logger.warn('Meeting with Calendly event ID already exists', {
            trackingId,
            calendlyEventId,
            existingMeetingId: existingMeeting[0].id
          });
          // Return existing meeting instead of creating duplicate
          const [existing] = await tx
            .select()
            .from(meetings)
            .where(eq(meetings.id, existingMeeting[0].id));
          return existing;
        }
      }
      
      // Prepare meeting data for the meetings table
      const meetingRecord = {
        leadId: leadId,
        calendlyEventId: calendlyEventId,
        meetingType: meetingData.event_type?.name || 'consultation',
        title: meetingData.name || meetingData.event_type?.name || 'Meeting',
        description: meetingData.description || meetingData.event_type?.description || '',
        startTime: new Date(meetingData.start_time),
        endTime: new Date(meetingData.end_time),
        timezone: meetingData.timezone || 'UTC',
        status: 'scheduled',
        meetingUrl: meetingData.location?.join_url || null,
        location: Array.isArray(meetingData.location) ? meetingData.location.join(', ') : 
                 (typeof meetingData.location === 'object' ? meetingData.location.location : meetingData.location) || 'Online',
        attendeeEmail: meetingData.invitee?.email || null,
        attendeeName: meetingData.invitee?.name || null,
        attendeePhone: meetingData.invitee?.phone || null,
        metadata: {
          calendly_event_uri: meetingData.uri,
          calendly_invitee_uri: meetingData.invitee?.uri,
          event_type_uri: meetingData.event_type?.uri,
          questions_and_answers: meetingData.invitee?.questions_and_answers || [],
          tracking: meetingData.invitee?.tracking || {},
          payment: meetingData.invitee?.payment || null,
          created_via: 'webhook',
          processing_attempt: 1
        }
      };

      // Create meeting record in meetings table
      const [meeting] = await tx
        .insert(meetings)
        .values(meetingRecord)
        .returning();

      if (!meeting) {
        throw new Error('Failed to create meeting record - no data returned');
      }

      // Update lead with Calendly data for backward compatibility
      await this.updateLeadWithCalendlyDataTransaction(tx, leadId, {
        calendly_event_uri: meetingData.uri,
        calendly_invitee_uri: meetingData.invitee?.uri,
        scheduled_at: meetingData.start_time,
        meeting_end_time: meetingData.end_time,
        meeting_location: meetingRecord.location,
        calendly_event_type: meetingData.event_type?.name,
        status: 'scheduled'
      }, trackingId);

      logger.logMeetingOperation('create_meeting_success', meeting.id, {
        trackingId,
        leadId: leadId,
        calendlyEventId: meeting.calendlyEventId
      });

      return meeting;
    }, 'create_meeting', trackingId).then(async (meeting) => {
      // Schedule reminders outside of transaction to avoid blocking
      try {
        await this.scheduleReminders(meeting.id, meeting.startTime, trackingId);
      } catch (reminderError) {
        logger.warn('Failed to schedule reminders, but meeting was created successfully', {
          trackingId,
          meetingId: meeting.id,
          error: reminderError.message
        });
        // Don't throw here - meeting creation was successful
      }
      
      return meeting;
    });
  }

  /**
   * Helper method to update lead with Calendly data
   * @param {string} leadId - Lead ID
   * @param {Object} calendlyData - Calendly data
   * @param {string} trackingId - Tracking ID for logging
   */
  async updateLeadWithCalendlyData(leadId, calendlyData, trackingId) {
    return this.executeWithRetry(async () => {
      const updateFields = {
        calendlyEventUri: calendlyData.calendly_event_uri,
        calendlyInviteeUri: calendlyData.calendly_invitee_uri,
        scheduledAt: calendlyData.scheduled_at ? new Date(calendlyData.scheduled_at) : null,
        meetingEndTime: calendlyData.meeting_end_time ? new Date(calendlyData.meeting_end_time) : null,
        meetingLocation: calendlyData.meeting_location,
        calendlyEventType: calendlyData.calendly_event_type,
        status: calendlyData.status || 'scheduled',
        lastCalendlyUpdate: new Date(),
        updatedAt: new Date()
      };

      const [updatedLead] = await db
        .update(leads)
        .set(updateFields)
        .where(eq(leads.id, leadId))
        .returning();

      if (!updatedLead) {
        throw new Error(`Lead not found or update failed for leadId: ${leadId}`);
      }

      logger.logLeadProcessing(trackingId, 'lead_updated_with_calendly_data', {
        leadId,
        status: updateFields.status
      });

      return updatedLead;
    }, 'update_lead_with_calendly_data', trackingId);
  }

  /**
   * Update lead with Calendly data within a transaction
   * @param {Object} tx - Database transaction object
   * @param {string} leadId - Lead ID
   * @param {Object} calendlyData - Calendly data
   * @param {string} trackingId - Tracking ID for logging
   */
  async updateLeadWithCalendlyDataTransaction(tx, leadId, calendlyData, trackingId) {
    const updateFields = {
      calendlyEventUri: calendlyData.calendly_event_uri,
      calendlyInviteeUri: calendlyData.calendly_invitee_uri,
      scheduledAt: calendlyData.scheduled_at ? new Date(calendlyData.scheduled_at) : null,
      meetingEndTime: calendlyData.meeting_end_time ? new Date(calendlyData.meeting_end_time) : null,
      meetingLocation: calendlyData.meeting_location,
      calendlyEventType: calendlyData.calendly_event_type,
      status: calendlyData.status || 'scheduled',
      lastCalendlyUpdate: new Date(),
      updatedAt: new Date()
    };

    const [updatedLead] = await tx
      .update(leads)
      .set(updateFields)
      .where(eq(leads.id, leadId))
      .returning();

    if (!updatedLead) {
      throw new Error(`Lead not found or update failed for leadId: ${leadId}`);
    }

    logger.logLeadProcessing(trackingId, 'lead_updated_with_calendly_data_transaction', {
      leadId,
      status: updateFields.status
    });

    return updatedLead;
  }

  /**
   * Update meeting status (canceled, completed, no-show, etc.) with comprehensive error handling
   * @param {string} calendlyEventId - Calendly event ID
   * @param {string} status - New meeting status
   * @param {Object} updateData - Additional update data
   * @param {string} trackingId - Tracking ID for logging
   * @returns {Object} Updated meeting record
   */
  async updateMeetingStatus(calendlyEventId, status, updateData = {}, trackingId) {
    // Validate input
    if (!calendlyEventId || !status) {
      const error = new Error('Missing required parameters: calendlyEventId and status are required');
      logger.logError(error, { context: 'update_meeting_status_validation', trackingId });
      throw error;
    }

    const validStatuses = ['scheduled', 'canceled', 'completed', 'rescheduled', 'no_show'];
    if (!validStatuses.includes(status)) {
      const error = new Error(`Invalid status: ${status}. Valid statuses are: ${validStatuses.join(', ')}`);
      logger.logError(error, { context: 'update_meeting_status_validation', trackingId });
      throw error;
    }

    return this.executeTransaction(async (tx) => {
      logger.logMeetingOperation('update_status_start', null, {
        trackingId,
        calendlyEventId,
        newStatus: status
      });

      // Extract event ID from URI if needed
      const eventId = calendlyEventId.includes('/') ? calendlyEventId.split('/').pop() : calendlyEventId;

      // First, find the meeting to get current status
      const existingMeeting = await tx
        .select()
        .from(meetings)
        .where(eq(meetings.calendlyEventId, eventId))
        .limit(1);

      if (existingMeeting.length === 0) {
        logger.warn('No meeting found for Calendly event', {
          trackingId,
          calendlyEventId,
          eventId
        });
        
        // Try to find by URI in leads table for backward compatibility
        const leadWithEvent = await tx
          .select()
          .from(leads)
          .where(eq(leads.calendlyEventUri, calendlyEventId))
          .limit(1);
          
        if (leadWithEvent.length > 0) {
          logger.info('Found lead with Calendly event, updating lead status only', {
            trackingId,
            leadId: leadWithEvent[0].id,
            calendlyEventId
          });
          
          const [updatedLead] = await tx
            .update(leads)
            .set({
              status: status === 'canceled' ? 'canceled' : 
                     status === 'completed' ? 'completed' : 'scheduled',
              updatedAt: new Date()
            })
            .where(eq(leads.id, leadWithEvent[0].id))
            .returning();
            
          return { leadOnly: true, lead: updatedLead };
        }
        
        throw new Error(`No meeting or lead found for Calendly event: ${calendlyEventId}`);
      }

      const currentMeeting = existingMeeting[0];
      const oldStatus = currentMeeting.status;

      const updateFields = {
        status,
        updatedAt: new Date(),
        ...updateData
      };

      // Add specific fields based on status
      if (status === 'canceled') {
        updateFields.canceledAt = new Date();
        updateFields.metadata = {
          ...currentMeeting.metadata,
          ...updateData.metadata,
          canceled_at: new Date().toISOString(),
          canceled_by: updateData.canceled_by || 'system',
          cancellation_reason: updateData.reason || ''
        };
      } else if (status === 'no_show') {
        updateFields.metadata = {
          ...currentMeeting.metadata,
          ...updateData.metadata,
          no_show_at: new Date().toISOString(),
          attended: false
        };
      } else if (status === 'completed') {
        updateFields.completedAt = new Date();
        updateFields.metadata = {
          ...currentMeeting.metadata,
          ...updateData.metadata,
          completed_at: new Date().toISOString(),
          attended: true
        };
      } else if (status === 'rescheduled') {
        updateFields.rescheduledAt = new Date();
      }

      // Update meeting record in meetings table
      const [meeting] = await tx
        .update(meetings)
        .set(updateFields)
        .where(eq(meetings.calendlyEventId, eventId))
        .returning();

      if (!meeting) {
        throw new Error(`Failed to update meeting status for event: ${eventId}`);
      }

      // Also update lead record for backward compatibility
      const leadStatus = status === 'canceled' ? 'canceled' : 
                        status === 'completed' ? 'completed' : 
                        status === 'no_show' ? 'no_show' : 'scheduled';
                        
      const leadUpdateFields = {
        status: leadStatus,
        lastCalendlyUpdate: new Date(),
        updatedAt: new Date()
      };

      if (status === 'canceled') {
        leadUpdateFields.canceledAt = new Date();
        leadUpdateFields.cancellationReason = updateData.reason || '';
      } else if (status === 'no_show') {
        leadUpdateFields.noShowAt = new Date();
      }

      const [updatedLead] = await tx
        .update(leads)
        .set(leadUpdateFields)
        .where(eq(leads.id, meeting.leadId))
        .returning();

      logger.logMeetingOperation('update_status_success', meeting.id, {
        trackingId,
        leadId: meeting.leadId,
        oldStatus,
        newStatus: status,
        leadStatus: updatedLead?.status
      });

      return { meeting, lead: updatedLead };
    }, 'update_meeting_status', trackingId);
  }

  /**
   * Get meetings that need 24-hour reminders
   * @returns {Array} Meetings needing 24-hour reminders
   */
  async getMeetingsNeedingDailyReminders() {
    try {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStart = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate());
      const tomorrowEnd = new Date(tomorrowStart);
      tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);

      const meetingsData = await db
        .select({
          id: meetings.id,
          leadId: meetings.leadId,
          agentId: meetings.agentId,
          calendlyEventId: meetings.calendlyEventId,
          meetingType: meetings.meetingType,
          title: meetings.title,
          description: meetings.description,
          startTime: meetings.startTime,
          endTime: meetings.endTime,
          timezone: meetings.timezone,
          status: meetings.status,
          meetingUrl: meetings.meetingUrl,
          location: meetings.location,
          attendeeEmail: meetings.attendeeEmail,
          attendeeName: meetings.attendeeName,
          attendeePhone: meetings.attendeePhone,
          reminderSent: meetings.reminderSent,
          followUpSent: meetings.followUpSent,
          reminder24hSent: meetings.reminder24hSent,
          reminder1hSent: meetings.reminder1hSent,
          notes: meetings.notes,
          metadata: meetings.metadata,
          createdAt: meetings.createdAt,
          updatedAt: meetings.updatedAt,
          leads: {
            id: leads.id,
            email: leads.email,
            fullName: leads.fullName,
            firstName: leads.firstName,
            lastName: leads.lastName
          }
        })
        .from(meetings)
        .innerJoin(leads, eq(meetings.leadId, leads.id))
        .where(
          and(
            eq(meetings.status, 'scheduled'),
            eq(meetings.reminder24hSent, false),
            gte(meetings.startTime, tomorrowStart),
            lt(meetings.startTime, tomorrowEnd)
          )
        );

      logger.info(`Found ${meetingsData.length} meetings needing 24-hour reminders`);
      return meetingsData;
    } catch (error) {
      logger.logError(error, { context: 'get_meetings_needing_daily_reminders' });
      throw error;
    }
  }

  /**
   * Get meetings that need 1-hour reminders
   * @returns {Array} Meetings needing 1-hour reminders
   */
  async getMeetingsNeedingHourlyReminders() {
    try {
      const oneHourFromNow = new Date();
      oneHourFromNow.setHours(oneHourFromNow.getHours() + 1);
      const reminderWindow = new Date(oneHourFromNow);
      reminderWindow.setMinutes(reminderWindow.getMinutes() + 30); // 30-minute window

      const meetingsData = await db
        .select({
          id: meetings.id,
          leadId: meetings.leadId,
          agentId: meetings.agentId,
          calendlyEventId: meetings.calendlyEventId,
          meetingType: meetings.meetingType,
          title: meetings.title,
          description: meetings.description,
          startTime: meetings.startTime,
          endTime: meetings.endTime,
          timezone: meetings.timezone,
          status: meetings.status,
          meetingUrl: meetings.meetingUrl,
          location: meetings.location,
          attendeeEmail: meetings.attendeeEmail,
          attendeeName: meetings.attendeeName,
          attendeePhone: meetings.attendeePhone,
          reminderSent: meetings.reminderSent,
          followUpSent: meetings.followUpSent,
          reminder24hSent: meetings.reminder24hSent,
          reminder1hSent: meetings.reminder1hSent,
          notes: meetings.notes,
          metadata: meetings.metadata,
          createdAt: meetings.createdAt,
          updatedAt: meetings.updatedAt,
          leads: {
            id: leads.id,
            email: leads.email,
            fullName: leads.fullName,
            firstName: leads.firstName,
            lastName: leads.lastName
          }
        })
        .from(meetings)
        .innerJoin(leads, eq(meetings.leadId, leads.id))
        .where(
          and(
            eq(meetings.status, 'scheduled'),
            eq(meetings.reminder1hSent, false),
            gte(meetings.startTime, oneHourFromNow),
            lte(meetings.startTime, reminderWindow)
          )
        );

      logger.info(`Found ${meetingsData.length} meetings needing 1-hour reminders`);
      return meetingsData;
    } catch (error) {
      logger.logError(error, { context: 'get_meetings_needing_hourly_reminders' });
      throw error;
    }
  }

  /**
   * Mark reminder as sent
   * @param {string} meetingId - Meeting ID
   * @param {string} reminderType - Type of reminder ('24h' or '1h')
   * @param {string} messageId - Email message ID
   * @param {string} trackingId - Tracking ID for logging
   */
  async markReminderSent(meetingId, reminderType, messageId, trackingId) {
    try {
      const updateData = {};
      const now = new Date();
      
      if (reminderType === '24h') {
        updateData.reminder24hSent = true;
        updateData.reminder24hSentAt = now;
      } else {
        updateData.reminder1hSent = true;
        updateData.reminder1hSentAt = now;
      }

      await db
        .update(meetings)
        .set(updateData)
        .where(eq(meetings.id, meetingId));

      // Create reminder record
      await this.createReminderRecord(meetingId, reminderType, messageId, 'sent', trackingId);

      logger.logLeadProcessing(trackingId, 'reminder_marked_sent', {
        meetingId,
        reminderType,
        messageId
      });
    } catch (error) {
      logger.logError(error, { context: 'mark_reminder_sent', trackingId, meetingId });
      throw error;
    }
  }

  /**
   * Schedule reminder records for a meeting with comprehensive error handling
   * @param {string} meetingId - Meeting ID
   * @param {string} startTime - Meeting start time
   * @param {string} trackingId - Tracking ID for logging
   */
  async scheduleReminders(meetingId, startTime, trackingId) {
    // Validate input parameters
    if (!meetingId || !startTime) {
      const error = new Error('Missing required parameters: meetingId and startTime are required');
      logger.logError(error, { context: 'schedule_reminders_validation', trackingId });
      throw error;
    }

    return this.executeWithRetry(async () => {
      // Get meeting details with lead information
      const meetingResult = await db.select({
        id: meetings.id,
        leadId: meetings.leadId,
        calendlyEventId: meetings.calendlyEventId,
        title: meetings.title,
        meetingUrl: meetings.meetingUrl,
        location: meetings.location,
        startTime: meetings.startTime,
        endTime: meetings.endTime,
        status: meetings.status,
        reminder24hSent: meetings.reminder24hSent,
        reminder1hSent: meetings.reminder1hSent,
        createdAt: meetings.createdAt,
        updatedAt: meetings.updatedAt,
        lead: {
          id: leads.id,
          email: leads.email,
          fullName: leads.fullName,
          firstName: leads.firstName,
          lastName: leads.lastName
        }
      })
        .from(meetings)
        .innerJoin(leads, eq(meetings.leadId, leads.id))
        .where(eq(meetings.id, meetingId))
        .limit(1);

      if (!meetingResult || meetingResult.length === 0) {
        logger.logError(new Error('Meeting not found'), { context: 'schedule_reminders_get_meeting', trackingId, meetingId });
        throw new Error('Meeting not found');
      }

      const meeting = meetingResult[0];
      const meetingDate = new Date(startTime);
      const currentTime = new Date();
      
      const reminder24h = new Date(meetingDate);
      reminder24h.setHours(reminder24h.getHours() - 24);
      
      const reminder1h = new Date(meetingDate);
      reminder1h.setHours(reminder1h.getHours() - 1);

      const leadData = meeting.lead;
      
      // Check for existing reminders to avoid duplicates
      const existingReminders = await db
        .select({ reminderType: meetingReminders.reminderType })
        .from(meetingReminders)
        .where(eq(meetingReminders.meetingId, meetingId));
      
      const existingTypes = existingReminders.map(r => r.reminderType);
      
      // Queue 24-hour reminder email if meeting is more than 24 hours away and not already scheduled
      if (reminder24h > currentTime && !existingTypes.includes('24_hour')) {
        try {
          await EmailTemplateService.queueMeetingReminderEmail(
            leadData.id,
            leadData.email,
            leadData.fullName || leadData.firstName || 'Valued Customer',
            '24h',
            {
              meeting_time: startTime,
              meeting_title: meeting.title,
              meeting_url: meeting.meetingUrl,
              location: meeting.location
            },
            reminder24h.toISOString(),
            trackingId
          );
        } catch (emailError) {
          logger.warn('Failed to queue 24h email reminder, continuing with reminder record creation', {
            trackingId,
            meetingId,
            error: emailError.message
          });
        }
      }

      // Queue 1-hour reminder email if meeting is more than 1 hour away and not already scheduled
      if (reminder1h > currentTime && !existingTypes.includes('1_hour')) {
        try {
          await EmailTemplateService.queueMeetingReminderEmail(
            leadData.id,
            leadData.email,
            leadData.fullName || leadData.firstName || 'Valued Customer',
            '1h',
            {
              meeting_time: startTime,
              meeting_title: meeting.title,
              meeting_url: meeting.meetingUrl,
              location: meeting.location
            },
            reminder1h.toISOString(),
            trackingId
          );
        } catch (emailError) {
          logger.warn('Failed to queue 1h email reminder, continuing with reminder record creation', {
            trackingId,
            meetingId,
            error: emailError.message
          });
        }
      }

      // Create reminder records for tracking
      const reminders = [];
      if (reminder24h > currentTime && !existingTypes.includes('24_hour')) {
        reminders.push({
          meetingId,
          reminderType: '24_hour',
          scheduledFor: reminder24h,
          status: 'queued',
          createdAt: new Date(),
          updatedAt: new Date()
        });
      }
      if (reminder1h > currentTime && !existingTypes.includes('1_hour')) {
        reminders.push({
          meetingId,
          reminderType: '1_hour',
          scheduledFor: reminder1h,
          status: 'queued',
          createdAt: new Date(),
          updatedAt: new Date()
        });
      }

      let createdReminders = [];
      if (reminders.length > 0) {
        createdReminders = await db.insert(meetingReminders)
          .values(reminders)
          .returning();
      }

      logger.logMeetingOperation('schedule_reminders_success', meetingId, {
        trackingId,
        leadId: leadData.id,
        reminder24h: reminder24h > currentTime ? reminder24h.toISOString() : 'skipped',
        reminder1h: reminder1h > currentTime ? reminder1h.toISOString() : 'skipped',
        createdCount: createdReminders.length,
        existingCount: existingReminders.length
      });

      return createdReminders;
    }, 'schedule_reminders', trackingId);
  }

  /**
   * Create a reminder record
   * @param {string} meetingId - Meeting ID
   * @param {string} reminderType - Type of reminder
   * @param {string} messageId - Email message ID
   * @param {string} status - Reminder status
   * @param {string} trackingId - Tracking ID for logging
   */
  async createReminderRecord(meetingId, reminderType, messageId, status, trackingId) {
    try {
      const now = new Date();
      const reminderRecord = {
        meetingId: meetingId,
        reminderType: reminderType === '24h' ? '24_hour' : '1_hour',
        deliveryMethod: 'email',
        scheduledFor: now,
        sentAt: now,
        emailMessageId: messageId,
        status
      };

      await db
        .insert(meetingReminders)
        .values(reminderRecord);
    } catch (error) {
      logger.logError(error, { context: 'create_reminder_record', trackingId, meetingId });
      throw error;
    }
  }

  /**
   * Update lead meeting status
   * @param {string} leadId - Lead ID
   * @param {string} meetingId - Meeting ID (null if no meeting)
   * @param {boolean} hasScheduledMeeting - Whether lead has scheduled meeting
   * @param {string} trackingId - Tracking ID for logging
   */
  async updateLeadMeetingStatus(leadId, meetingId, hasScheduledMeeting, trackingId) {
    try {
      const updateData = {
        hasMeeting: hasScheduledMeeting,
        updatedAt: new Date()
      };

      const [lead] = await db
        .update(leads)
        .set(updateData)
        .where(eq(leads.id, leadId))
        .returning();

      if (!lead) {
        const error = new Error(`Lead not found: ${leadId}`);
        logger.logError(error, { context: 'update_lead_meeting_status', trackingId, leadId });
        throw error;
      }

      logger.logLeadProcessing(trackingId, 'lead_meeting_status_updated', {
        leadId,
        meetingId,
        hasScheduledMeeting
      });
    } catch (error) {
      logger.logError(error, { context: 'update_lead_meeting_status', trackingId, leadId });
      throw error;
    }
  }

  /**
   * Get lead by Calendly event ID
   * @param {string} calendlyEventId - Calendly event ID
   * @param {string} trackingId - Tracking ID for logging
   * @returns {Object|null} Lead record or null if not found
   */
  async getMeetingByCalendlyId(calendlyEventId, trackingId) {
    try {
      logger.logLeadProcessing(trackingId, 'fetching_meeting_by_calendly_id', {
        calendlyEventId
      });

      const [lead] = await db
        .select()
        .from(leads)
        .where(eq(leads.calendlyEventUri, calendlyEventId))
        .limit(1);

      if (!lead) {
        logger.logLeadProcessing(trackingId, 'meeting_not_found', {
          calendlyEventId
        });
        return null;
      }

      logger.logLeadProcessing(trackingId, 'meeting_found', {
        leadId: lead.id,
        calendlyEventId,
        status: lead.status
      });

      return lead;

    } catch (error) {
      logger.logError(error, {
        context: 'get_meeting_by_calendly_id',
        trackingId,
        calendlyEventId
      });
      throw error;
    }
  }

  /**
   * Get meetings that need SMS 24-hour reminders
   * @returns {Array} Meetings needing SMS 24-hour reminders
   */
  async getMeetingsNeedingSms24hReminders() {
    try {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStart = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate());
      const tomorrowEnd = new Date(tomorrowStart);
      tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);

      const meetingsData = await db
        .select({
          id: meetings.id,
          leadId: meetings.leadId,
          agentId: meetings.agentId,
          calendlyEventId: meetings.calendlyEventId,
          meetingType: meetings.meetingType,
          title: meetings.title,
          description: meetings.description,
          startTime: meetings.startTime,
          endTime: meetings.endTime,
          timezone: meetings.timezone,
          status: meetings.status,
          meetingUrl: meetings.meetingUrl,
          location: meetings.location,
          attendeeEmail: meetings.attendeeEmail,
          attendeeName: meetings.attendeeName,
          attendeePhone: meetings.attendeePhone,
          reminderSent: meetings.reminderSent,
          followUpSent: meetings.followUpSent,
          reminder24hSent: meetings.reminder24hSent,
          reminder1hSent: meetings.reminder1hSent,
          sms24hSent: meetings.sms24hSent,
          sms1hSent: meetings.sms1hSent,
          notes: meetings.notes,
          metadata: meetings.metadata,
          createdAt: meetings.createdAt,
          updatedAt: meetings.updatedAt,
          leads: {
            id: leads.id,
            email: leads.email,
            phone: leads.phone,
            fullName: leads.fullName,
            firstName: leads.firstName,
            lastName: leads.lastName,
            smsOptIn: leads.smsOptIn
          }
        })
        .from(meetings)
        .innerJoin(leads, eq(meetings.leadId, leads.id))
        .where(
          and(
            eq(meetings.status, 'scheduled'),
            eq(meetings.sms24hSent, false),
            gte(meetings.startTime, tomorrowStart),
            lt(meetings.startTime, tomorrowEnd)
          )
        );

      // Filter for leads with phone numbers and SMS opt-in
      const eligibleMeetings = meetingsData.filter(meeting => 
        meeting.leads?.phone && 
        meeting.leads?.smsOptIn !== false
      );

      logger.info(`Found ${eligibleMeetings.length} meetings needing SMS 24-hour reminders`);
      return eligibleMeetings;
    } catch (error) {
      logger.logError(error, { context: 'get_meetings_needing_sms_24h_reminders' });
      throw error;
    }
  }

  /**
   * Get meetings that need SMS 1-hour reminders
   * @returns {Array} Meetings needing SMS 1-hour reminders
   */
  async getMeetingsNeedingSms1hReminders() {
    try {
      const oneHourFromNow = new Date();
      oneHourFromNow.setHours(oneHourFromNow.getHours() + 1);
      const reminderWindow = new Date(oneHourFromNow);
      reminderWindow.setMinutes(reminderWindow.getMinutes() + 30); // 30-minute window

      const meetingsData = await db
        .select({
          id: meetings.id,
          leadId: meetings.leadId,
          agentId: meetings.agentId,
          calendlyEventId: meetings.calendlyEventId,
          meetingType: meetings.meetingType,
          title: meetings.title,
          description: meetings.description,
          startTime: meetings.startTime,
          endTime: meetings.endTime,
          timezone: meetings.timezone,
          status: meetings.status,
          meetingUrl: meetings.meetingUrl,
          location: meetings.location,
          attendeeEmail: meetings.attendeeEmail,
          attendeeName: meetings.attendeeName,
          attendeePhone: meetings.attendeePhone,
          reminderSent: meetings.reminderSent,
          followUpSent: meetings.followUpSent,
          reminder24hSent: meetings.reminder24hSent,
          reminder1hSent: meetings.reminder1hSent,
          sms24hSent: meetings.sms24hSent,
          sms1hSent: meetings.sms1hSent,
          notes: meetings.notes,
          metadata: meetings.metadata,
          createdAt: meetings.createdAt,
          updatedAt: meetings.updatedAt,
          leads: {
            id: leads.id,
            email: leads.email,
            phone: leads.phone,
            fullName: leads.fullName,
            firstName: leads.firstName,
            lastName: leads.lastName,
            smsOptIn: leads.smsOptIn
          }
        })
        .from(meetings)
        .innerJoin(leads, eq(meetings.leadId, leads.id))
        .where(
          and(
            eq(meetings.status, 'scheduled'),
            eq(meetings.sms1hSent, false),
            gte(meetings.startTime, oneHourFromNow),
            lte(meetings.startTime, reminderWindow)
          )
        );

      // Filter for leads with phone numbers and SMS opt-in
      const eligibleMeetings = meetingsData.filter(meeting => 
        meeting.leads?.phone && 
        meeting.leads?.smsOptIn !== false
      );

      logger.info(`Found ${eligibleMeetings.length} meetings needing SMS 1-hour reminders`);
      return eligibleMeetings;
    } catch (error) {
      logger.logError(error, { context: 'get_meetings_needing_sms_1h_reminders' });
      throw error;
    }
  }

  /**
   * Send SMS reminder for a meeting
   * @param {Object} meeting - Meeting data with lead information
   * @param {string} reminderType - Type of reminder ('24h' or '1h')
   * @param {string} trackingId - Tracking ID for logging
   * @returns {Object} SMS sending result
   */
  async sendSmsReminder(meeting, reminderType, trackingId) {
    try {
      const lead = meeting.leads;
      if (!lead || !lead.phone) {
        throw new Error('Lead phone number not available');
      }

      let smsResult;
      if (reminderType === '24h') {
        smsResult = await TwilioSmsService.send24HourReminder(lead, meeting, trackingId);
      } else if (reminderType === '1h') {
        smsResult = await TwilioSmsService.send1HourReminder(lead, meeting, trackingId);
      } else {
        smsResult = await TwilioSmsService.sendAppointmentReminder(lead, meeting, trackingId);
      }

      if (smsResult.success) {
        // Mark SMS reminder as sent
        await this.markSmsReminderSent(meeting.id, reminderType, smsResult.messageSid, trackingId);
        
        // Create reminder record
        const dbReminderType = reminderType === '24h' ? '24_hour' : reminderType === '1h' ? '1_hour' : 'custom';
        await this.createSmsReminderRecord(
          meeting.id, 
          dbReminderType, 
          smsResult.messageSid, 
          'sent', 
          trackingId
        );
      }

      return smsResult;
    } catch (error) {
      logger.logError(error, {
        context: 'send_sms_reminder',
        trackingId,
        meetingId: meeting?.id,
        reminderType
      });
      throw error;
    }
  }

  /**
   * Mark SMS reminder as sent
   * @param {string} meetingId - Meeting ID
   * @param {string} reminderType - Type of reminder ('24h' or '1h')
   * @param {string} messageSid - Twilio message SID
   * @param {string} trackingId - Tracking ID for logging
   */
  async markSmsReminderSent(meetingId, reminderType, messageSid, trackingId) {
    try {
      const updateData = {
        updatedAt: new Date()
      };

      if (reminderType === '24h') {
        updateData.sms24hSent = true;
      } else if (reminderType === '1h') {
        updateData.sms1hSent = true;
      }

      await db
        .update(meetings)
        .set(updateData)
        .where(eq(meetings.id, meetingId));

      logger.logLeadProcessing(trackingId, 'sms_reminder_marked_sent', {
        meetingId,
        reminderType,
        messageSid
      });
    } catch (error) {
      logger.logError(error, { context: 'mark_sms_reminder_sent', meetingId, reminderType, trackingId });
      throw error;
    }
  }

  /**
   * Create SMS reminder record
   * @param {string} meetingId - Meeting ID
   * @param {string} reminderType - Type of reminder
   * @param {string} messageSid - Twilio message SID
   * @param {string} status - Reminder status
   * @param {string} trackingId - Tracking ID for logging
   */
  async createSmsReminderRecord(meetingId, reminderType, messageSid, status, trackingId) {
    try {
      const reminderRecord = {
        meetingId: meetingId,
        reminderType: reminderType,
        deliveryMethod: 'sms',
        smsMessageSid: messageSid,
        status: status,
        sentAt: new Date(),
        scheduledFor: new Date()
      };

      await db
        .insert(meetingReminders)
        .values(reminderRecord);

      logger.logLeadProcessing(trackingId, 'sms_reminder_record_created', {
        meetingId,
        reminderType,
        messageSid
      });
    } catch (error) {
      logger.logError(error, { context: 'create_sms_reminder_record', meetingId, reminderType, trackingId });
      throw error;
    }
  }

  /**
   * Get leads that need meeting scheduling reminders
   * @returns {Array} Leads without scheduled meetings
   */
  async getLeadsNeedingMeetingReminders() {
    try {
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

      const leadsResult = await db.select()
        .from(leads)
        .where(
          and(
            eq(leads.meetingScheduled, false),
            gte(leads.createdAt, threeDaysAgo),
            isNull(leads.lastMeetingReminderSent)
          )
        )
        .orderBy(asc(leads.createdAt));

      logger.info(`Found ${leadsResult.length} leads needing meeting scheduling reminders`);
      return leadsResult;
    } catch (error) {
      logger.logError(error, { context: 'get_leads_needing_meeting_reminders' });
      throw error;
    }
  }

  /**
   * Get upcoming meetings
   * @param {number} limit - Number of meetings to fetch
   * @param {string} trackingId - Tracking ID for logging
   * @returns {Array} Array of upcoming meetings
   */
  async getUpcomingMeetings(limit = 10, trackingId) {
    try {
      logger.logLeadProcessing(trackingId, 'fetching_upcoming_meetings', {
        limit
      });

      const upcomingMeetings = await db
         .select({
           id: meetings.id,
           leadId: meetings.leadId,
           calendlyEventId: meetings.calendlyEventId,
           title: meetings.title,
           startTime: meetings.startTime,
           endTime: meetings.endTime,
           status: meetings.status,
           meetingUrl: meetings.meetingUrl,
           location: meetings.location,
           lead: {
             id: leads.id,
             email: leads.email,
             fullName: leads.fullName,
             firstName: leads.firstName,
             lastName: leads.lastName
           }
         })
         .from(meetings)
         .innerJoin(leads, eq(meetings.leadId, leads.id))
         .where(
           and(
             gte(meetings.startTime, new Date()),
             eq(meetings.status, 'scheduled')
           )
         )
         .orderBy(asc(meetings.startTime))
         .limit(limit);

      logger.logLeadProcessing(trackingId, 'upcoming_meetings_fetched', {
        count: upcomingMeetings?.length || 0,
        limit
      });

      return upcomingMeetings || [];

    } catch (error) {
      logger.logError(error, {
        context: 'get_upcoming_meetings',
        trackingId,
        limit
      });
      throw error;
    }
  }
}

export default new MeetingService();