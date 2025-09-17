# Practical Implementation Example

This document shows exactly how to modify your existing code to integrate Calendly webhooks with the scheduled email service.

## 1. Modify the Calendly Webhook Handler

Update `/backend/src/routes/calendly-webhook.js` to trigger email workflows:

```javascript
// Add this import at the top
import AutomatedEmailWorkflowService from '../services/automated-email-workflow-service.js';
import EmailTemplateService from '../services/email-template-service.js';

// Modify the main webhook handler
router.post('/', async (req, res) => {
  const trackingId = generateTrackingId();
  
  try {
    // ... existing webhook validation code ...
    
    // Process the meeting event
    const result = await MeetingService.processCalendlyEvent({
      event: eventType,
      payload: eventData,
      trackingId
    });
    
    // NEW: Trigger email workflows
    await triggerEmailWorkflows(eventType, eventData, result, trackingId);
    
    res.status(200).json({ 
      success: true, 
      trackingId,
      processed: true,
      emailWorkflowTriggered: true
    });
    
  } catch (error) {
    logger.logError(error, {
      context: 'calendly_webhook_handler',
      trackingId,
      eventType
    });
    res.status(500).json({ error: 'Processing failed' });
  }
});

// NEW: Add email workflow trigger function
async function triggerEmailWorkflows(eventType, eventData, meetingResult, trackingId) {
  try {
    const { meeting, leadData } = meetingResult;
    
    logger.info('Triggering email workflows', {
      trackingId,
      eventType,
      meetingId: meeting?.id,
      leadId: leadData?.id
    });
    
    switch (eventType) {
      case 'invitee.created':
        await handleMeetingScheduledEmails(meeting, leadData, trackingId);
        break;
        
      case 'invitee.canceled':
        await handleMeetingCanceledEmails(meeting, leadData, trackingId);
        break;
        
      case 'invitee_no_show.created':
        await handleMeetingNoShowEmails(meeting, leadData, trackingId);
        break;
        
      default:
        logger.info('No email workflow configured for event type', {
          eventType,
          trackingId
        });
    }
    
  } catch (error) {
    logger.logError(error, {
      context: 'trigger_email_workflows',
      trackingId,
      eventType
    });
    // Don't throw - we don't want email failures to break webhook processing
  }
}

// NEW: Handle meeting scheduled emails
async function handleMeetingScheduledEmails(meeting, leadData, trackingId) {
  try {
    logger.info('Processing meeting scheduled email workflow', {
      trackingId,
      meetingId: meeting.id,
      leadId: leadData.id
    });
    
    // 1. Queue immediate confirmation email
    await EmailTemplateService.queueMeetingConfirmationEmail(
      leadData.id,
      leadData.email,
      leadData.fullName || leadData.firstName || 'Valued Customer',
      {
        meeting_time: meeting.startTime,
        meeting_title: meeting.title,
        meeting_url: meeting.meetingUrl,
        location: meeting.location
      },
      trackingId
    );
    
    // 2. Schedule reminder emails
    await scheduleReminderEmails(meeting, leadData, trackingId);
    
    // 3. Schedule follow-up email
    await scheduleFollowUpEmail(meeting, leadData, trackingId);
    
    logger.info('Meeting scheduled email workflow completed', {
      trackingId,
      meetingId: meeting.id
    });
    
  } catch (error) {
    logger.logError(error, {
      context: 'handle_meeting_scheduled_emails',
      trackingId,
      meetingId: meeting.id
    });
  }
}

// NEW: Schedule reminder emails
async function scheduleReminderEmails(meeting, leadData, trackingId) {
  const currentTime = new Date();
  const startTime = new Date(meeting.startTime);
  
  // Schedule 24-hour reminder
  const reminder24h = new Date(startTime);
  reminder24h.setHours(reminder24h.getHours() - 24);
  
  if (reminder24h > currentTime) {
    await EmailTemplateService.queueMeetingReminderEmail(
      leadData.id,
      leadData.email,
      leadData.fullName || leadData.firstName || 'Valued Customer',
      '24h',
      {
        meeting_time: meeting.startTime,
        meeting_title: meeting.title,
        meeting_url: meeting.meetingUrl,
        location: meeting.location
      },
      reminder24h.toISOString(),
      trackingId
    );
    
    logger.info('24-hour reminder email scheduled', {
      trackingId,
      meetingId: meeting.id,
      scheduledFor: reminder24h.toISOString()
    });
  }
  
  // Schedule 1-hour reminder
  const reminder1h = new Date(startTime);
  reminder1h.setHours(reminder1h.getHours() - 1);
  
  if (reminder1h > currentTime) {
    await EmailTemplateService.queueMeetingReminderEmail(
      leadData.id,
      leadData.email,
      leadData.fullName || leadData.firstName || 'Valued Customer',
      '1h',
      {
        meeting_time: meeting.startTime,
        meeting_title: meeting.title,
        meeting_url: meeting.meetingUrl,
        location: meeting.location
      },
      reminder1h.toISOString(),
      trackingId
    );
    
    logger.info('1-hour reminder email scheduled', {
      trackingId,
      meetingId: meeting.id,
      scheduledFor: reminder1h.toISOString()
    });
  }
}

// NEW: Schedule follow-up email
async function scheduleFollowUpEmail(meeting, leadData, trackingId) {
  // Schedule follow-up 24 hours after meeting ends
  const followUpTime = new Date(meeting.endTime);
  followUpTime.setHours(followUpTime.getHours() + 24);
  
  await EmailTemplateService.queueFollowUpEmail(
    leadData.id,
    leadData.email,
    leadData.fullName || leadData.firstName || 'Valued Customer',
    {
      meeting_time: meeting.startTime,
      meeting_title: meeting.title
    },
    followUpTime.toISOString(),
    trackingId
  );
  
  logger.info('Follow-up email scheduled', {
    trackingId,
    meetingId: meeting.id,
    scheduledFor: followUpTime.toISOString()
  });
}

// NEW: Handle meeting canceled emails
async function handleMeetingCanceledEmails(meeting, leadData, trackingId) {
  try {
    // Send cancellation confirmation
    await EmailTemplateService.queueMeetingCancellationEmail(
      leadData.id,
      leadData.email,
      leadData.fullName || leadData.firstName || 'Valued Customer',
      {
        meeting_time: meeting.startTime,
        meeting_title: meeting.title,
        cancellation_reason: meeting.cancellationReason
      },
      trackingId
    );
    
    // Offer to reschedule
    const rescheduleTime = new Date();
    rescheduleTime.setHours(rescheduleTime.getHours() + 2); // 2 hours later
    
    await EmailTemplateService.queueRescheduleOfferEmail(
      leadData.id,
      leadData.email,
      leadData.fullName || leadData.firstName || 'Valued Customer',
      rescheduleTime.toISOString(),
      trackingId
    );
    
    logger.info('Meeting cancellation emails queued', {
      trackingId,
      meetingId: meeting.id
    });
    
  } catch (error) {
    logger.logError(error, {
      context: 'handle_meeting_canceled_emails',
      trackingId,
      meetingId: meeting.id
    });
  }
}

// NEW: Handle no-show emails
async function handleMeetingNoShowEmails(meeting, leadData, trackingId) {
  try {
    // Send no-show follow-up
    await EmailTemplateService.queueNoShowFollowUpEmail(
      leadData.id,
      leadData.email,
      leadData.fullName || leadData.firstName || 'Valued Customer',
      {
        meeting_time: meeting.startTime,
        meeting_title: meeting.title
      },
      trackingId
    );
    
    logger.info('No-show follow-up email queued', {
      trackingId,
      meetingId: meeting.id
    });
    
  } catch (error) {
    logger.logError(error, {
      context: 'handle_meeting_no_show_emails',
      trackingId,
      meetingId: meeting.id
    });
  }
}
```

