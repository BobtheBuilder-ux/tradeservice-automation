# Calendly Webhook Integration with Scheduled Email Service

This guide explains how to integrate the Calendly webhook system with your existing scheduled email service to create automated email workflows triggered by meeting events.

## Overview

The integration combines:
- **Calendly Webhooks**: Real-time meeting event notifications
- **Email Queue System**: Scheduled and automated email processing
- **Meeting Service**: Meeting lifecycle management
- **Email Templates**: Pre-built email templates for different scenarios

## Architecture

```
Calendly Event → Webhook Handler → Meeting Service → Email Queue → Email Processor → SMTP
                                      ↓
                              Workflow Automation
                                      ↓
                              Scheduled Follow-ups
```

## Implementation Steps

### 1. Webhook Event Processing

When a Calendly event is received, the webhook handler processes it and triggers email workflows:

```javascript
// In calendly-webhook.js route handler
app.post('/webhook/calendly', async (req, res) => {
  const { event, payload } = req.body;
  const trackingId = generateTrackingId();
  
  try {
    // Process the meeting event
    const result = await MeetingService.processCalendlyEvent({
      event,
      payload,
      trackingId
    });
    
    // Trigger email workflows based on event type
    await triggerEmailWorkflows(event, payload, result, trackingId);
    
    res.status(200).json({ success: true, trackingId });
  } catch (error) {
    logger.logError(error, { context: 'calendly_webhook', trackingId });
    res.status(500).json({ error: 'Processing failed' });
  }
});
```

### 2. Email Workflow Triggers

Create email workflows for different Calendly events:

```javascript
// Email workflow trigger function
async function triggerEmailWorkflows(eventType, payload, meetingResult, trackingId) {
  const { meeting, leadData } = meetingResult;
  
  switch (eventType) {
    case 'invitee.created':
      await handleMeetingScheduled(meeting, leadData, trackingId);
      break;
      
    case 'invitee.canceled':
      await handleMeetingCanceled(meeting, leadData, trackingId);
      break;
      
    case 'invitee_no_show.created':
      await handleMeetingNoShow(meeting, leadData, trackingId);
      break;
      
    default:
      logger.info('No email workflow for event type', { eventType, trackingId });
  }
}
```

### 3. Meeting Scheduled Email Workflow

```javascript
async function handleMeetingScheduled(meeting, leadData, trackingId) {
  try {
    // 1. Send immediate confirmation email
    await EmailTemplateService.queueMeetingConfirmationEmail(
      leadData.id,
      leadData.email,
      leadData.fullName,
      {
        meeting_time: meeting.startTime,
        meeting_title: meeting.title,
        meeting_url: meeting.meetingUrl,
        location: meeting.location
      },
      trackingId
    );
    
    // 2. Schedule 24-hour reminder
    const reminder24h = new Date(meeting.startTime);
    reminder24h.setHours(reminder24h.getHours() - 24);
    
    if (reminder24h > new Date()) {
      await EmailTemplateService.queueMeetingReminderEmail(
        leadData.id,
        leadData.email,
        leadData.fullName,
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
    }
    
    // 3. Schedule 1-hour reminder
    const reminder1h = new Date(meeting.startTime);
    reminder1h.setHours(reminder1h.getHours() - 1);
    
    if (reminder1h > new Date()) {
      await EmailTemplateService.queueMeetingReminderEmail(
        leadData.id,
        leadData.email,
        leadData.fullName,
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
    }
    
    // 4. Schedule follow-up email (24 hours after meeting)
    const followUp = new Date(meeting.endTime);
    followUp.setHours(followUp.getHours() + 24);
    
    await EmailTemplateService.queueFollowUpEmail(
      leadData.id,
      leadData.email,
      leadData.fullName,
      {
        meeting_time: meeting.startTime,
        meeting_title: meeting.title
      },
      followUp.toISOString(),
      trackingId
    );
    
    logger.info('Meeting scheduled email workflow completed', {
      trackingId,
      meetingId: meeting.id,
      leadId: leadData.id
    });
    
  } catch (error) {
    logger.logError(error, {
      context: 'meeting_scheduled_email_workflow',
      trackingId,
      meetingId: meeting.id
    });
  }
}
```

