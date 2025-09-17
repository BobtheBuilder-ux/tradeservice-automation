# N8N Webhook Integration for Email Automation

This document describes how to integrate N8N with your email automation system using the newly created webhook endpoints.

## Base URL

**Production Backend:** `https://tradeservice-automation.onrender.com/webhook/n8n`
**Local Development:** `http://localhost:3001/webhook/n8n`

> **Note:** Use the production URL for N8N workflows in production environment. The local development URL is only for testing during development.

## Available Endpoints

### 1. Webhook Verification
**GET** `/webhook/n8n`

Verifies that the webhook endpoint is active and returns available endpoints.

**Response:**
```json
{
  "status": "verified",
  "message": "N8N webhook endpoint verified",
  "timestamp": "2025-09-17T00:25:26.602Z",
  "service": "email-automation",
  "endpoints": {
    "sendEmail": "POST /webhook/n8n/send-email",
    "sendTemplateEmail": "POST /webhook/n8n/send-template-email",
    "queueEmail": "POST /webhook/n8n/queue-email"
  }
}
```

### 2. Send Custom Email
**POST** `/webhook/n8n/send-email`

Sends a custom email immediately using your configured SMTP service.

**Request Body:**
```json
{
  "to": "recipient@example.com",
  "subject": "Your Email Subject",
  "html": "<h1>HTML Email Content</h1><p>Your message here</p>",
  "text": "Plain text version of your email",
  "template_type": "custom",
  "lead_data": {
    "id": "lead-123",
    "full_name": "John Doe"
  },
  "metadata": {
    "campaign": "summer-2024",
    "source": "n8n"
  }
}
```

**Response:**
```json
{
  "success": true,
  "messageId": "<message-id@domain.com>",
  "trackingId": "uuid-tracking-id",
  "timestamp": "2025-09-17T00:25:50.639Z"
}
```

### 3. Send Template Email
**POST** `/webhook/n8n/send-template-email`

Sends emails using pre-built templates with dynamic content.

**Supported Templates:**
- `appointment_scheduling` / `calendly_appointment`
- `welcome`
- `meeting_reminder`
- `follow_up`
- `scheduling_reminder`

#### Welcome Email Example:
```json
{
  "to": "newuser@example.com",
  "template_type": "welcome",
  "lead_data": {
    "full_name": "Jane Smith",
    "id": "lead-456"
  }
}
```

#### Appointment Scheduling Email Example:
```json
{
  "to": "prospect@example.com",
  "template_type": "appointment_scheduling",
  "lead_data": {
    "full_name": "John Prospect",
    "id": "lead-789",
    "email": "prospect@example.com"
  },
  "calendly_link": "https://calendly.com/your-link"
}
```

#### Meeting Reminder Email Example:
```json
{
  "to": "attendee@example.com",
  "template_type": "meeting_reminder",
  "lead_data": {
    "full_name": "Meeting Attendee",
    "id": "lead-101"
  },
  "meeting_data": {
    "meeting_time": "2025-09-20T14:00:00Z",
    "meeting_title": "Strategy Discussion",
    "meeting_url": "https://zoom.us/j/123456789",
    "location": "Virtual Meeting"
  },
  "reminder_type": "24h"
}
```

### 4. Queue Email for Later Processing
**POST** `/webhook/n8n/queue-email`

Queues emails for later processing by the email queue system.

**Request Body:**
```json
{
  "to": "recipient@example.com",
  "subject": "Scheduled Email",
  "html": "<p>Email content</p>",
  "text": "Email content",
  "template_type": "custom",
  "lead_id": "lead-123",
  "scheduled_for": "2025-09-20T10:00:00Z",
  "priority": "high",
  "metadata": {
    "campaign": "follow-up"
  }
}
```

### 5. Health Check
**GET** `/webhook/n8n/health`

Returns the health status and configuration of the N8N webhook service.

## N8N Workflow Configuration

### Setting up HTTP Request Node in N8N

1. **Add HTTP Request Node** to your N8N workflow
2. **Configure the node** with these settings:
   - **Method:** POST
   - **URL:** `https://tradeservice-automation.onrender.com/webhook/n8n/send-template-email`
   - **Authentication:** None
   - **Headers:**
     ```json
     {
       "Content-Type": "application/json"
     }
     ```

