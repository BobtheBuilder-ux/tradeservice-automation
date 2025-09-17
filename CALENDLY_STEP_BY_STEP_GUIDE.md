# Complete Calendly Integration Setup Guide

This is a detailed step-by-step guide to set up Calendly webhook integration with your automation system.

## 📋 Prerequisites

Before starting, ensure you have:
- ✅ A Calendly account (Pro plan or higher for webhooks)
- ✅ Your backend server running on Render: `https://tradeservice-automation.onrender.com`
- ✅ Access to your Calendly Developer Dashboard

## 🔧 Step 1: Create Calendly OAuth App

### 1.1 Access Developer Dashboard
1. Go to [Calendly Developer Portal](https://developer.calendly.com/)
2. Sign in with your Calendly account
3. Click **"Create App"** or **"My Apps"**

### 1.2 Create New App
1. Click **"Create New App"**
2. Fill in the details:
   - **App Name**: `Trade Services Automation`
   - **Description**: `Automated lead management and email workflows`
   - **Redirect URI**: `https://tradeservice-automation.onrender.com/auth/calendly/callback`
   - **Webhook URL**: `https://tradeservice-automation.onrender.com/webhook/calendly`

### 1.3 Get Your Credentials
After creating the app, you'll see:
- **Client ID**: `_NJJ75amAP1sJJnkAQw7k_3XRXAM-nTQuGcXJ27moXk` ✅ (Already configured)
- **Client Secret**: `1EqfuUBljxYbTmpbBR_FB_K9WYAFyMVGKUwfpmNVc8A` ✅ (Already configured)
- **Webhook Signing Key**: `tLRF8vcfdLQi1_gHqZ-RTaeBe5JvaYRtFsJ5zm2haeU` ✅ (Already configured)

## 🔐 Step 2: Configure Webhook Settings

### 2.1 Access Webhook Configuration
1. In your Calendly app dashboard, find **"Webhooks"** section
2. Click **"Add Webhook"** or **"Configure Webhooks"**

### 2.2 Set Webhook URL
```
https://tradeservice-automation.onrender.com/webhook/calendly
```

### 2.3 Select Events to Subscribe
Check these events:
- ✅ **invitee.created** - When someone books a meeting
- ✅ **invitee.canceled** - When someone cancels a meeting
- ✅ **invitee_no_show.created** - When someone doesn't show up
- ✅ **invitee.rescheduled** - When someone reschedules

### 2.4 Set Signing Key
Use this signing key for webhook verification:
```
tLRF8vcfdLQi1_gHqZ-RTaeBe5JvaYRtFsJ5zm2haeU
```

## 🎯 Step 3: Configure Event Types

### 3.1 Access Event Types
1. Go to your main Calendly dashboard
2. Click **"Event Types"**
3. Select the event type you want to integrate

### 3.2 Enable Webhooks for Event Type
1. Click **"Edit"** on your event type
2. Go to **"Advanced"** or **"Integrations"** tab
3. Enable **"Webhooks"** if available
4. Save changes

## 🧪 Step 4: Test the Integration

### 4.1 Test Webhook Endpoint
Run this command to test your webhook:

```bash
curl -X POST https://tradeservice-automation.onrender.com/webhook/calendly/test \
  -H "Content-Type: application/json" \
  -H "User-Agent: Calendly-Webhook" \
  -d '{
    "eventData": {
      "event": "invitee.created",
      "payload": {
        "event": {
          "uri": "https://api.calendly.com/scheduled_events/test123",
          "name": "Test Meeting",
          "start_time": "2024-01-20T10:00:00Z",
          "end_time": "2024-01-20T10:30:00Z"
        },
        "invitee": {
          "email": "test@example.com",
          "name": "Test User"
        }
      }
    }
  }'
```

### 4.2 Expected Response
You should see:
```json
{
  "success": true,
  "trackingId": "unique-tracking-id",
  "processed": true,
  "errors": []
}
```

### 4.3 Test Real Booking
1. Create a test booking on your Calendly page
2. Check your server logs for webhook processing
3. Verify email workflows are triggered

## 📧 Step 5: Verify Email Integration

### 5.1 Check Email Queue
After a test booking, check if emails are queued:
```bash
curl https://tradeservice-automation.onrender.com/api/admin/email-queue
```

### 5.2 Monitor Email Processing
Check the email processor status:
```bash
curl https://tradeservice-automation.onrender.com/api/admin/email-processor/status
```

## 🔍 Step 6: Monitor and Debug

### 6.1 Check Server Logs
Monitor your Render deployment logs for:
- Webhook events received
- Email processing
- Any errors or warnings

### 6.2 Common Issues and Solutions

#### Issue: Webhook not receiving events
**Solution:**
1. Verify webhook URL is correct
2. Check if your server is accessible from internet
3. Ensure HTTPS is working
4. Verify webhook is active in Calendly

#### Issue: Signature verification failed
**Solution:**
1. Check webhook signing key matches
2. Verify environment variables are set correctly
3. Ensure request body is not modified

#### Issue: Emails not sending
**Solution:**
1. Check email queue processor is running
2. Verify SMTP configuration
3. Check email templates exist

## 🚀 Step 7: Production Checklist

### 7.1 Security Verification
- ✅ Webhook signature verification enabled
- ✅ Rate limiting configured
- ✅ HTTPS enforced
- ✅ Environment variables secured

### 7.2 Monitoring Setup
- ✅ Server health monitoring
- ✅ Email queue monitoring
- ✅ Error alerting
- ✅ Performance tracking

### 7.3 Testing Completed
- ✅ Webhook endpoint responds correctly
- ✅ Meeting creation works
- ✅ Email workflows trigger
- ✅ Database updates properly

## 📱 Step 8: What Happens When Someone Books

Here's the complete flow when someone books a meeting:

1. **Customer books meeting** on your Calendly page
2. **Calendly sends webhook** to your server
3. **Server processes event** and creates meeting record
4. **Email workflows triggered** automatically:
   - Confirmation email to customer
   - Notification to your team
   - Reminder emails scheduled
5. **Lead updated** in your CRM system
6. **Follow-up automation** begins

## 🎯 Step 9: Customization Options

### 9.1 Email Templates
Customize email templates in:
- `/backend/src/services/email-template-service.js`

### 9.2 Workflow Rules
Modify automation rules in:
- `/backend/src/services/automated-email-workflow-service.js`

### 9.3 Meeting Types
Add custom meeting types in:
- `/backend/src/services/meeting-service.js`

## 🆘 Step 10: Getting Help

### 10.1 Debug Commands
```bash
# Test webhook
curl -X POST https://tradeservice-automation.onrender.com/webhook/calendly/test

# Check server health
curl https://tradeservice-automation.onrender.com/webhook/calendly/health

# Monitor email queue
curl https://tradeservice-automation.onrender.com/api/admin/email-queue
```

### 10.2 Log Analysis
Check these log patterns:
- `calendly_webhook_processing` - Webhook events
- `email_queue_processing` - Email sending
- `meeting_creation` - Meeting records

## ✅ Completion Checklist

- [ ] Calendly OAuth app created
- [ ] Webhook URL configured
- [ ] Event subscriptions enabled
- [ ] Signing key set
- [ ] Test webhook successful
- [ ] Real booking test completed
- [ ] Email workflows verified
- [ ] Monitoring setup
- [ ] Production deployment confirmed

---

## 🎉 You're All Set!

Your Calendly integration is now fully configured and ready to:
- ✅ Automatically process meeting bookings
- ✅ Send confirmation and reminder emails
- ✅ Update your CRM with new leads
- ✅ Trigger follow-up automation workflows
- ✅ Handle cancellations and reschedules

**Next Steps:**
1. Share your Calendly booking link with customers
2. Monitor the first few bookings to ensure everything works
3. Customize email templates as needed
4. Set up additional automation rules

**Your Calendly booking page:** `https://calendly.com/your-username/meeting-type`
**Your webhook endpoint:** `https://tradeservice-automation.onrender.com/webhook/calendly`

Everything is automated from here! 🚀