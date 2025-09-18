# Calendly Webhook Integration Setup Guide

## Overview
This guide provides complete setup instructions for the enhanced Calendly webhook integration system with enterprise-level security, reliability, and monitoring capabilities.

## Prerequisites

### Required Environment Variables
Add these to your `.env` file:

```bash
# Calendly Configuration
CALENDLY_WEBHOOK_SECRET=your_calendly_webhook_secret_here
CALENDLY_API_TOKEN=your_calendly_api_token_here
# CALENDLY_ALLOWED_IPS removed - no longer using IP whitelist

# Database Configuration
DATABASE_URL=your_supabase_database_url

# Server Configuration
PORT=3001
NODE_ENV=production
```

### Dependencies
Ensure these packages are installed:

```bash
npm install express-rate-limit
```

## Calendly Dashboard Setup

### 1. Create Webhook Subscription

1. Log into your Calendly account
2. Go to **Integrations & Apps** → **API & Webhooks**
3. Click **Create Webhook**
4. Configure the webhook:
   - **Endpoint URL**: `https://yourdomain.com/webhook/calendly`
   - **Events**: Select the events you want to track:
     - `invitee.created` - New meeting scheduled
     - `invitee.canceled` - Meeting canceled
     - `invitee.rescheduled` - Meeting rescheduled
     - `invitee.no_show` - Meeting marked as no-show
   - **Signing Key**: Generate and save this securely

### 2. Generate API Token

1. In Calendly, go to **Integrations & Apps** → **API & Webhooks**
2. Click **Generate New Token**
3. Copy the token and add it to your environment variables

## Server Configuration

### Available Endpoints

#### Main Webhook Endpoint
```
POST /webhook/calendly
```
- **Purpose**: Receives real Calendly webhook events
- **Security**: Signature verification, rate limiting
- **Rate Limit**: 100 requests per 15 minutes per IP

#### Test Endpoint
```
POST /webhook/calendly/test
```
- **Purpose**: Test webhook processing without signature verification
- **Rate Limit**: 10 requests per 5 minutes per IP
- **Payload Format**:
```json
{
  "eventData": {
    "event": "invitee.created",
    "time": "2024-01-15T10:00:00.000000Z",
    "payload": {
      "event": {
        "uri": "https://api.calendly.com/scheduled_events/test123",
        "name": "Test Meeting",
        "start_time": "2024-01-15T15:00:00.000000Z",
        "end_time": "2024-01-15T16:00:00.000000Z"
      },
      "invitee": {
        "uri": "https://api.calendly.com/invitees/test456",
        "email": "test@example.com",
        "name": "Test User",
        "created_at": "2024-01-15T10:00:00.000000Z"
      }
    }
  }
}
```

#### Health Check Endpoint
```
GET /webhook/calendly/health
```
- **Purpose**: Monitor webhook service health
- **Response**: Service status and configuration info

## Security Features

### 1. Rate Limiting
- **Webhook Endpoint**: 100 requests per 15 minutes per IP
- **Test Endpoint**: 10 requests per 5 minutes per IP
- **Bypass**: Calendly IPs automatically bypass rate limits

### 2. Request Validation
- Content-Type validation for webhook requests
- Required headers verification
- Payload size limits (1MB)

### 3. Signature Verification
- All webhook requests verified using Calendly signing key
- Invalid signatures are rejected with 401 status

### 4. Request Validation
- Content-Type validation
- Required headers verification
- Payload size limits (1MB)

## Testing the Integration

### 1. Health Check Test
```bash
curl -X GET http://localhost:3001/webhook/calendly/health \
  -H "Content-Type: application/json" \
  -v
```

**Expected Response**: `200 OK` with service status

### 2. Test Endpoint
```bash
curl -X POST http://localhost:3001/webhook/calendly/test \
  -H "Content-Type: application/json" \
  -H "User-Agent: Calendly-Webhook" \
  -H "Calendly-Webhook: true" \
  -d '{
    "eventData": {
      "event": "invitee.created",
      "time": "2024-01-15T10:00:00.000000Z",
      "payload": {
        "event": {
          "uri": "https://api.calendly.com/scheduled_events/test123",
          "name": "Test Meeting",
          "start_time": "2024-01-15T15:00:00.000000Z",
          "end_time": "2024-01-15T16:00:00.000000Z"
        },
        "invitee": {
          "uri": "https://api.calendly.com/invitees/test456",
          "email": "test@example.com",
          "name": "Test User",
          "created_at": "2024-01-15T10:00:00.000000Z"
        }
      }
    }
  }'
```

**Expected Response**:
```json
{
  "success": true,
  "trackingId": "unique-tracking-id",
  "event": "invitee.created",
  "result": {
    "event": "invitee.created",
    "trackingId": "unique-tracking-id",
    "processed": true,
    "leadUpdated": false,
    "errors": []
  }
}
```

