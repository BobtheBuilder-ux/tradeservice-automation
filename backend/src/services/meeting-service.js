import { db } from '../config/index.js';
import { leads, meetings, meetingReminders } from '../db/schema.js';
import { eq, and, gte, lte, lt, isNull, asc } from 'drizzle-orm';
import logger from '../utils/logger.js';
import { hashForLogging } from '../utils/crypto.js';
import TwilioSmsService from './twilio-sms-service.js';
import EmailTemplateService from './email-template-service.js';

/**
 * Meeting Service - Handles all meeting-related database operations
 */
class MeetingService {
  
  /**
   * Create a new meeting record
   * @param {Object} meetingData - Meeting information from Calendly
   * @param {string} leadId - Associated lead ID
   * @param {string} trackingId - Tracking ID for logging
   * @returns {Object} Created meeting record
   */
  async createMeeting(meetingData, leadId, trackingId) {
    try {
      logger.logLeadProcessing(trackingId, 'creating_meeting_record', {
        leadId,
        calendlyEventId: meetingData.uri,
        startTime: meetingData.start_time
      });

      const meetingUpdate = {
        calendlyEventUri: meetingData.uri,
        scheduledAt: new Date(meetingData.start_time),
        meetingEndTime: new Date(meetingData.end_time),
        meetingLocation: meetingData.location?.location || 'Online',
        status: 'scheduled',
        lastCalendlyUpdate: new Date(),
        updatedAt: new Date()
      };

      const [meeting] = await db
        .update(leads)
        .set(meetingUpdate)
        .where(eq(leads.id, leadId))
        .returning();

      if (!meeting) {
        const error = new Error('Failed to update lead with meeting data');
        logger.logError(error, { context: 'create_meeting', trackingId, leadId });
        throw error;
      }

      // Update lead with meeting reference
      await this.updateLeadMeetingStatus(leadId, meeting.id, true, trackingId);

      // Schedule automatic reminders
      await this.scheduleReminders(meeting.id, meeting.start_time, trackingId);

      logger.logLeadProcessing(trackingId, 'meeting_created_successfully', {
        leadId: meeting.id,
        calendlyEventId: meeting.calendlyEventUri
      });

      return meeting;
    } catch (error) {
      logger.logError(error, { context: 'create_meeting', trackingId, leadId });
      throw error;
    }
  }

