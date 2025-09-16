# HubSpot Lead Automation System

A comprehensive automation system that synchronizes leads from HubSpot CRM, processes them through automated workflows, stores them in Supabase, creates Trello cards for tracking, and integrates with Calendly for meeting scheduling.

## Features

- **HubSpot CRM Integration**: Automatically syncs and processes leads from HubSpot CRM
- **Lead Polling Service**: Continuously monitors HubSpot for new leads
- **Unified Lead Transformation**: Standardized lead processing supporting multiple sources
- **Supabase Database**: Stores lead data with full audit trail
- **Trello Project Management**: Creates cards for lead tracking and follow-up
- **Calendly Integration**: Tracks meeting scheduling, cancellations, and no-shows
- **Comprehensive Logging**: Winston-based logging with request tracking
- **Security**: Webhook signature verification and secure API access
- **Health Monitoring**: Built-in health checks for all services

## Architecture

```
HubSpot CRM → Polling Service → Express Server → Processing Pipeline
                                    ↓
                            ┌─────────────────┐
                            │ Lead Transform  │
                            │   & Validate    │
                            └─────────────────┘
                                    ↓
                    ┌───────────────┼───────────────┐
                    ↓               ↓               ↓
              ┌──────────┐   ┌──────────┐   ┌──────────┐
              │ HubSpot  │   │ Supabase │   │ Trello   │
              │ Webhook  │   │ Database │   │  Cards   │
              └──────────┘   └──────────┘   └──────────┘
                                    ↑
                            ┌─────────────────┐
                            │    Calendly     │
                            │   Webhooks      │
                            └─────────────────┘
```

## Prerequisites

- Node.js 18+ and npm
- Supabase account and project
- HubSpot account with API access and CRM data
- Trello account with API access
- Calendly account with webhook access (optional)

## Installation

1. **Clone and install dependencies:**
   ```bash
   git clone <repository-url>
   cd automation
   npm install
   ```

2. **Environment Configuration:**
   ```bash
   cp .env.example .env
   ```
   
   Fill in your API credentials in the `.env` file:
   
   ```env
   # Supabase Configuration
   SUPABASE_URL=your_supabase_project_url
   SUPABASE_ANON_KEY=your_supabase_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
   
   # HubSpot Configuration
   HUBSPOT_ACCESS_TOKEN=your_hubspot_private_app_token
   
   # Trello Configuration
   TRELLO_API_KEY=your_trello_api_key
   TRELLO_TOKEN=your_trello_token
   TRELLO_BOARD_ID=your_trello_board_id
   TRELLO_LIST_ID=your_trello_list_id
   
   # Calendly Configuration (Optional)
   CALENDLY_WEBHOOK_SECRET=your_calendly_webhook_secret
   
   # Server Configuration
   PORT=3000
   NODE_ENV=development
   ```

3. **Database Setup:**
   
   The application will automatically create the required `leads` table in Supabase on first run. The table schema includes:
   
   - Lead information (name, email, phone, etc.)
   - HubSpot contact data and metadata
   - Lead source and transformation status
   - Trello card ID and tracking
   - Calendly meeting information
   - Processing timestamps and status

## API Configuration

### HubSpot Setup

1. **Create Private App:**
   - Go to HubSpot Settings → Integrations → Private Apps
   - Create new private app with contacts read/write permissions
   - Copy the access token to your `.env` file

2. **Configure Webhook (Optional):**
   - Go to HubSpot Settings → Integrations → Webhooks
   - Add webhook URL: `https://yourdomain.com/webhook/hubspot`
   - Subscribe to contact creation/update events

3. **Lead Polling:**
   - The system automatically polls HubSpot for new leads
   - Polling interval can be configured in the application
   - No additional setup required for basic lead synchronization

### Trello Setup

