import { supabase } from '../config/index.js';
import logger from '../utils/logger.js';
import { hashForLogging } from '../utils/crypto.js';
import TwilioSmsService from './twilio-sms-service.js';

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

      const meetingRecord = {
        lead_id: leadId,
        calendly_event_id: meetingData.uri,
        calendly_event_uri: meetingData.uri,
        meeting_title: meetingData.name || 'Consultation Meeting',
        meeting_description: meetingData.description || '',
        start_time: meetingData.start_time,
        end_time: meetingData.end_time,
        timezone: meetingData.timezone || 'UTC',
        meeting_url: meetingData.location?.join_url || meetingData.location?.location,
        location: meetingData.location?.location || 'Online',
        status: 'scheduled'
      };

      const { data: meeting, error } = await supabase
        .from('meetings')
        .insert([meetingRecord])
        .select()
        .single();

      if (error) {
        logger.logError(error, { context: 'create_meeting', trackingId, leadId });
        throw error;
      }

      // Update lead with meeting reference
      await this.updateLeadMeetingStatus(leadId, meeting.id, true, trackingId);

      // Schedule automatic reminders
      await this.scheduleReminders(meeting.id, meeting.start_time, trackingId);

      logger.logLeadProcessing(trackingId, 'meeting_created_successfully', {
        meetingId: meeting.id,
        leadId,
        startTime: meeting.start_time
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
   * @returns {Object} Updated meeting record
   */
  async updateMeetingStatus(calendlyEventId, status, updateData = {}, trackingId) {
    try {
      logger.logLeadProcessing(trackingId, 'updating_meeting_status', {
        calendlyEventId,
        newStatus: status
      });

      const updateFields = {
        status,
        ...updateData,
        updated_at: new Date().toISOString()
      };

      // Add specific fields based on status
      if (status === 'canceled') {
        updateFields.canceled_at = new Date().toISOString();
        updateFields.canceled_by = updateData.canceled_by || 'system';
        updateFields.cancellation_reason = updateData.reason || '';
      } else if (status === 'no_show') {
        updateFields.no_show = true;
        updateFields.attended = false;
      } else if (status === 'completed') {
        updateFields.attended = true;
        updateFields.no_show = false;
      }

      const { data: meeting, error } = await supabase
        .from('meetings')
        .update(updateFields)
        .eq('calendly_event_id', calendlyEventId)
        .select()
        .single();

      if (error) {
        logger.logError(error, { context: 'update_meeting_status', trackingId, calendlyEventId });
        throw error;
      }

      // Update lead status if meeting is canceled or completed
      if (status === 'canceled') {
        await this.updateLeadMeetingStatus(meeting.lead_id, null, false, trackingId);
      }

      logger.logLeadProcessing(trackingId, 'meeting_status_updated', {
        meetingId: meeting.id,
        newStatus: status
      });

      return meeting;
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

      const { data: meetings, error } = await supabase
        .from('meetings')
        .select(`
          *,
          leads!inner(
            id,
            email,
            full_name,
            first_name,
            last_name
          )
        `)
        .eq('status', 'scheduled')
        .eq('reminder_24h_sent', false)
        .gte('start_time', tomorrowStart.toISOString())
        .lt('start_time', tomorrowEnd.toISOString());

      if (error) {
        logger.logError(error, { context: 'get_meetings_needing_daily_reminders' });
        throw error;
      }

      logger.info(`Found ${meetings.length} meetings needing 24-hour reminders`);
      return meetings;
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

      const { data: meetings, error } = await supabase
        .from('meetings')
        .select(`
          *,
          leads!inner(
            id,
            email,
            full_name,
            first_name,
            last_name
          )
        `)
        .eq('status', 'scheduled')
        .eq('reminder_1h_sent', false)
        .gte('start_time', oneHourFromNow.toISOString())
        .lte('start_time', reminderWindow.toISOString());

      if (error) {
        logger.logError(error, { context: 'get_meetings_needing_hourly_reminders' });
        throw error;
      }

      logger.info(`Found ${meetings.length} meetings needing 1-hour reminders`);
      return meetings;
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
      const updateField = reminderType === '24h' ? 'reminder_24h_sent' : 'reminder_1h_sent';
      const timestampField = reminderType === '24h' ? 'reminder_24h_sent_at' : 'reminder_1h_sent_at';

      const { error } = await supabase
        .from('meetings')
        .update({
          [updateField]: true,
          [timestampField]: new Date().toISOString()
        })
        .eq('id', meetingId);

      if (error) {
        logger.logError(error, { context: 'mark_reminder_sent', trackingId, meetingId });
        throw error;
      }

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
      const meetingDate = new Date(startTime);
      const reminder24h = new Date(meetingDate);
      reminder24h.setHours(reminder24h.getHours() - 24);
      
      const reminder1h = new Date(meetingDate);
      reminder1h.setHours(reminder1h.getHours() - 1);

      const reminders = [
        {
          meeting_id: meetingId,
          reminder_type: '24_hour',
          scheduled_for: reminder24h.toISOString(),
          status: 'pending'
        },
        {
          meeting_id: meetingId,
          reminder_type: '1_hour',
          scheduled_for: reminder1h.toISOString(),
          status: 'pending'
        }
      ];

      const { error } = await supabase
        .from('meeting_reminders')
        .insert(reminders);

      if (error) {
        logger.logError(error, { context: 'schedule_reminders', trackingId, meetingId });
        throw error;
      }

      logger.logLeadProcessing(trackingId, 'reminders_scheduled', {
        meetingId,
        reminder24h: reminder24h.toISOString(),
        reminder1h: reminder1h.toISOString()
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
      const reminderRecord = {
        meeting_id: meetingId,
        reminder_type: reminderType === '24h' ? '24_hour' : '1_hour',
        scheduled_for: new Date().toISOString(),
        sent_at: new Date().toISOString(),
        email_message_id: messageId,
        status
      };

      const { error } = await supabase
        .from('meeting_reminders')
        .insert([reminderRecord]);

      if (error) {
        logger.logError(error, { context: 'create_reminder_record', trackingId, meetingId });
        throw error;
      }
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
        latest_meeting_id: meetingId,
        meeting_scheduled: hasScheduledMeeting,
        last_meeting_reminder_sent: hasScheduledMeeting ? new Date().toISOString() : null
      };

      const { error } = await supabase
        .from('leads')
        .update(updateData)
        .eq('id', leadId);

      if (error) {
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
   * Get meeting by Calendly event ID
   * @param {string} calendlyEventId - Calendly event ID
   * @returns {Object} Meeting record
   */
  async getMeetingByCalendlyId(calendlyEventId) {
    try {
      const { data: meeting, error } = await supabase
        .from('meetings')
        .select(`
          *,
          leads!meetings_lead_id_fkey(
            id,
            email,
            full_name,
            first_name,
            last_name
          )
        `)
        .eq('calendly_event_id', calendlyEventId)
        .single();

      if (error) {
        logger.logError(error, { context: 'get_meeting_by_calendly_id', calendlyEventId });
        throw error;
      }

      return meeting;
    } catch (error) {
      logger.logError(error, { context: 'get_meeting_by_calendly_id', calendlyEventId });
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

      const { data: meetings, error } = await supabase
        .from('meetings')
        .select(`
          *,
          leads!meetings_lead_id_fkey(
            id,
            email,
            phone,
            full_name,
            first_name,
            last_name,
            sms_opt_in
          )
        `)
        .eq('status', 'scheduled')
        .eq('sms_24h_sent', false)
        .gte('start_time', tomorrowStart.toISOString())
        .lt('start_time', tomorrowEnd.toISOString());

      if (error) {
        logger.logError(error, { context: 'get_meetings_needing_sms_24h_reminders' });
        throw error;
      }

      // Filter for leads with phone numbers and SMS opt-in
      const eligibleMeetings = meetings.filter(meeting => 
        meeting.leads?.phone && 
        meeting.leads?.sms_opt_in !== false
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

      const { data: meetings, error } = await supabase
        .from('meetings')
        .select(`
          *,
          leads!meetings_lead_id_fkey(
            id,
            email,
            phone,
            full_name,
            first_name,
            last_name,
            sms_opt_in
          )
        `)
        .eq('status', 'scheduled')
        .eq('sms_1h_sent', false)
        .gte('start_time', oneHourFromNow.toISOString())
        .lte('start_time', reminderWindow.toISOString());

      if (error) {
        logger.logError(error, { context: 'get_meetings_needing_sms_1h_reminders' });
        throw error;
      }

      // Filter for leads with phone numbers and SMS opt-in
      const eligibleMeetings = meetings.filter(meeting => 
        meeting.leads?.phone && 
        meeting.leads?.sms_opt_in !== false
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
      const updateFields = {
        updated_at: new Date().toISOString()
      };

      if (reminderType === '24h') {
        updateFields.sms_24h_sent = true;
        updateFields.sms_24h_sent_at = new Date().toISOString();
      } else if (reminderType === '1h') {
        updateFields.sms_1h_sent = true;
        updateFields.sms_1h_sent_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from('meetings')
        .update(updateFields)
        .eq('id', meetingId);

      if (error) {
        logger.logError(error, { context: 'mark_sms_reminder_sent', meetingId, reminderType });
        throw error;
      }

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
        meeting_id: meetingId,
        reminder_type: reminderType,
        delivery_method: 'sms',
        sms_message_sid: messageSid,
        status: status,
        sent_at: new Date().toISOString(),
        scheduled_for: new Date().toISOString()
      };

      const { error } = await supabase
        .from('meeting_reminders')
        .insert([reminderRecord]);

      if (error) {
        logger.logError(error, { context: 'create_sms_reminder_record', meetingId, reminderType });
        throw error;
      }

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

      const { data: leads, error } = await supabase
        .from('leads')
        .select('*')
        .eq('meeting_scheduled', false)
        .gte('created_at', threeDaysAgo.toISOString())
        .is('last_meeting_reminder_sent', null)
        .order('created_at', { ascending: false });

      if (error) {
        logger.logError(error, { context: 'get_leads_needing_meeting_reminders' });
        throw error;
      }

      logger.info(`Found ${leads.length} leads needing meeting scheduling reminders`);
      return leads;
    } catch (error) {
      logger.logError(error, { context: 'get_leads_needing_meeting_reminders' });
      throw error;
    }
  }
}

export default new MeetingService();