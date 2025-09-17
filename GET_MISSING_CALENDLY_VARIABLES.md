# Get Missing Calendly Variables Guide

This guide will help you obtain the missing Calendly configuration variables for your .env file.

## Current Status

✅ **Already Configured:**
- `CALENDLY_PERSONAL_ACCESS_TOKEN` - ✅ Set
- `CALENDLY_ORGANIZATION_URI` - ✅ Set

❌ **Missing Variables:**
- `CALENDLY_WEBHOOK_SECRET`
- `CALENDLY_API_TOKEN` 
- `CALENDLY_ALLOWED_IPS`
- `CALENDLY_WEBHOOK_SIGNING_KEY`

## How to Get Missing Variables

### 1. CALENDLY_WEBHOOK_SECRET

**What it is:** A secret key used to verify that webhook requests are actually coming from Calendly.

**How to get it:**
1. Go to [Calendly Integrations](https://calendly.com/integrations)
2. Click on "API & Webhooks"
3. In the "Webhooks" section, you should see your registered webhook
4. Click on your webhook to view details
5. Copy the "Signing Secret" or "Webhook Secret"

**Alternative:** You can generate your own secret:
```bash
# Generate a random 32-character secret
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### 2. CALENDLY_API_TOKEN

**What it is:** OAuth API token for making authenticated API requests (different from Personal Access Token).

**How to get it:**
1. Go to [Calendly Developer Portal](https://developer.calendly.com/)
2. Create an OAuth application if you haven't already
3. Follow the OAuth flow to get an access token
4. **Note:** For webhook purposes, your Personal Access Token should be sufficient

**For now:** You can use the same value as `CALENDLY_PERSONAL_ACCESS_TOKEN` or leave as placeholder if only using webhooks.

### 3. CALENDLY_ALLOWED_IPS

**What it is:** List of IP addresses that Calendly uses to send webhook requests.

**Current Calendly IP ranges:**
```
54.84.12.0/24
54.84.13.0/24
54.173.12.0/24
54.173.13.0/24
```

**Recommended value:**
```
CALENDLY_ALLOWED_IPS=54.84.12.0/24,54.84.13.0/24,54.173.12.0/24,54.173.13.0/24
```

### 4. CALENDLY_WEBHOOK_SIGNING_KEY

**What it is:** The signing key returned when you create a webhook subscription.

**How to get it:**
Since your webhook is already registered, you can:

1. **Check webhook details via API:**
```bash
cd /Users/Bobbieberry/automation/backend
node scripts/list-calendly-webhooks.js
```

2. **Re-register webhook to get signing key:**
   - Delete existing webhook
   - Re-run setup script with signing key generation

3. **Use existing webhook secret:**
   - Often the same as `CALENDLY_WEBHOOK_SECRET`
   - Check your Calendly dashboard for the signing key

## Quick Setup Commands

### Step 1: Update .env with known values
```bash
# Navigate to backend directory
cd /Users/Bobbieberry/automation/backend

# Update .env file with Calendly IPs
sed -i '' 's/CALENDLY_ALLOWED_IPS=calendly_ip1,calendly_ip2/CALENDLY_ALLOWED_IPS=54.84.12.0\/24,54.84.13.0\/24,54.173.12.0\/24,54.173.13.0\/24/' .env
```

### Step 2: Generate webhook secret (if needed)
```bash
# Generate a secure webhook secret
echo "CALENDLY_WEBHOOK_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")"
```

### Step 3: Check current webhook details
```bash
# List current webhooks to see if signing key is available
node scripts/list-calendly-webhooks.js
```

## Manual .env Updates Needed

Update your `.env` file with these values:

```env
# Replace with actual webhook secret from Calendly dashboard
CALENDLY_WEBHOOK_SECRET=your_actual_webhook_secret_here

# Can use Personal Access Token for now
CALENDLY_API_TOKEN=eyJraWQiOiIxY2UxZTEzNjE3ZGNmNzY2YjNjZWJjY2Y4ZGM1YmFmYThhNjVlNjg0MDIzZjdjMzJiZTgzNDliMjM4MDEzNWI0IiwidHlwIjoiUEFUIiwiYWxnIjoiRVMyNTYifQ.eyJpc3MiOiJodHRwczovL2F1dGguY2FsZW5kbHkuY29tIiwiaWF0IjoxNzU4MTI3MzcwLCJqdGkiOiI3ZGJlOWExMi0yYzdkLTQ4ZmUtODQ2ZC1mYjJkMWRkN2U1N2MiLCJ1c2VyX3V1aWQiOiIwOTk0MTNmMS0xY2QwLTRlOTItOTFjNy00YjIwZmRjZjg2YmYifQ.IRiJMoUM2qIN7v6ztW_uTRwluDbenS31WTvZIBTtmDtZKsWWOqFkwyBiQo_DD4f38QEAOgEZi_9vmHMbA_6ldg

# Calendly IP ranges
CALENDLY_ALLOWED_IPS=54.84.12.0/24,54.84.13.0/24,54.173.12.0/24,54.173.13.0/24

# Replace with actual signing key from webhook registration
CALENDLY_WEBHOOK_SIGNING_KEY=your_actual_signing_key_here
```

## Next Steps

1. **Get webhook secret from Calendly dashboard**
2. **Update .env file with actual values**
3. **Restart your backend server**
4. **Test webhook with a real booking**

## Troubleshooting

- **Can't find webhook secret?** Check your Calendly integrations page
- **Webhook not receiving events?** Verify IP allowlist and secret
- **Authentication errors?** Ensure Personal Access Token is valid

## Security Notes

- Never commit actual secrets to version control
- Use environment variables for all sensitive data
- Regularly rotate access tokens and secrets
- Verify webhook signatures to prevent spoofing