### 3. Rate Limiting Test
```bash
# Test rate limiting by making multiple rapid requests
for i in {1..5}; do
  echo "Request $i:"
  curl -X POST http://localhost:3001/webhook/calendly/test \
    -H "Content-Type: application/json" \
    -H "User-Agent: Calendly-Webhook" \
    -H "Calendly-Webhook: true" \
    -d '{"eventData":{"event":"invitee.created","time":"2024-01-15T10:00:00.000000Z","payload":{"event":{"uri":"https://api.calendly.com/scheduled_events/test'$i'","name":"Test Meeting","start_time":"2024-01-15T15:00:00.000000Z","end_time":"2024-01-15T16:00:00.000000Z"},"invitee":{"uri":"https://api.calendly.com/invitees/test'$i'","email":"test'$i'@example.com","name":"Test User","created_at":"2024-01-15T10:00:00.000000Z"}}}}' \
    -w "\nStatus: %{http_code}\n\n" \
    -s
done
```

## Monitoring and Logging

### Enhanced Logging Features
The system provides comprehensive logging with unique tracking IDs:

- **Webhook Processing**: Track complete webhook lifecycle
- **Meeting Operations**: Monitor meeting creation/updates
- **Security Events**: Log rate limiting and unauthorized access
- **Performance Metrics**: Track processing times
- **Data Validation**: Log validation results
- **Database Transactions**: Monitor transaction success/failure

### Log Locations
- **Console**: Real-time logs with emojis and timestamps
- **Files**: Structured logs in `/logs` directory
- **Winston**: JSON-formatted logs for analysis

### Tracking IDs
Every webhook request gets a unique tracking ID for end-to-end tracing:
```
2025-09-17 15:59:13 [hubspot-lead-automation] info: Manual Calendly event processing test initiated
{
  "trackingId": "d62fbc4b-f31d-4965-988b-b63604899030",
  "event": "invitee.created"
}
```

## Database Schema

### Meetings Table
The system creates meeting records in the `meetings` table:

```sql
CREATE TABLE meetings (
  id SERIAL PRIMARY KEY,
  lead_id INTEGER REFERENCES leads(id),
  calendly_event_id VARCHAR UNIQUE,
  calendly_invitee_id VARCHAR,
  meeting_name VARCHAR,
  start_time TIMESTAMP,
  end_time TIMESTAMP,
  status VARCHAR DEFAULT 'scheduled',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Meeting Reminders Table
```sql
CREATE TABLE meeting_reminders (
  id SERIAL PRIMARY KEY,
  meeting_id INTEGER REFERENCES meetings(id),
  reminder_type VARCHAR, -- '24h', '1h', '15min'
  scheduled_time TIMESTAMP,
  sent BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);
```

## Error Handling

### Retry Logic
- **Database Operations**: Automatic retry with exponential backoff
- **API Calls**: Configurable retry attempts
- **Transaction Rollback**: Automatic rollback on failures

### Error Responses
```json
{
  "error": "Error description",
  "code": "ERROR_CODE",
  "trackingId": "unique-tracking-id",
  "timestamp": "2024-01-15T10:00:00.000Z"
}
```

## Production Deployment

### 1. Environment Setup
- Set `NODE_ENV=production`
- Configure proper `CALENDLY_WEBHOOK_SECRET`
- Configure request validation settings
- Configure database connection

### 2. SSL/HTTPS
Ensure your webhook endpoint uses HTTPS in production:
- Calendly requires HTTPS for webhook endpoints
- Use a valid SSL certificate
- Configure proper domain routing

### 3. Monitoring
- Monitor webhook endpoint health
- Set up alerts for failed webhook processing
- Track rate limiting events
- Monitor database performance

### 4. Backup and Recovery
- Regular database backups
- Monitor log file sizes
- Set up log rotation

## Troubleshooting

### Common Issues

#### 1. Webhook Not Receiving Events
- **Check**: Webhook URL is accessible from internet
- **Check**: HTTPS is properly configured
- **Check**: Calendly webhook is active
- **Verify**: Endpoint returns 200 OK for test requests

#### 2. Signature Verification Failures
- **Check**: `CALENDLY_WEBHOOK_SECRET` matches Calendly configuration
- **Check**: Request body is not modified by middleware
- **Verify**: Signature header is present

#### 3. Rate Limiting Issues
- **Check**: Request headers and content type are valid
- **Monitor**: Rate limiting logs for patterns
- **Adjust**: Rate limits if legitimate traffic is blocked

#### 4. Database Connection Issues
- **Check**: Database URL is correct
- **Verify**: Database is accessible
- **Monitor**: Connection pool status

### Debug Commands

#### Check Server Status
```bash
curl -X GET http://localhost:3001/webhook/calendly/health
```

#### Test Webhook Processing
```bash
curl -X POST http://localhost:3001/webhook/calendly/test \
  -H "Content-Type: application/json" \
  -d '{"eventData":{"event":"invitee.created","payload":{"invitee":{"email":"test@example.com"}}}}'
```

#### Monitor Logs
```bash
# Real-time log monitoring
tail -f logs/combined.log

# Error logs only
tail -f logs/error.log
```

## Support

For issues or questions:
1. Check the logs for tracking IDs and error details
2. Verify environment configuration
3. Test with the provided curl commands
4. Review Calendly webhook configuration

---

**Note**: This integration includes enterprise-level features like rate limiting, comprehensive logging, and transaction handling for production use.