  /**
   * Update meeting status (canceled, completed, no-show, etc.)
   * @param {string} calendlyEventId - Calendly event ID
   * @param {string} status - New meeting status
   * @param {Object} updateData - Additional update data
   * @param {string} trackingId - Tracking ID for logging
   * @returns {Object} Updated lead record
   */
  async updateMeetingStatus(calendlyEventId, status, updateData = {}, trackingId) {
    try {
      logger.logLeadProcessing(trackingId, 'updating_meeting_status', {
        calendlyEventId,
        newStatus: status
      });

      const updateFields = {
        status,
        updatedAt: new Date(),
        lastCalendlyUpdate: new Date(),
        ...updateData
      };

      // Add specific fields based on status
      if (status === 'canceled') {
        updateFields.canceledAt = new Date();
        updateFields.canceledBy = updateData.canceled_by || 'system';
        updateFields.cancellationReason = updateData.reason || '';
      } else if (status === 'no_show') {
        updateFields.noShow = true;
        updateFields.attended = false;
      } else if (status === 'completed') {
        updateFields.attended = true;
        updateFields.noShow = false;
      }

      const [lead] = await db
        .update(leads)
        .set(updateFields)
        .where(eq(leads.calendlyEventUri, calendlyEventId))
        .returning();

      if (!lead) {
        const error = new Error(`Lead not found for Calendly event: ${calendlyEventId}`);
        logger.logError(error, { context: 'update_meeting_status', trackingId, calendlyEventId });
        throw error;
      }

      // Update lead status if meeting is canceled or completed
      if (status === 'canceled') {
        await this.updateLeadMeetingStatus(lead.id, null, false, trackingId);
      }

      logger.logLeadProcessing(trackingId, 'meeting_status_updated', {
        leadId: lead.id,
        newStatus: status
      });

      return lead;
    } catch (error) {
      logger.logError(error, { context: 'update_meeting_status', trackingId, calendlyEventId });
      throw error;
    }
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
   * Schedule reminder records for a meeting
   * @param {string} meetingId - Meeting ID
   * @param {string} startTime - Meeting start time
   * @param {string} trackingId - Tracking ID for logging
   */
  async scheduleReminders(meetingId, startTime, trackingId) {
    try {
      // Get meeting details with lead information
      const meetingResult = await this.db.select({
        id: meetings.id,
        leadId: meetings.leadId,
        calendlyEventId: meetings.calendlyEventId,
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
      const reminder24h = new Date(meetingDate);
      reminder24h.setHours(reminder24h.getHours() - 24);
      
      const reminder1h = new Date(meetingDate);
      reminder1h.setHours(reminder1h.getHours() - 1);

      const leadData = meeting.leads;
      
      // Queue 24-hour reminder email if meeting is more than 24 hours away
      if (reminder24h > new Date()) {
        await EmailTemplateService.queueMeetingReminderEmail(
          leadData.id,
          leadData.email,
          leadData.full_name || leadData.first_name || 'Valued Customer',
          '24h',
          {
            meeting_time: startTime,
            meeting_title: meeting.meeting_title,
            meeting_url: meeting.meeting_url,
            location: meeting.location
          },
          reminder24h.toISOString(),
          trackingId
        );
      }

      // Queue 1-hour reminder email if meeting is more than 1 hour away
      if (reminder1h > new Date()) {
        await EmailTemplateService.queueMeetingReminderEmail(
          leadData.id,
          leadData.email,
          leadData.full_name || leadData.first_name || 'Valued Customer',
          '1h',
          {
            meeting_time: startTime,
            meeting_title: meeting.meeting_title,
            meeting_url: meeting.meeting_url,
            location: meeting.location
          },
          reminder1h.toISOString(),
          trackingId
        );
      }

      // Still create reminder records for tracking
      const reminders = [];
      if (reminder24h > new Date()) {
        reminders.push({
          meetingId,
          reminderType: '24_hour',
          scheduledFor: reminder24h,
          status: 'queued',
          createdAt: new Date(),
          updatedAt: new Date()
        });
      }
      if (reminder1h > new Date()) {
        reminders.push({
          meetingId,
          reminderType: '1_hour',
          scheduledFor: reminder1h,
          status: 'queued',
          createdAt: new Date(),
          updatedAt: new Date()
        });
      }

      if (reminders.length > 0) {
        await this.db.insert(meetingReminders)
          .values(reminders);
      }

      logger.logLeadProcessing(trackingId, 'meeting_reminders_queued', {
        meetingId,
        leadId: leadData.id,
        reminder24h: reminder24h > new Date() ? reminder24h.toISOString() : 'skipped',
        reminder1h: reminder1h > new Date() ? reminder1h.toISOString() : 'skipped'
      });
    } catch (error) {
      logger.logError(error, { context: 'schedule_reminders', trackingId, meetingId });
      throw error;
    }
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

      const leadsResult = await this.db.select()
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

      const upcomingLeads = await db
         .select()
         .from(leads)
         .where(
           and(
             gte(leads.calendlyStartTime, new Date()),
             eq(leads.status, 'scheduled'),
             isNull(leads.canceledAt)
           )
         )
         .orderBy(asc(leads.calendlyStartTime))
         .limit(limit);

      logger.logLeadProcessing(trackingId, 'upcoming_meetings_fetched', {
        count: upcomingLeads?.length || 0,
        limit
      });

      return upcomingLeads || [];

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