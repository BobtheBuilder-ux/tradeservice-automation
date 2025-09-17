# Calendly API Webhook Setup Guide

Since you have the **Calendly Standard plan**, you can use webhooks but must register them through the API (no GUI available). This guide walks you through the complete setup process.

## Prerequisites
- ✅ Calendly Standard plan (or higher)
- ✅ Backend system running at `https://tradeservice-automation.onrender.com`
- ✅ Webhook endpoint configured at `/webhook/calendly`

## Step 1: Get Your Personal Access Token

1. **Login to Calendly**
2. **Navigate to**: Account Settings → Integrations → **API & Webhooks**
3. **Click**: "Generate new token" or "Create a token"
4. **Copy the token** - it looks like:
   ```
   eyJraWQiOiIxY2UxZTEzNjE3ZGNmNzY2YjNjZWJjY2Y4ZGM1YmFmYThhNjVlNjg0MDIzZjdjMzJiZTgzNDliMjM4MDEzNWI0IiwidHlwIjoiUEFUIiwiYWxnIjoiRVMyNTYifQ...
   ```

⚠️ **Important**: Save this token securely - you won't be able to see it again!

## Step 2: Get Your Organization URI

Run this command to get your organization information:

```bash
curl --request GET \
  --url https://api.calendly.com/users/me \
  --header "Authorization: Bearer YOUR_PERSONAL_ACCESS_TOKEN" \
  --header "Content-Type: application/json"
```

**Expected Response:**
```json
{
  "resource": {
    "uri": "https://api.calendly.com/users/099413f1-1cd0-4e92-91c7-4b20fdcf86bf",
    "name": "Your Name",
    "slug": "your-slug",
    "email": "your-email@example.com",
    "scheduling_url": "https://calendly.com/your-slug",
    "timezone": "America/New_York",
    "avatar_url": "https://...",
    "created_at": "2024-01-01T00:00:00.000000Z",
    "updated_at": "2024-01-01T00:00:00.000000Z",
    "current_organization": "https://api.calendly.com/organizations/YOUR_ORG_ID"
  }
}
```

**Copy the `current_organization` URL** - you'll need it for the next step.

## Step 3: Register Your Webhook

Use this command to register your webhook:

```bash
curl --request POST \
  --url https://api.calendly.com/webhook_subscriptions \
  --header "Authorization: Bearer YOUR_PERSONAL_ACCESS_TOKEN" \
  --header "Content-Type: application/json" \
  --data '{
    "url": "https://tradeservice-automation.onrender.com/webhook/calendly",
    "events": ["invitee.created", "invitee.canceled"],
    "organization": "https://api.calendly.com/organizations/YOUR_ORG_ID",
    "scope": "organization",
    "signing_key": true
  }'
```

**Replace:**
- `YOUR_PERSONAL_ACCESS_TOKEN` with your actual token
- `YOUR_ORG_ID` with your organization ID from Step 2

**Expected Success Response:**
```json
{
  "resource": {
    "uri": "https://api.calendly.com/webhook_subscriptions/WEBHOOK_ID",
    "callback_url": "https://tradeservice-automation.onrender.com/webhook/calendly",
    "created_at": "2024-01-01T00:00:00.000000Z",
    "updated_at": "2024-01-01T00:00:00.000000Z",
    "retry_started_at": null,
    "state": "active",
    "events": ["invitee.created", "invitee.canceled"],
    "scope": "organization",
    "organization": "https://api.calendly.com/organizations/YOUR_ORG_ID",
    "user": null,
    "creator": "https://api.calendly.com/users/YOUR_USER_ID",
    "signing_key": "whr_1234567890abcdef"
  }
}
```

**Important**: Save the `signing_key` - you'll need it to verify webhook signatures!

## Step 4: Update Your Environment Variables

Add these to your `/backend/.env` file:

```env
# Calendly API Configuration
CALENDLY_PERSONAL_ACCESS_TOKEN=YOUR_PERSONAL_ACCESS_TOKEN
CALENDLY_ORGANIZATION_URI=https://api.calendly.com/organizations/YOUR_ORG_ID
CALENDLY_WEBHOOK_SIGNING_KEY=whr_1234567890abcdef

# Keep existing webhook secret for signature verification
CALENDLY_WEBHOOK_SECRET=1EqfuUBljxYbTmpbBR_FB_K9WYAFyMVGKUwfpmNVc8A
```

## Step 5: Test Your Webhook

### 5.1 Check Webhook Status
```bash
curl --request GET \
  --url https://api.calendly.com/webhook_subscriptions \
  --header "Authorization: Bearer YOUR_PERSONAL_ACCESS_TOKEN" \
  --header "Content-Type: application/json"
```

### 5.2 Test with a Real Booking
1. **Create a test event** in your Calendly account
2. **Book the event** using your public Calendly link
3. **Check your backend logs** for incoming webhook data
4. **Verify** the email automation triggers

### 5.3 Test Webhook Endpoint
```bash
curl -X POST https://tradeservice-automation.onrender.com/webhook/calendly \
  -H "Content-Type: application/json" \
  -H "Calendly-Webhook-Signature: test" \
  -d '{
    "created_at": "2024-01-01T00:00:00.000000Z",
    "created_by": "https://api.calendly.com/users/test",
    "event": "invitee.created",
    "payload": {
      "event": {
        "uri": "https://api.calendly.com/scheduled_events/test",
        "name": "Test Meeting",
        "start_time": "2024-01-01T10:00:00.000000Z",
        "end_time": "2024-01-01T11:00:00.000000Z"
      },
      "invitee": {
        "uri": "https://api.calendly.com/scheduled_events/test/invitees/test",
        "name": "Test User",
        "email": "test@example.com"
      }
    }
  }'
```

## Troubleshooting

### Common Issues

**1. "Unauthenticated" Error**
- Check your personal access token is correct
- Ensure the token hasn't expired
- Verify the `Authorization: Bearer` header format

**2. "Organization not found"**
- Double-check your organization URI from Step 2
- Ensure you're using the full URI, not just the ID

**3. "Webhook URL not reachable"**
- Verify your backend is running and accessible
- Check the webhook endpoint responds to POST requests
- Ensure HTTPS is properly configured

**4. "Invalid signing key"**
- Use the signing key returned from the webhook registration
- Don't confuse it with the webhook secret in your .env

### Webhook Events

Your webhook will receive these events:
- `invitee.created` - When someone books a meeting
- `invitee.canceled` - When someone cancels a meeting

### Signature Verification

Calendly signs webhooks with the `signing_key`. Your backend should verify signatures using:
```javascript
const crypto = require('crypto');

function verifySignature(payload, signature, signingKey) {
  const expectedSignature = crypto
    .createHmac('sha256', signingKey)
    .update(payload)
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}
```

## Next Steps

1. ✅ **Complete the API setup** following steps 1-4
2. ✅ **Test the webhook** with a real booking
3. ✅ **Monitor the logs** to ensure events are processed
4. ✅ **Verify email automation** triggers correctly

## Support

If you encounter issues:
- Check the [Calendly API Documentation](https://developer.calendly.com/)
- Review your backend logs for error messages
- Verify your webhook endpoint is accessible from the internet

---

**Your webhook endpoint**: `https://tradeservice-automation.onrender.com/webhook/calendly`
**Status**: Ready for API registration ✅