### 4. Email Template Service Integration

Extend the existing EmailTemplateService with Calendly-specific templates:

```javascript
// Add to EmailTemplateService class

/**
 * Queue meeting confirmation email
 */
async queueMeetingConfirmationEmail(leadId, email, name, meetingData, trackingId) {
  try {
    const subject = `Meeting Confirmed: ${meetingData.meeting_title}`;
    const meetingTime = new Date(meetingData.meeting_time).toLocaleString();
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #28a745;">✅ Meeting Confirmed!</h2>
        <p>Hi ${name},</p>
        <p>Your meeting has been successfully scheduled. Here are the details:</p>
        
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #333;">${meetingData.meeting_title}</h3>
          <p><strong>📅 Date & Time:</strong> ${meetingTime}</p>
          <p><strong>📍 Location:</strong> ${meetingData.location || 'Online Meeting'}</p>
          ${meetingData.meeting_url ? `<p><strong>🔗 Join Link:</strong> <a href="${meetingData.meeting_url}">${meetingData.meeting_url}</a></p>` : ''}
        </div>
        
        <p>We're looking forward to speaking with you!</p>
        <p>You'll receive reminder emails 24 hours and 1 hour before the meeting.</p>
        
        <p>Best regards,<br>Your Team</p>
        <p><small>Tracking ID: ${trackingId}</small></p>
      </div>
    `;
    
    const text = `Meeting Confirmed: ${meetingData.meeting_title}\n\nDate & Time: ${meetingTime}\nLocation: ${meetingData.location || 'Online Meeting'}\n${meetingData.meeting_url ? `Join Link: ${meetingData.meeting_url}\n` : ''}\nTracking ID: ${trackingId}`;
    
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
    const subject = `${isUrgent ? '🚨 ' : '⏰ '}Meeting Reminder: ${meetingData.meeting_title} ${isUrgent ? 'in 1 hour' : 'tomorrow'}`;
    const meetingTime = new Date(meetingData.meeting_time).toLocaleString();
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: ${isUrgent ? '#dc3545' : '#ffc107'};">⏰ Meeting Reminder</h2>
        <p>Hi ${name},</p>
        <p>This is a friendly reminder about your upcoming meeting ${isUrgent ? 'in 1 hour' : 'tomorrow'}:</p>
        
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid ${isUrgent ? '#dc3545' : '#ffc107'};">
          <h3 style="margin-top: 0; color: #333;">${meetingData.meeting_title}</h3>
          <p><strong>📅 Date & Time:</strong> ${meetingTime}</p>
          <p><strong>📍 Location:</strong> ${meetingData.location || 'Online Meeting'}</p>
          ${meetingData.meeting_url ? `<p><strong>🔗 Join Link:</strong> <a href="${meetingData.meeting_url}" style="color: #007bff;">Click to Join</a></p>` : ''}
        </div>
        
        ${isUrgent ? '<p style="color: #dc3545;"><strong>⚠️ Your meeting starts in 1 hour. Please be ready!</strong></p>' : '<p>We recommend joining a few minutes early to test your connection.</p>'}
        
        <p>Looking forward to speaking with you!</p>
        <p>Best regards,<br>Your Team</p>
        <p><small>Tracking ID: ${trackingId}</small></p>
      </div>
    `;
    
    const text = `Meeting Reminder: ${meetingData.meeting_title}\n\nDate & Time: ${meetingTime}\nLocation: ${meetingData.location || 'Online Meeting'}\n${meetingData.meeting_url ? `Join Link: ${meetingData.meeting_url}\n` : ''}\nTracking ID: ${trackingId}`;
    
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
```

### 5. Email Queue Processing

The existing email queue processor will automatically handle the scheduled emails:

```javascript
// The EmailQueueProcessor already handles:
// 1. Processing emails at scheduled times
// 2. Retry logic for failed emails
// 3. Status tracking
// 4. Error handling

// Start the processor (usually in index.js)
import emailQueueProcessor from './src/services/email-queue-processor.js';

// Start processing emails
await emailQueueProcessor.start();
```

