import logger from '../utils/logger.js';
import insforgeDataService from './insforge-data-service.js';

class MeetingService {
  async createMeetingFromCalendly(leadId, meetingData = {}, trackingId = null) {
    const lead = await insforgeDataService.updateLead(leadId, {
      meetingScheduled: true,
      scheduledAt: meetingData.start_time || meetingData.startTime || null,
      meetingEndTime: meetingData.end_time || meetingData.endTime || null,
      meetingLocation: meetingData.location || null,
      status: 'scheduled',
      updatedAt: new Date(),
    });

    return {
      success: Boolean(lead),
      lead,
      trackingId,
    };
  }

  async updateLeadWithCalendlyData(leadId, calendlyData = {}, trackingId = null) {
    const lead = await insforgeDataService.updateLead(leadId, {
      calendlyEventUri: calendlyData.event_uri || calendlyData.eventUri || null,
      calendlyInviteeUri: calendlyData.invitee_uri || calendlyData.inviteeUri || null,
      scheduledAt: calendlyData.scheduled_at || calendlyData.scheduledAt || null,
      meetingScheduled: calendlyData.status !== 'canceled',
      status: calendlyData.status || 'scheduled',
      updatedAt: new Date(),
    });

    return {
      success: Boolean(lead),
      lead,
      trackingId,
    };
  }

  async updateLeadMeetingStatus(leadId, meetingId, hasScheduledMeeting, trackingId = null) {
    const lead = await insforgeDataService.updateLead(leadId, {
      meetingScheduled: Boolean(hasScheduledMeeting),
      status: hasScheduledMeeting ? 'meeting_scheduled' : 'nurture',
      updatedAt: new Date(),
    });

    return {
      success: Boolean(lead),
      lead,
      meetingId,
      trackingId,
    };
  }

  async markReminderSent() {
    return { success: true };
  }

  async getMeetingsNeedingDailyReminders() {
    return [];
  }

  async getMeetingsNeedingHourlyReminders() {
    return [];
  }

  async getMeetingsNeedingSms24hReminders() {
    return [];
  }

  async getMeetingsNeedingSms1hReminders() {
    return [];
  }

  async getLeadsNeedingMeetingReminders() {
    return [];
  }

  async sendSmsReminder(meeting, reminderType, trackingId) {
    logger.info('SMS reminder skipped in InsForge-safe meeting service', {
      meetingId: meeting?.id,
      reminderType,
      trackingId,
    });
    return { success: true, skipped: true };
  }
}

export default new MeetingService();