## 2. Extend Email Template Service

Add these methods to `/backend/src/services/email-template-service.js`:

```javascript
// Add these methods to the EmailTemplateService class

/**
 * Queue meeting confirmation email
 */
async queueMeetingConfirmationEmail(leadId, email, name, meetingData, trackingId) {
  try {
    const subject = `✅ Meeting Confirmed: ${meetingData.meeting_title}`;
    const meetingTime = new Date(meetingData.meeting_time).toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short'
    });
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #28a745; margin: 0;">✅ Meeting Confirmed!</h1>
        </div>
        
        <p style="font-size: 16px; color: #333;">Hi ${name},</p>
        <p style="font-size: 16px; color: #333;">Great news! Your meeting has been successfully scheduled. Here are the details:</p>
        
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 25px; border-radius: 12px; margin: 25px 0;">
          <h2 style="margin: 0 0 15px 0; font-size: 20px;">${meetingData.meeting_title}</h2>
          <div style="font-size: 16px; line-height: 1.6;">
            <p style="margin: 8px 0;"><strong>📅 Date & Time:</strong> ${meetingTime}</p>
            <p style="margin: 8px 0;"><strong>📍 Location:</strong> ${meetingData.location || 'Online Meeting'}</p>
            ${meetingData.meeting_url ? `<p style="margin: 8px 0;"><strong>🔗 Join Link:</strong> <a href="${meetingData.meeting_url}" style="color: #fff; text-decoration: underline;">Click to Join Meeting</a></p>` : ''}
          </div>
        </div>
        
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #28a745;">
          <h3 style="margin: 0 0 10px 0; color: #333;">What to Expect:</h3>
          <ul style="margin: 0; padding-left: 20px; color: #666;">
            <li>We'll discuss your specific needs and goals</li>
            <li>Get personalized recommendations</li>
            <li>Learn about our solutions and next steps</li>
            <li>No pressure - just valuable insights</li>
          </ul>
        </div>
        
        <p style="font-size: 16px; color: #333;">📧 You'll receive reminder emails 24 hours and 1 hour before the meeting.</p>
        <p style="font-size: 16px; color: #333;">💡 <strong>Pro tip:</strong> Join a few minutes early to test your connection!</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <p style="font-size: 16px; color: #333;">Looking forward to speaking with you!</p>
        </div>
        
        <div style="border-top: 1px solid #eee; padding-top: 20px; margin-top: 30px; text-align: center;">
          <p style="color: #666; font-size: 14px; margin: 0;">Best regards,<br><strong>Your Team</strong></p>
          <p style="color: #999; font-size: 12px; margin: 10px 0 0 0;">Tracking ID: ${trackingId}</p>
        </div>
      </div>
    `;
    
    const text = `Meeting Confirmed: ${meetingData.meeting_title}\n\nHi ${name},\n\nYour meeting has been successfully scheduled:\n\nDate & Time: ${meetingTime}\nLocation: ${meetingData.location || 'Online Meeting'}\n${meetingData.meeting_url ? `Join Link: ${meetingData.meeting_url}\n` : ''}\nYou'll receive reminder emails before the meeting.\n\nLooking forward to speaking with you!\n\nBest regards,\nYour Team\n\nTracking ID: ${trackingId}`;
    
    return await this.queueEmail({
      to: email,
      subject,
      html,
      text,
      template_type: 'meeting_confirmation',
      lead_id: leadId,
      tracking_id: trackingId,
      metadata: {
        meeting_time: meetingData.meeting_time,
        meeting_title: meetingData.meeting_title,
        meeting_url: meetingData.meeting_url,
        location: meetingData.location
      }
    });
    
  } catch (error) {
    logger.logError(error, {
      context: 'queue_meeting_confirmation_email',
      leadId,
      trackingId
    });
    throw error;
  }
}

