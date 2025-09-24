# Complete Zoom App Creation Guide

This comprehensive guide covers the entire Zoom app creation process from initial setup to marketplace publication.

## Prerequisites

- Zoom account (Pro, Business, Education, or Enterprise)
- Developer access to Zoom Marketplace
- Production domain with SSL certificate
- Valid business email address

## Step 1: Basic Information

Navigate to [Zoom App Marketplace](https://marketplace.zoom.us) and create a new app.

### 1.1 App Details
- **App Name**: Choose a unique, descriptive name for your application
- **App Type**: Select the appropriate type:
  - **OAuth App**: For integrations that access Zoom APIs on behalf of users
  - **Server-to-Server OAuth**: For backend integrations without user interaction
  - **Webhook Only**: For receiving event notifications only
  - **SDK App**: For embedding Zoom functionality into your application

### 1.2 Company Information
- **Company Name**: Your organization's legal name
- **Developer Contact Information**:
  - Name: Primary developer contact
  - Email Address: Valid business email for communication

### 1.3 App Description
- **Short Description**: Brief summary (under 100 characters)
- **Long Description**: Detailed explanation of app functionality and benefits
- **App Logo**: High-quality logo (recommended: 512x512px PNG)

### 1.4 App Credentials
- **Client ID**: Automatically generated (copy for your application)
- **Client Secret**: Automatically generated (store securely)
- **Redirect URL**: Your production OAuth callback URL
  - Format: `https://yourdomain.com/api/integrations/zoom/callback`
- **Whitelist URL**: Additional allowed redirect URLs (optional)

## Step 2: Features Configuration

Configure how your app integrates with Zoom's ecosystem.

### 2.1 Access
Define where and how users can access your app:
- **In-Client**: App appears within Zoom client interface
- **External**: App runs outside Zoom client
- **Both**: Hybrid approach supporting both access methods

### 2.2 Surface
Specify where your app appears in Zoom:
- **Meeting**: During Zoom meetings
- **Webinar**: During Zoom webinars  
- **Personal**: In user's personal Zoom space
- **Admin**: In admin dashboard

### 2.3 Embed
Configure embedded app behavior:
- **Embedded App URL**: URL where your app is hosted
- **Dimensions**: Width and height specifications
- **Responsive**: Enable responsive design support

### 2.4 Connect
Set up external connections:
- **External URLs**: Allowed domains for external links
- **Deep Links**: Custom URL schemes for app navigation
- **API Endpoints**: External API connections your app uses

## Step 3: Scopes Configuration

Define the permissions your app requires to access Zoom APIs.

### 3.1 OAuth Scopes
Select the minimum required scopes for your app functionality:

#### Meeting Scopes
- `meeting:read`: Read meeting details
- `meeting:write`: Create and update meetings
- `meeting:read:admin`: Admin-level meeting read access
- `meeting:write:admin`: Admin-level meeting write access

#### User Scopes
- `user:read`: Read user profile information
- `user:write`: Update user profile information
- `user:read:admin`: Admin-level user read access

#### Account Scopes
- `account:read:admin`: Read account information
- `account:write:admin`: Update account settings

#### Recording Scopes
- `recording:read`: Access meeting recordings
- `recording:write`: Manage meeting recordings

### 3.2 Scope Justification
For each selected scope, provide:
- **Business Justification**: Why this permission is needed
- **Use Case Description**: How the permission will be used
- **Data Handling**: How you'll protect accessed data

## Step 4: Actions Configuration

Set up event subscriptions and webhook notifications.

### 4.1 Event Subscriptions
Enable real-time event notifications:
- **Event Notification Endpoint URL**: Your webhook receiver URL
  - Format: `https://yourdomain.com/api/webhooks/zoom`
- **Verification Token**: For webhook security validation

### 4.2 Supported Events
Select events your app needs to monitor:

#### Meeting Events
- `meeting.created`: New meeting scheduled
- `meeting.started`: Meeting has begun
- `meeting.ended`: Meeting has concluded
- `meeting.participant_joined`: User joined meeting
- `meeting.participant_left`: User left meeting

#### Recording Events
- `recording.completed`: Recording processing finished
- `recording.transcript_completed`: Transcript generation finished

#### User Events
- `user.created`: New user added to account
- `user.updated`: User information changed
- `user.deactivated`: User account deactivated

### 4.3 Webhook Security
- **Verification Token**: Use provided token to verify webhook authenticity
- **Request Signing**: Implement signature verification for enhanced security
- **HTTPS Required**: All webhook endpoints must use HTTPS

## Step 5: Environment Variables Setup

Configure your application with the obtained credentials.

### 5.1 Required Environment Variables
```bash
# Zoom OAuth Configuration
ZOOM_CLIENT_ID=your_client_id_here
ZOOM_CLIENT_SECRET=your_client_secret_here
ZOOM_REDIRECT_URI=https://yourdomain.com/api/integrations/zoom/callback
ZOOM_WEBHOOK_SECRET_TOKEN=your_webhook_verification_token

# Application URLs
FRONTEND_URL=https://yourdomain.com
BACKEND_URL=https://api.yourdomain.com
```

### 5.2 Security Considerations
- Store credentials in secure environment variables
- Never commit secrets to version control
- Use different credentials for development and production
- Implement credential rotation policies
- Monitor for credential exposure

## Step 6: Database Schema Verification

Ensure your database supports Zoom integration data storage.

### 6.1 Required Tables/Fields
```sql
-- Agent integrations table
CREATE TABLE agent_integrations (
    id SERIAL PRIMARY KEY,
    agent_id INTEGER REFERENCES agents(id),
    zoom_access_token TEXT,
    zoom_refresh_token TEXT,
    zoom_token_expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Zoom meetings table (optional)
CREATE TABLE zoom_meetings (
    id SERIAL PRIMARY KEY,
    meeting_id VARCHAR(255) UNIQUE,
    host_id VARCHAR(255),
    topic VARCHAR(500),
    start_time TIMESTAMP,
    duration INTEGER,
    join_url TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);
```

## Step 7: SSL/HTTPS Configuration

### 7.1 SSL Certificate Requirements
- Valid SSL certificate for your domain
- Certificate must be trusted by major certificate authorities
- Support for TLS 1.2 or higher
- Proper certificate chain configuration

### 7.2 HTTPS Enforcement
```nginx
# Example Nginx configuration
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;
    
    ssl_certificate /path/to/certificate.crt;
    ssl_certificate_key /path/to/private.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    
    location /api/ {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Step 8: CORS Configuration

Configure Cross-Origin Resource Sharing for your application.

```javascript
// Express.js CORS configuration
const corsOptions = {
    origin: [
        'https://yourdomain.com',
        'https://zoom.us',
        'https://marketplace.zoom.us'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
```

## Step 9: App Listing

Prepare your app for marketplace publication.

### 9.1 App Store Information
- **Category**: Select appropriate app category
- **Tags**: Relevant keywords for discoverability
- **Screenshots**: High-quality app screenshots (minimum 3)
- **Demo Video**: Optional but recommended walkthrough video

### 9.2 Legal Information
- **Privacy Policy URL**: Link to your privacy policy
- **Terms of Service URL**: Link to your terms of service
- **Support URL**: Customer support contact information
- **Documentation URL**: Link to user documentation

### 9.3 App Description Enhancement
- **Key Features**: Bullet points of main functionality
- **Benefits**: Clear value proposition for users
- **Use Cases**: Specific scenarios where app adds value
- **Integration Details**: How app works with Zoom

## Step 10: Monetization (Optional)

Configure pricing if your app is not free.

### 10.1 Pricing Models
- **Free**: No cost to users
- **Freemium**: Basic features free, premium features paid
- **Subscription**: Monthly/yearly recurring payments
- **One-time Purchase**: Single payment for lifetime access

### 10.2 Pricing Configuration
- **Price Tiers**: Different feature levels with corresponding prices
- **Trial Periods**: Free trial duration for paid apps
- **Payment Processing**: Integration with payment providers
- **Billing Management**: Subscription lifecycle handling

## Step 11: Technical Design Document

Prepare comprehensive technical documentation for Zoom's security review.

### 11.1 Architecture Overview
- **System Architecture Diagram**: Visual representation of your app's structure
- **Data Flow Diagrams**: How data moves through your system
- **Integration Points**: Where and how your app connects to Zoom
- **Third-party Dependencies**: External services your app uses

### 11.2 Security Implementation
- **Authentication Methods**: How users authenticate with your app
- **Data Encryption**: Encryption at rest and in transit
- **Access Controls**: User permission and role management
- **Audit Logging**: Security event tracking and monitoring

### 11.3 Data Handling
- **Data Collection**: What data your app collects from Zoom
- **Data Storage**: Where and how data is stored
- **Data Retention**: How long data is kept
- **Data Deletion**: Process for removing user data

### 11.4 Compliance
- **GDPR Compliance**: European data protection compliance
- **CCPA Compliance**: California privacy law compliance
- **SOC 2**: Security controls documentation
- **Industry Standards**: Relevant compliance certifications

## Step 12: Production Deployment Checklist

### 12.1 Pre-Deployment
- [ ] Environment variables configured
- [ ] SSL certificates installed and verified
- [ ] Database schema deployed
- [ ] CORS configuration updated
- [ ] Webhook endpoints tested
- [ ] OAuth flow tested end-to-end

### 12.2 Deployment
- [ ] Application deployed to production servers
- [ ] Load balancer configured (if applicable)
- [ ] Monitoring and logging enabled
- [ ] Backup systems verified
- [ ] Health checks implemented

### 12.3 Post-Deployment Testing
- [ ] OAuth authentication flow
- [ ] API endpoint functionality
- [ ] Webhook event reception
- [ ] Error handling and logging
- [ ] Performance under load

## Step 13: Testing Production Integration

### 13.1 Test OAuth Flow
1. Navigate to your production app
2. Click "Connect to Zoom"
3. Complete OAuth authorization
4. Verify token storage and refresh

### 13.2 Test Meeting Creation
1. Create a test meeting through your app
2. Verify meeting appears in Zoom account
3. Test meeting join functionality
4. Confirm meeting details accuracy

### 13.3 API Endpoint Testing
```bash
# Test OAuth callback endpoint
curl -X POST https://yourdomain.com/api/integrations/zoom/callback \
  -H "Content-Type: application/json" \
  -d '{"code":"test_code","state":"test_state"}'

# Test meeting creation endpoint
curl -X POST https://yourdomain.com/api/leads/123/create-zoom-meeting \
  -H "Authorization: Bearer your_jwt_token" \
  -H "Content-Type: application/json" \
  -d '{"topic":"Test Meeting","start_time":"2024-01-15T10:00:00Z"}'
```

## Step 14: App Submission and Review

### 14.1 Submission Process
1. Complete all required sections in the app configuration
2. Upload Technical Design Document
3. Provide test credentials for Zoom review team
4. Submit app for review

### 14.2 Review Process
- **Initial Review**: Zoom team validates app configuration
- **Security Review**: Technical design and security assessment
- **Functional Testing**: End-to-end app functionality testing
- **Compliance Check**: Legal and privacy policy verification

### 14.3 Review Timeline
- Initial review: 3-5 business days
- Security review: 5-10 business days
- Total process: 1-3 weeks depending on complexity

## Step 15: Monitoring and Maintenance

### 15.1 Application Monitoring
- **API Rate Limits**: Monitor Zoom API usage
- **Error Rates**: Track integration failures
- **Performance Metrics**: Response times and throughput
- **User Activity**: OAuth flows and feature usage

### 15.2 Token Management
- **Token Refresh**: Implement automatic token renewal
- **Token Expiration**: Handle expired token scenarios
- **Token Revocation**: Process for handling revoked access

### 15.3 Webhook Monitoring
- **Event Reception**: Verify webhook events are received
- **Processing Failures**: Handle webhook processing errors
- **Retry Logic**: Implement exponential backoff for failures

## Security Best Practices

### Data Protection
- Encrypt sensitive data at rest and in transit
- Implement proper access controls and authentication
- Regular security audits and vulnerability assessments
- Secure credential storage and rotation

### API Security
- Validate all incoming webhook requests
- Implement rate limiting and request throttling
- Use HTTPS for all API communications
- Sanitize and validate all input data

### Compliance
- Maintain GDPR and CCPA compliance
- Implement data retention and deletion policies
- Provide clear privacy policies and terms of service
- Regular compliance audits and updates

## Troubleshooting Common Issues

### OAuth Issues
- **Invalid Redirect URI**: Ensure redirect URL matches exactly
- **Scope Permissions**: Verify all required scopes are approved
- **Token Expiration**: Implement proper token refresh logic

### Webhook Issues
- **Verification Failures**: Check webhook verification token
- **HTTPS Requirements**: Ensure webhook endpoint uses HTTPS
- **Response Timeouts**: Webhook endpoints must respond within 3 seconds

### API Errors
- **Rate Limiting**: Implement exponential backoff for rate limits
- **Authentication Errors**: Verify token validity and refresh as needed
- **Permission Errors**: Ensure user has required permissions

## Rollback Plan

### Emergency Rollback
1. **Disable Integration**: Remove Zoom integration from user interface
2. **Revert Database**: Rollback database changes if necessary
3. **Restore Previous Version**: Deploy previous stable version
4. **Notify Users**: Communicate any service disruptions

### Gradual Rollback
1. **Feature Flags**: Use feature flags to disable Zoom features
2. **User Communication**: Notify affected users of changes
3. **Data Migration**: Safely migrate any affected data
4. **Monitor Impact**: Track rollback effects on system performance

---

## Support and Resources

- **Zoom Developer Documentation**: https://developers.zoom.us/
- **Zoom Developer Forum**: https://devforum.zoom.us/
- **Zoom App Marketplace**: https://marketplace.zoom.us/
- **Security Review Contact**: marketplace.security@zoom.us

This guide provides a comprehensive roadmap for creating, configuring, and deploying a production-ready Zoom app integration. Follow each step carefully and test thoroughly before submitting for marketplace review.