# Zapier Webhook Integration

This document explains how to integrate your automation system with Zapier using webhooks to send emails through your custom email service.

## Overview

The Zapier webhook integration allows you to:
- Send custom emails through your existing email service
- Send templated emails (appointment, follow-up, reminder)
- Monitor webhook health
- Test the integration

## Webhook Endpoints

All webhook endpoints are available at: `https://tradeservice-automation.onrender.com/webhook/zapier/`

### 1. Send Custom Email

**Endpoint:** `POST /webhook/zapier/send-email`

**Request Body:**
```json
{
  "to": "recipient@example.com",
  "subject": "Your Email Subject",
  "message": "Your email message content",
  "html": "<p>Optional HTML content</p>" // Optional
}
```

**Response:**
```json
{
  "success": true,
  "trackingId": "unique-tracking-id",
  "messageId": "email-message-id"
}
```

### 2. Send Template Email

**Endpoint:** `POST /webhook/zapier/send-template`

**Request Body:**
```json
{
  "to": "recipient@example.com",
  "template_type": "appointment", // "appointment", "follow_up", or "reminder"
  "lead_data": {
    "name": "John Doe",
    "email": "john@example.com",
    "phone": "+1234567890"
  },
  "template_data": {
    "appointment_time": "2024-01-15T10:00:00Z",
    "meeting_link": "https://calendly.com/meeting"
  }
}
```

### 3. Health Check

**Endpoint:** `GET /webhook/zapier/health`

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:00:00Z",
  "service": "zapier-webhook"
}
```

### 4. Test Endpoint

**Endpoint:** `POST /webhook/zapier/test`

**Request Body:**
```json
{
  "test_data": "any test data"
}
```

## Setting Up Zapier Integration

### Step 1: Create a Zap
1. Log into your Zapier account
2. Click "Create Zap"
3. Choose your trigger app (e.g., Google Forms, Typeform, etc.)

### Step 2: Configure the Webhook Action
1. Search for "Webhooks by Zapier" as your action app
2. Choose "POST" as the event
3. Set the URL to: `https://tradeservice-automation.onrender.com/webhook/zapier/send-email`
4. Set the Payload Type to "JSON"

### Step 3: Configure the Request Body
Map your trigger data to the webhook payload:

```json
{
  "to": "{{trigger_email}}",
  "subject": "Welcome {{trigger_name}}!",
  "message": "Thank you for your interest. We'll be in touch soon."
}
```

### Step 4: Test and Activate
1. Test your Zap to ensure it works correctly
2. Activate the Zap

## Security Considerations

1. **Rate Limiting**: The webhook includes basic rate limiting to prevent abuse
2. **Input Validation**: All inputs are validated and sanitized
3. **Error Handling**: Comprehensive error handling with detailed logging
4. **Tracking**: Each request gets a unique tracking ID for monitoring

## Monitoring and Debugging

### Logs
All webhook requests are logged with:
- Tracking ID
- Request details
- Success/failure status
- Error messages (if any)

### Health Monitoring
Use the health endpoint to monitor the webhook service status.

### Testing
Use the test endpoint to verify your integration without sending actual emails.

## Example Use Cases

1. **Lead Capture**: When someone fills out a form, automatically send a welcome email
2. **Appointment Booking**: Send confirmation emails when appointments are scheduled
3. **Follow-up Automation**: Trigger follow-up emails based on user actions
4. **Notification System**: Send alerts and notifications through your email service

## Troubleshooting

### Common Issues

1. **Connection Refused**: Ensure your server is running and accessible
2. **Invalid JSON**: Check that your request body is valid JSON
3. **Missing Fields**: Ensure required fields (to, subject, message) are provided
4. **Email Delivery Issues**: Check your SMTP configuration in the email service

### Support

For issues with the webhook integration, check the server logs for detailed error messages and tracking IDs.