/**
 * Queue meeting reminder email
 */
async queueMeetingReminderEmail(leadId, email, name, reminderType, meetingData, scheduledFor, trackingId) {
  try {
    const isUrgent = reminderType === '1h';
    const timeText = isUrgent ? 'in 1 hour' : 'tomorrow';
    const subject = `${isUrgent ? '🚨' : '⏰'} Meeting Reminder: ${meetingData.meeting_title} ${timeText}`;
    const meetingTime = new Date(meetingData.meeting_time).toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short'
    });
    
    const urgencyColor = isUrgent ? '#dc3545' : '#ffc107';
    const urgencyBg = isUrgent ? '#fff5f5' : '#fffbf0';
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: ${urgencyColor}; margin: 0;">${isUrgent ? '🚨' : '⏰'} Meeting Reminder</h1>
        </div>
        
        <p style="font-size: 16px; color: #333;">Hi ${name},</p>
        <p style="font-size: 16px; color: #333;">This is a friendly reminder about your upcoming meeting <strong>${timeText}</strong>:</p>
        
        <div style="background-color: ${urgencyBg}; padding: 25px; border-radius: 12px; margin: 25px 0; border-left: 5px solid ${urgencyColor};">
          <h2 style="margin: 0 0 15px 0; color: #333; font-size: 20px;">${meetingData.meeting_title}</h2>
          <div style="font-size: 16px; line-height: 1.6; color: #333;">
            <p style="margin: 8px 0;"><strong>📅 Date & Time:</strong> ${meetingTime}</p>
            <p style="margin: 8px 0;"><strong>📍 Location:</strong> ${meetingData.location || 'Online Meeting'}</p>
            ${meetingData.meeting_url ? `<p style="margin: 8px 0;"><strong>🔗 Join Link:</strong> <a href="${meetingData.meeting_url}" style="color: #007bff; font-weight: bold;">Click to Join Meeting</a></p>` : ''}
          </div>
        </div>
        
        ${isUrgent ? 
          `<div style="background-color: #fff5f5; padding: 20px; border-radius: 8px; margin: 20px 0; border: 2px solid #dc3545;">
            <p style="color: #dc3545; font-weight: bold; margin: 0; font-size: 16px; text-align: center;">⚠️ Your meeting starts in 1 hour. Please be ready!</p>
          </div>` : 
          `<div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="color: #666; margin: 0; text-align: center;">💡 We recommend joining a few minutes early to test your connection.</p>
          </div>`
        }
        
        <div style="text-align: center; margin: 30px 0;">
          <p style="font-size: 16px; color: #333;">Looking forward to speaking with you!</p>
        </div>
        
        <div style="border-top: 1px solid #eee; padding-top: 20px; margin-top: 30px; text-align: center;">
          <p style="color: #666; font-size: 14px; margin: 0;">Best regards,<br><strong>Your Team</strong></p>
          <p style="color: #999; font-size: 12px; margin: 10px 0 0 0;">Tracking ID: ${trackingId}</p>
        </div>
      </div>
    `;
    
    const text = `Meeting Reminder: ${meetingData.meeting_title}\n\nHi ${name},\n\nYour meeting is ${timeText}:\n\nDate & Time: ${meetingTime}\nLocation: ${meetingData.location || 'Online Meeting'}\n${meetingData.meeting_url ? `Join Link: ${meetingData.meeting_url}\n` : ''}\n${isUrgent ? 'Your meeting starts in 1 hour. Please be ready!' : 'We recommend joining a few minutes early.'}\n\nLooking forward to speaking with you!\n\nBest regards,\nYour Team\n\nTracking ID: ${trackingId}`;
    
    return await this.queueEmail({
      to: email,
      subject,
      html,
      text,
      template_type: `meeting_reminder_${reminderType}`,
      lead_id: leadId,
      tracking_id: trackingId,
      scheduled_for: scheduledFor,
      metadata: {
        reminder_type: reminderType,
        meeting_time: meetingData.meeting_time,
        meeting_title: meetingData.meeting_title,
        meeting_url: meetingData.meeting_url,
        location: meetingData.location
      }
    });
    
  } catch (error) {
    logger.logError(error, {
      context: 'queue_meeting_reminder_email',
      leadId,
      reminderType,
      trackingId
    });
    throw error;
  }
}

/**
 * Queue meeting cancellation email
 */
async queueMeetingCancellationEmail(leadId, email, name, meetingData, trackingId) {
  try {
    const subject = `Meeting Canceled: ${meetingData.meeting_title}`;
    const meetingTime = new Date(meetingData.meeting_time).toLocaleString();
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #dc3545;">Meeting Canceled</h2>
        <p>Hi ${name},</p>
        <p>We wanted to confirm that your meeting has been canceled:</p>
        
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #dc3545;">
          <h3 style="margin-top: 0; color: #333;">${meetingData.meeting_title}</h3>
          <p><strong>Original Time:</strong> ${meetingTime}</p>
          ${meetingData.cancellation_reason ? `<p><strong>Reason:</strong> ${meetingData.cancellation_reason}</p>` : ''}
        </div>
        
        <p>We understand that schedules can change. If you'd like to reschedule, we'll send you a new booking link shortly.</p>
        
        <p>Best regards,<br>Your Team</p>
        <p><small>Tracking ID: ${trackingId}</small></p>
      </div>
    `;
    
    const text = `Meeting Canceled: ${meetingData.meeting_title}\n\nHi ${name},\n\nYour meeting scheduled for ${meetingTime} has been canceled.\n${meetingData.cancellation_reason ? `Reason: ${meetingData.cancellation_reason}\n` : ''}\nWe'll send you a reschedule link shortly.\n\nBest regards,\nYour Team\n\nTracking ID: ${trackingId}`;
    
    return await this.queueEmail({
      to: email,
      subject,
      html,
      text,
      template_type: 'meeting_cancellation',
      lead_id: leadId,
      tracking_id: trackingId,
      metadata: meetingData
    });
    
  } catch (error) {
    logger.logError(error, {
      context: 'queue_meeting_cancellation_email',
      leadId,
      trackingId
    });
    throw error;
  }
}