1. **Get API Credentials:**
   - Visit [Trello API Key](https://trello.com/app-key)
   - Generate API key and token
   - Create a board and list for leads
   - Get board and list IDs from URLs

### Calendly Setup (Optional)

1. **Configure Webhooks:**
   - Go to Calendly Integrations → Webhooks
   - Add webhook URL: `https://yourdomain.com/webhook/calendly`
   - Subscribe to relevant events (invitee.created, invitee.canceled, etc.)

## Usage

### Development

```bash
# Start development server with auto-reload
npm run dev

# Start production server
npm start

# Run tests
npm test
```

### Testing Integration

**Test HubSpot sync:**
```bash
curl -X POST http://localhost:3000/api/hubspot/sync \
  -H "Content-Type: application/json"
```

**Test HubSpot webhook:**
```bash
curl -X POST http://localhost:3000/webhook/hubspot \
  -H "Content-Type: application/json" \
  -d '{
    "subscriptionType": "contact.creation",
    "eventId": "test_event_123",
    "objectId": "test_contact_456",
    "changeSource": "CRM"
  }'
```

**Test Calendly webhook:**
```bash
curl -X POST http://localhost:3000/webhook/calendly/test \
  -H "Content-Type: application/json" \
  -d '{
    "event": "invitee.created",
    "payload": {
      "invitee": {
        "email": "test@example.com",
        "name": "Test User"
      },
      "event": {
        "start_time": "2024-01-15T10:00:00Z",
        "end_time": "2024-01-15T11:00:00Z"
      }
    }
  }'
```

### Health Checks

```bash
# Basic health check
curl http://localhost:3000/health

# Detailed health check with service status
curl http://localhost:3000/health/detailed
```

## API Endpoints

### Webhooks

- `GET /webhook/hubspot` - HubSpot webhook verification
- `POST /webhook/hubspot` - HubSpot contact webhook handler
- `POST /api/hubspot/sync` - Manual HubSpot lead synchronization
- `POST /webhook/calendly` - Calendly event webhook handler
- `POST /webhook/calendly/test` - Test Calendly event processing

### Health & Monitoring

- `GET /health` - Basic health check
- `GET /health/detailed` - Detailed service health check

## Data Flow

1. **HubSpot Lead Synchronization:**
   - HubSpot polling service continuously monitors for new contacts
   - System fetches new/updated contacts from HubSpot CRM
   - Optional: HubSpot sends webhook notifications for real-time updates

2. **Lead Processing Pipeline:**
   - Validate and transform lead data using unified transformation service
   - Process lead through standardized format (supports multiple sources)
   - Store lead record in Supabase with full audit trail
   - Create tracking card in Trello for follow-up
   - Log all activities with unique tracking ID

3. **Calendly Integration:**
   - User schedules meeting via Calendly
   - Calendly sends webhook to `/webhook/calendly`
   - System updates lead status and meeting information
   - Tracks scheduling, cancellations, and no-shows

## Logging

The system uses Winston for comprehensive logging:

- **Console logs**: Development and immediate feedback
- **File logs**: Persistent storage in `logs/` directory
  - `error.log`: Error-level logs only
  - `combined.log`: All log levels
- **Request tracking**: Each request gets a unique tracking ID
- **Lead processing**: Detailed logs for each step of lead processing
- **Security**: Sensitive data is hashed before logging

## Error Handling

- **Webhook signature verification**: Prevents unauthorized requests
- **API rate limiting**: Handles rate limits from external services
- **Retry logic**: Automatic retries for transient failures
- **Graceful degradation**: System continues operating if one service fails
- **Comprehensive error logging**: All errors logged with context

## Security Features

- **Webhook signature verification** for HubSpot and Calendly
- **Secure API token management** for HubSpot integration
- **Environment variable validation** on startup
- **Sensitive data hashing** in logs
- **CORS configuration** for API security
- **Helmet.js** for security headers
- **Input validation** and sanitization

## Monitoring

### Health Checks

The system provides health endpoints that check:
- Application status
- Database connectivity (Supabase)
- External API accessibility (HubSpot, Trello)
- Configuration validation

### Logging Monitoring

Monitor these log patterns:
- `lead_processing_started` - New lead received
- `lead_processing_completed` - Lead successfully processed
- `service_error` - Service-specific errors
- `webhook_verification_failed` - Security issues

## Troubleshooting

### Common Issues

1. **HubSpot API connection fails:**
   - Verify `HUBSPOT_ACCESS_TOKEN` is valid and has proper permissions
   - Check HubSpot API rate limits and quotas
   - Ensure private app has contacts read/write scopes

2. **Lead polling issues:**
   - Check HubSpot polling service logs for errors
   - Verify network connectivity to HubSpot API
   - Review polling interval configuration

3. **Webhook verification fails:**
   - Ensure webhook URL is accessible from internet
   - Verify SSL certificate if using HTTPS
   - Check HubSpot webhook configuration

4. **Supabase connection issues:**
   - Verify `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
   - Check database permissions
   - Ensure `leads` table exists

5. **Trello card creation fails:**
   - Verify `TRELLO_API_KEY`, `TRELLO_TOKEN`, `TRELLO_BOARD_ID`, `TRELLO_LIST_ID`
   - Check board and list accessibility
   - Review Trello API permissions

### Debug Mode

Set `LOG_LEVEL=debug` in your `.env` file for verbose logging.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

For issues and questions:
1. Check the troubleshooting section
2. Review application logs
3. Test individual services using health endpoints
4. Create an issue with detailed error information