3. **Request Body** (use JSON format):
   ```json
   {
     "to": "{{ $json.email }}",
     "template_type": "appointment_scheduling",
     "lead_data": {
       "full_name": "{{ $json.full_name }}",
       "id": "{{ $json.id }}",
       "email": "{{ $json.email }}"
     },
     "calendly_link": "https://calendly.com/your-actual-link"
   }
   ```

### Production vs Development URLs

**For Production N8N Workflows:**
- Base URL: `https://tradeservice-automation.onrender.com`
- Full endpoint: `https://tradeservice-automation.onrender.com/webhook/n8n/send-template-email`

**For Local Testing:**
- Base URL: `http://localhost:3001`
- Full endpoint: `http://localhost:3001/webhook/n8n/send-template-email`

### Testing Your Integration

You can test the production endpoint using curl:

```bash
curl -X POST https://tradeservice-automation.onrender.com/webhook/n8n/send-template-email \
  -H "Content-Type: application/json" \
  -d '{
    "to": "test@example.com",
    "template_type": "appointment_scheduling",
    "lead_data": {
      "full_name": "John Test",
      "id": "test-123"
    },
    "calendly_link": "https://calendly.com/your-link"
  }'
```

### Basic Email Sending Workflow

1. **HTTP Request Node Configuration:**
   - Method: `POST`
   - URL: `http://localhost:3001/webhook/n8n/send-template-email`
   - Headers: `Content-Type: application/json`
   - Body:
   ```json
   {
     "to": "{{ $json.email }}",
     "template_type": "welcome",
     "lead_data": {
       "full_name": "{{ $json.name }}",
       "id": "{{ $json.leadId }}"
     }
   }
   ```

### Advanced Template Email Workflow

1. **Trigger Node:** Webhook or Schedule
2. **Function Node:** Prepare email data
3. **HTTP Request Node:** Send to N8N webhook
4. **IF Node:** Check response success
5. **Set Node:** Log results

### Function Node Example (Data Preparation):
```javascript
// Prepare email data for template
const emailData = {
  to: $input.first().json.email,
  template_type: 'appointment_scheduling',
  lead_data: {
    full_name: $input.first().json.firstName + ' ' + $input.first().json.lastName,
    id: $input.first().json.leadId,
    email: $input.first().json.email
  },
  calendly_link: 'https://calendly.com/your-booking-link'
};

return { json: emailData };
```

## Error Handling

All endpoints return standardized error responses:

```json
{
  "success": false,
  "error": "Error description",
  "trackingId": "uuid-tracking-id"
}
```

**Common HTTP Status Codes:**
- `200`: Success
- `400`: Bad Request (missing required fields, invalid email format)
- `500`: Internal Server Error

## Security Considerations

1. **Email Validation:** All email addresses are validated before processing
2. **Rate Limiting:** Consider implementing rate limiting in N8N workflows
3. **Data Sanitization:** HTML content is processed safely
4. **Tracking:** All requests are logged with unique tracking IDs

## Monitoring and Logging

All webhook requests are logged with:
- Unique tracking IDs
- Request/response data (emails are hashed for privacy)
- Processing status
- Error details when applicable

Logs can be found in the backend application logs for debugging and monitoring purposes.

## Testing

Use the test endpoint to verify connectivity:

**POST** `/webhook/n8n/test`
```json
{
  "test": "data"
}
```

This will return a success response with the received data, confirming the webhook is accessible.

## Integration Examples

### CRM Integration
Trigger welcome emails when new contacts are added to your CRM:
1. CRM webhook → N8N
2. N8N processes contact data
3. N8N calls `/webhook/n8n/send-template-email` with welcome template

### Meeting Scheduling
Send appointment reminders:
1. Calendar event created → N8N
2. N8N schedules reminder emails
3. N8N calls `/webhook/n8n/send-template-email` with meeting reminder template

### Lead Nurturing
Automate follow-up sequences:
1. Lead captured → N8N
2. N8N creates email sequence
3. Multiple calls to `/webhook/n8n/queue-email` with different schedules

This integration allows you to leverage your existing email templates and infrastructure while using N8N's powerful automation capabilities.