/**
 * Queue reschedule offer email
 */
async queueRescheduleOfferEmail(leadId, email, name, scheduledFor, trackingId) {
  try {
    const subject = `Let's Reschedule Your Meeting`;
    const calendlyLink = process.env.CALENDLY_BOOKING_URL || process.env.CALENDLY_LINK;
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #007bff;">Let's Reschedule</h2>
        <p>Hi ${name},</p>
        <p>We'd love to find a new time that works better for you.</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${calendlyLink}" style="background-color: #007bff; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">Schedule New Meeting</a>
        </div>
        
        <p>Choose any time that works for you, and we'll be ready to help!</p>
        
        <p>Best regards,<br>Your Team</p>
        <p><small>Tracking ID: ${trackingId}</small></p>
      </div>
    `;
    
    const text = `Let's Reschedule Your Meeting\n\nHi ${name},\n\nWe'd love to find a new time that works for you.\n\nSchedule here: ${calendlyLink}\n\nBest regards,\nYour Team\n\nTracking ID: ${trackingId}`;
    
    return await this.queueEmail({
      to: email,
      subject,
      html,
      text,
      template_type: 'reschedule_offer',
      lead_id: leadId,
      tracking_id: trackingId,
      scheduled_for: scheduledFor,
      metadata: {
        calendly_link: calendlyLink
      }
    });
    
  } catch (error) {
    logger.logError(error, {
      context: 'queue_reschedule_offer_email',
      leadId,
      trackingId
    });
    throw error;
  }
}

/**
 * Queue no-show follow-up email
 */
async queueNoShowFollowUpEmail(leadId, email, name, meetingData, trackingId) {
  try {
    const subject = `We Missed You - Let's Reconnect`;
    const calendlyLink = process.env.CALENDLY_BOOKING_URL || process.env.CALENDLY_LINK;
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #ffc107;">We Missed You!</h2>
        <p>Hi ${name},</p>
        <p>We noticed you weren't able to make it to our scheduled meeting. No worries - we understand things come up!</p>
        
        <p>We're still here and ready to help whenever you're available.</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${calendlyLink}" style="background-color: #28a745; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">Schedule New Meeting</a>
        </div>
        
        <p>Feel free to pick any time that works better for you.</p>
        
        <p>Best regards,<br>Your Team</p>
        <p><small>Tracking ID: ${trackingId}</small></p>
      </div>
    `;
    
    const text = `We Missed You - Let's Reconnect\n\nHi ${name},\n\nWe missed you at our scheduled meeting. No worries!\n\nSchedule a new time: ${calendlyLink}\n\nBest regards,\nYour Team\n\nTracking ID: ${trackingId}`;
    
    return await this.queueEmail({
      to: email,
      subject,
      html,
      text,
      template_type: 'no_show_followup',
      lead_id: leadId,
      tracking_id: trackingId,
      metadata: {
        original_meeting_time: meetingData.meeting_time,
        meeting_title: meetingData.meeting_title,
        calendly_link: calendlyLink
      }
    });
    
  } catch (error) {
    logger.logError(error, {
      context: 'queue_no_show_followup_email',
      leadId,
      trackingId
    });
    throw error;
  }
}
```

## 3. Start Email Queue Processor

Ensure the email queue processor is running in `/backend/index.js`:

```javascript
// Add this import
import emailQueueProcessor from './src/services/email-queue-processor.js';