### 6. Environment Configuration

Add these environment variables:

```bash
# Calendly Configuration
CALENDLY_WEBHOOK_SECRET=your_webhook_secret
CALENDLY_BOOKING_URL=https://calendly.com/your-link

# Email Configuration
SMTP_HOST=your_smtp_host
SMTP_PORT=587
SMTP_USER=your_smtp_user
SMTP_PASS=your_smtp_password
EMAIL_FROM=noreply@yourdomain.com
EMAIL_FROM_NAME=Your Company
```

### 7. Database Schema

The integration uses existing tables:
- `email_queue`: Stores scheduled emails
- `meetings`: Stores meeting information
- `leads`: Stores lead information
- `meeting_reminders`: Tracks reminder status
- `workflow_automation`: Tracks automation workflows

### 8. Testing the Integration

```bash
# Test webhook endpoint
curl -X POST http://localhost:3001/webhook/calendly/test \
  -H "Content-Type: application/json" \
  -d '{
    "event": "invitee.created",
    "eventData": {
      "event_type": "consultation",
      "invitee": {
        "email": "test@example.com",
        "name": "Test User"
      },
      "event": {
        "start_time": "2024-01-20T10:00:00Z",
        "end_time": "2024-01-20T10:30:00Z",
        "location": {
          "join_url": "https://zoom.us/j/123456789"
        }
      }
    }
  }'

# Check email queue
curl http://localhost:3001/api/admin/email-queue

# Check meeting records
curl http://localhost:3001/api/admin/meetings
```

### 9. Monitoring and Logging

The integration includes comprehensive logging:
- Webhook event processing
- Email queue operations
- Meeting creation/updates
- Error tracking
- Performance metrics

### 10. Advanced Features

#### A. Conditional Email Workflows

```javascript
// Send different emails based on meeting type
if (meeting.meetingType === 'consultation') {
  await queueConsultationEmails(meeting, leadData, trackingId);
} else if (meeting.meetingType === 'demo') {
  await queueDemoEmails(meeting, leadData, trackingId);
}
```

#### B. Personalized Email Content

```javascript
// Use lead data for personalization
const personalizedContent = {
  industry: leadData.customFields?.industry,
  company: leadData.company,
  interests: leadData.customFields?.interests
};

await EmailTemplateService.queuePersonalizedEmail(
  leadData,
  personalizedContent,
  trackingId
);
```

#### C. Email Analytics

```javascript
// Track email performance
const emailMetrics = await db
  .select({
    template_type: emailQueue.templateType,
    sent_count: count(emailQueue.id),
    success_rate: avg(case(eq(emailQueue.status, 'sent'), 1, 0))
  })
  .from(emailQueue)
  .where(gte(emailQueue.createdAt, thirtyDaysAgo))
  .groupBy(emailQueue.templateType);
```

## Best Practices

1. **Error Handling**: Always wrap email operations in try-catch blocks
2. **Rate Limiting**: Respect email provider rate limits
3. **Unsubscribe**: Include unsubscribe links in marketing emails
4. **Testing**: Test email templates across different clients
5. **Monitoring**: Monitor email delivery rates and bounce rates
6. **Security**: Validate webhook signatures and sanitize inputs
7. **Performance**: Use email queuing for better performance
8. **Compliance**: Follow email marketing regulations (CAN-SPAM, GDPR)

## Troubleshooting

### Common Issues

1. **Emails not sending**: Check SMTP configuration and email queue processor status
2. **Duplicate emails**: Ensure webhook deduplication is working
3. **Wrong timing**: Verify timezone handling in scheduled emails
4. **Template errors**: Test email templates with sample data
5. **Database errors**: Check database connections and schema

### Debug Commands

```bash
# Check email queue status
node -e "import('./src/services/email-queue-processor.js').then(p => console.log(p.default.getStatus()))"

# Process pending emails manually
node -e "import('./src/services/email-queue-processor.js').then(p => p.default.processPendingEmails())"

# Check webhook logs
tail -f logs/webhook.log | grep calendly
```

This integration provides a robust, scalable email automation system that responds to Calendly events and manages the entire email lifecycle for your meetings.