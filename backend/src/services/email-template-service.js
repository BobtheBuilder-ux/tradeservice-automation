import insforgeDataService from './insforge-data-service.js';

class EmailTemplateService {
  async queueEmail(emailData = {}) {
    return insforgeDataService.createEmailQueue({
      toEmail: emailData.to || emailData.toEmail,
      fromEmail: emailData.from || emailData.fromEmail || process.env.FALLBACK_FROM_EMAIL || 'noreply@tradeservice.local',
      subject: emailData.subject || 'Follow up',
      htmlContent: emailData.html || emailData.htmlContent || emailData.text || '',
      textContent: emailData.text || emailData.textContent || null,
      emailType: emailData.template_type || emailData.emailType || 'general',
      leadId: emailData.lead_id || emailData.leadId || null,
      trackingId: emailData.tracking_id || emailData.trackingId || null,
      metadata: emailData.metadata || {},
      status: 'scheduled',
      scheduledFor: emailData.scheduled_for || emailData.scheduledFor || new Date().toISOString(),
    }, emailData);
  }

  async queueAppointmentEmail(leadData, calendlyLink, trackingId) {
    return this.queueEmail({
      to: leadData.email,
      subject: 'Schedule your consultation',
      html: `Schedule your consultation: ${calendlyLink}`,
      text: `Schedule your consultation: ${calendlyLink}`,
      template_type: 'appointment_scheduling',
      lead_id: leadData.id,
      tracking_id: trackingId,
      metadata: { calendlyLink },
    });
  }

  async queueFollowUpEmail(leadData, calendlyLink = null, trackingId = null) {
    return this.queueEmail({
      to: leadData.email,
      subject: 'Following up',
      html: calendlyLink ? `Following up. Booking link: ${calendlyLink}` : 'Following up.',
      text: calendlyLink ? `Following up. Booking link: ${calendlyLink}` : 'Following up.',
      template_type: 'follow_up',
      lead_id: leadData.id,
      tracking_id: trackingId,
    });
  }

  async queueWelcomeEmail(leadId, email, name, metadata) {
    return this.queueEmail({
      to: email,
      subject: `Welcome${name ? `, ${name}` : ''}`,
      html: `Welcome${name ? `, ${name}` : ''}.`,
      text: `Welcome${name ? `, ${name}` : ''}.`,
      template_type: 'welcome',
      lead_id: leadId,
      metadata,
    });
  }

  async queueSchedulingEmail(leadId, email, name, metadata) {
    return this.queueEmail({
      to: email,
      subject: 'Schedule your consultation',
      html: `Hi ${name || 'there'}, schedule your consultation when ready.`,
      text: `Hi ${name || 'there'}, schedule your consultation when ready.`,
      template_type: 'scheduling',
      lead_id: leadId,
      metadata,
    });
  }

  async queueSchedulingReminderEmail(leadId, email, name, reminderType, metadata) {
    return this.queueEmail({
      to: email,
      subject: 'Consultation reminder',
      html: `Hi ${name || 'there'}, this is your ${reminderType || ''} consultation reminder.`,
      text: `Hi ${name || 'there'}, this is your ${reminderType || ''} consultation reminder.`,
      template_type: 'scheduling_reminder',
      lead_id: leadId,
      metadata,
    });
  }

  async queueMeetingReminderEmail(...args) {
    if (typeof args[0] === 'object') {
      const [leadData, reminderType, trackingId] = args;
      return this.queueSchedulingReminderEmail(
        leadData.id,
        leadData.email,
        leadData.fullName || leadData.name,
        reminderType,
        { trackingId }
      );
    }

    const [leadId, email, name, reminderType, meetingData, scheduledFor, trackingId] = args;
    return this.queueEmail({
      to: email,
      subject: 'Meeting reminder',
      html: `Hi ${name || 'there'}, your meeting is coming up.`,
      text: `Hi ${name || 'there'}, your meeting is coming up.`,
      template_type: 'meeting_reminder',
      lead_id: leadId,
      tracking_id: trackingId,
      scheduled_for: scheduledFor?.toISOString?.() || scheduledFor || new Date().toISOString(),
      metadata: { reminderType, meetingData },
    });
  }
}

export default new EmailTemplateService();
