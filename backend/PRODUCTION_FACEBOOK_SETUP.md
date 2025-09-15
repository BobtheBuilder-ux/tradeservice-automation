# Production Facebook Ads Setup Guide

## Current Issue
The Facebook API is returning a permissions error: "Ad account owner has NOT grant ads_management or ads_read permission". This indicates the current access token doesn't have the required permissions for live ad management.

## Required Steps for Production Setup

### 1. Facebook App Configuration

#### Create/Update Facebook App
1. Go to [Facebook Developers](https://developers.facebook.com)
2. Navigate to your app or create a new one
3. Add the **Marketing API** product to your app
4. Configure the app for production use

#### Required App Permissions
Your Facebook app needs these permissions for live ad management:
- `ads_management` - Create, edit, and manage ads
- `ads_read` - Read ad account data and insights
- `pages_read_engagement` - Read page data
- `leads_retrieval` - Access lead data (for webhook integration)
- `business_management` - Manage business assets

### 2. Access Token Generation

#### For Production Use
1. **User Access Token**: Generate a long-lived user access token
   - Use Facebook's Graph API Explorer
   - Select your app and required permissions
   - Generate token and extend it to long-lived (60 days)

2. **System User Token** (Recommended for production):
   - Create a system user in Facebook Business Manager
   - Assign the system user to your ad account with admin permissions
   - Generate a system user access token (never expires)

### 3. Ad Account Setup

#### Verify Ad Account Access
1. Ensure the Facebook user/system user has admin access to the ad account
2. Verify the ad account ID format: `act_XXXXXXXXXX`
3. Test access using Facebook's Graph API Explorer

#### Business Manager Setup
1. Add your ad account to Facebook Business Manager
2. Assign proper roles and permissions
3. Connect your Facebook app to the business manager

### 4. Environment Configuration

Update your `.env` file with production credentials:

```env
# Facebook Production Configuration
FACEBOOK_APP_ID=your_production_app_id
FACEBOOK_APP_SECRET=your_production_app_secret
FACEBOOK_ACCESS_TOKEN=your_production_access_token
FACEBOOK_AD_ACCOUNT_ID=act_your_production_ad_account_id
FACEBOOK_VERIFY_TOKEN=your_webhook_verify_token

# Optional: For webhook integration
FACEBOOK_WEBHOOK_SECRET=your_webhook_secret
```

### 5. Testing Production Setup

#### Test API Connection
```bash
# Test basic connection
curl "https://graph.facebook.com/v19.0/me?access_token=YOUR_ACCESS_TOKEN"

# Test ad account access
curl "https://graph.facebook.com/v19.0/act_YOUR_AD_ACCOUNT_ID?fields=name,account_status&access_token=YOUR_ACCESS_TOKEN"

# Test campaign listing
curl "https://graph.facebook.com/v19.0/act_YOUR_AD_ACCOUNT_ID/campaigns?fields=id,name,status&access_token=YOUR_ACCESS_TOKEN"
```

#### Verify Permissions
```bash
# Check token permissions
curl "https://graph.facebook.com/v19.0/me/permissions?access_token=YOUR_ACCESS_TOKEN"
```

### 6. Security Best Practices

#### Token Management
- Use system user tokens for production (they don't expire)
- Store tokens securely (environment variables, not in code)
- Implement token refresh logic for user tokens
- Monitor token expiration and health

#### Access Control
- Use minimal required permissions
- Regularly audit app permissions
- Implement proper error handling for permission issues
- Set up monitoring for API rate limits

### 7. Common Issues and Solutions

#### Permission Errors
- **Error**: "Ad account owner has NOT grant ads_management permission"
- **Solution**: Ensure the token owner has admin access to the ad account

#### Token Expiration
- **Error**: "Invalid OAuth access token"
- **Solution**: Refresh or regenerate the access token

#### Rate Limiting
- **Error**: "Application request limit reached"
- **Solution**: Implement proper rate limiting and retry logic

### 8. Monitoring and Maintenance

#### Health Checks
- Monitor API response times and error rates
- Set up alerts for permission or authentication failures
- Track campaign performance and spending

#### Regular Maintenance
- Review and rotate access tokens quarterly
- Update app permissions as needed
- Monitor Facebook API version updates

## Next Steps

1. **Immediate**: Update Facebook app permissions and generate new production access token
2. **Short-term**: Implement proper error handling and token refresh logic
3. **Long-term**: Set up monitoring and automated token management

## Support Resources

- [Facebook Marketing API Documentation](https://developers.facebook.com/docs/marketing-api/)
- [Facebook Business Manager](https://business.facebook.com/)
- [Graph API Explorer](https://developers.facebook.com/tools/explorer/)
- [Facebook App Dashboard](https://developers.facebook.com/apps/)