// Add this after server setup
if (process.env.NODE_ENV !== 'test') {
  // Start email queue processor
  emailQueueProcessor.start()
    .then(() => {
      logger.info('Email queue processor started successfully');
    })
    .catch((error) => {
      logger.error('Failed to start email queue processor:', error);
    });
}
```

## 4. Test the Integration

```bash
# Test the webhook with a meeting scheduled event
curl -X POST http://localhost:3001/webhook/calendly/test \
  -H "Content-Type: application/json" \
  -d '{
    "event": "invitee.created",
    "eventData": {
      "event_type": "consultation",
      "invitee": {
        "email": "test@example.com",
        "name": "John Doe"
      },
      "event": {
        "start_time": "2024-01-25T15:00:00Z",
        "end_time": "2024-01-25T15:30:00Z",
        "name": "Strategy Consultation",
        "location": {
          "join_url": "https://zoom.us/j/123456789"
        }
      }
    }
  }'

# Check that emails were queued
curl http://localhost:3001/api/admin/email-queue | jq '.[] | {id, to_email, template_type, status, scheduled_for}'

# Check meeting records
curl http://localhost:3001/api/admin/meetings | jq '.[] | {id, title, start_time, status}'
```

## 5. Monitor Email Processing

```bash
# Check email queue processor status
node -e "import('./src/services/email-queue-processor.js').then(p => console.log(p.default.getStatus()))"

# View recent email logs
tail -f logs/application.log | grep -E '(email|queue)'

# Check for failed emails
curl http://localhost:3001/api/admin/email-queue?status=failed
```

This implementation provides a complete integration between your Calendly webhooks and scheduled email service, with proper error handling, logging, and monitoring capabilities.