# Facebook Ads Integration Guide

## Overview

This integration allows you to programmatically create and manage Facebook ad campaigns directly from your lead automation system. It uses the Facebook Business SDK to interact with the Facebook Marketing API.

## Features

✅ **Campaign Creation**: Create new Facebook ad campaigns with custom settings
✅ **Campaign Management**: List, update, and manage existing campaigns
✅ **Quick Lead Generation**: One-click creation of lead generation campaigns
✅ **Status Management**: Activate, pause, or delete campaigns
✅ **Performance Insights**: Get campaign performance data and metrics
✅ **Web Interface**: User-friendly dashboard for campaign management
✅ **API Endpoints**: RESTful API for programmatic access

## Setup Requirements

### 1. Facebook Developer Account
- Create a Facebook Developer account at [developers.facebook.com](https://developers.facebook.com)
- Create a new Facebook App
- Add the Marketing API product to your app

### 2. Required Permissions
Your Facebook app needs these permissions:
- `ads_management`: Create and manage ads
- `ads_read`: Read ad account data
- `pages_read_engagement`: Read page data
- `leads_retrieval`: Access lead data (for webhook integration)

### 3. Environment Variables
Add these to your `.env` file:

```env
# Facebook Ads Configuration
FACEBOOK_ACCESS_TOKEN=your_facebook_access_token
FACEBOOK_AD_ACCOUNT_ID=act_your_ad_account_id
FACEBOOK_APP_SECRET=your_app_secret
FACEBOOK_VERIFY_TOKEN=your_webhook_verify_token
```

## API Endpoints

### Base URL: `http://localhost:3001/api/facebook-ads`

#### 1. Create Campaign
```http
POST /campaigns
Content-Type: application/json

{
  "name": "My Lead Generation Campaign",
  "objective": "OUTCOME_LEADS",
  "status": "PAUSED",
  "specialAdCategories": []
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "120232391460010412",
    "name": "My Lead Generation Campaign",
    "objective": "OUTCOME_LEADS",
    "status": "PAUSED",
    "created_at": "2025-01-13T13:05:43.357Z"
  },
  "message": "Campaign created successfully"
}
```

#### 2. List Campaigns
```http
GET /campaigns
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "120232391460010412",
      "name": "My Lead Generation Campaign",
      "objective": "OUTCOME_LEADS",
      "status": "PAUSED",
      "created_time": "2025-01-13T13:05:43+0100",
      "updated_time": "2025-01-13T13:05:43+0100"
    }
  ],
  "count": 1
}
```

#### 3. Quick Create Lead Generation Campaign
```http
POST /campaigns/quick-create
Content-Type: application/json

{
  "name": "Auto Lead Gen Test",
  "budget": 50
}
```

#### 4. Update Campaign Status
```http
PUT /campaigns/{campaignId}/status
Content-Type: application/json

{
  "status": "ACTIVE"
}
```

**Valid statuses:** `ACTIVE`, `PAUSED`, `DELETED`

#### 5. Get Campaign Insights
```http
GET /campaigns/{campaignId}/insights
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "impressions": "1000",
      "clicks": "50",
      "spend": "25.00",
      "cpm": "25.00",
      "cpc": "0.50",
      "ctr": "5.00",
      "reach": "800"
    }
  ]
}
```

## Web Interface

### Accessing the Dashboard
1. Navigate to `http://localhost:3000/campaigns`
2. Login with your credentials
3. Use the campaign management interface

### Features
- **Quick Create**: One-click lead generation campaign creation
- **Custom Create**: Full campaign creation with custom settings
- **Campaign List**: View all your campaigns with status indicators
- **Status Management**: Activate/pause campaigns with one click
- **Real-time Updates**: Automatic refresh after actions

## Campaign Objectives

| Objective | Description | Best For |
|-----------|-------------|----------|
| `OUTCOME_LEADS` | Lead Generation | Collecting contact information |
| `OUTCOME_TRAFFIC` | Website Traffic | Driving visitors to your site |
| `OUTCOME_ENGAGEMENT` | Engagement | Likes, comments, shares |
| `OUTCOME_AWARENESS` | Brand Awareness | Increasing brand visibility |

## Testing

### Run the Test Script
```bash
# Make the script executable
chmod +x test-facebook-ads.sh

# Run the tests
./test-facebook-ads.sh
```

### Manual Testing with cURL

**Create a campaign:**
```bash
curl -X POST http://localhost:3001/api/facebook-ads/campaigns \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Campaign",
    "objective": "OUTCOME_LEADS",
    "status": "PAUSED"
  }'
```

**List campaigns:**
```bash
curl -X GET http://localhost:3001/api/facebook-ads/campaigns
```

## Integration with Lead Automation

### Workflow Integration
1. **Lead Received**: Webhook processes new lead
2. **Campaign Creation**: Automatically create campaigns for high-value leads
3. **Performance Tracking**: Monitor campaign performance
4. **Lead Attribution**: Connect leads back to specific campaigns

### Example: Auto-Create Campaign for High-Value Leads
```javascript
// In your lead processing service
if (lead.value > 1000) {
  await facebookAdsService.createCampaign({
    name: `High Value Lead - ${lead.company}`,
    objective: 'OUTCOME_LEADS',
    status: 'PAUSED' // Review before activating
  });
}
```

## Error Handling

### Common Errors

1. **Invalid Access Token**
   ```json
   {
     "success": false,
     "error": "Facebook Ads API not initialized"
   }
   ```
   **Solution**: Check your `FACEBOOK_ACCESS_TOKEN` in `.env`

2. **Missing Ad Account ID**
   ```json
   {
     "success": false,
     "error": "Facebook Ad Account ID not found in environment variables"
   }
   ```
   **Solution**: Add `FACEBOOK_AD_ACCOUNT_ID` to `.env`

3. **Campaign Name Required**
   ```json
   {
     "success": false,
     "error": "Campaign name is required"
   }
   ```
   **Solution**: Provide a campaign name in your request

### Debug Mode
Set `NODE_ENV=development` to enable debug logging:
```env
NODE_ENV=development
```

## Security Best Practices

1. **Environment Variables**: Never commit access tokens to version control
2. **Token Rotation**: Regularly rotate your Facebook access tokens
3. **Permissions**: Use minimal required permissions
4. **Rate Limiting**: Implement rate limiting for API calls
5. **Validation**: Always validate input data before API calls

## Troubleshooting

### Facebook API Issues
1. **Check Token Validity**: Use Facebook's Graph API Explorer
2. **Verify Permissions**: Ensure your app has required permissions
3. **Account Status**: Check if your ad account is active
4. **Rate Limits**: Facebook has rate limits on API calls

### Application Issues
1. **Check Logs**: Review `logs/combined.log` for errors
2. **Environment**: Verify all environment variables are set
3. **Dependencies**: Ensure `facebook-nodejs-business-sdk` is installed
4. **Network**: Check connectivity to Facebook's API

## Next Steps

1. **Ad Sets**: Extend integration to create ad sets
2. **Ads**: Add functionality to create individual ads
3. **Targeting**: Implement audience targeting options
4. **Budgets**: Add budget management features
5. **Reporting**: Enhanced reporting and analytics
6. **Automation**: Automated campaign optimization

## Support

For issues with:
- **Facebook API**: Check [Facebook Developer Documentation](https://developers.facebook.com/docs/marketing-api/)
- **Integration Code**: Review the service files in `/src/services/` and `/src/routes/`
- **Testing**: Use the provided test script and check logs

---

**Note**: This integration creates campaigns in your Facebook ad account. Always review campaigns before activating them to avoid unexpected charges.