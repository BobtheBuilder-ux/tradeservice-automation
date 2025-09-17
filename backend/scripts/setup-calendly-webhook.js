#!/usr/bin/env node

/**
 * Calendly Webhook Setup Script
 * 
 * This script helps you set up Calendly webhooks via the API.
 * Run with: node scripts/setup-calendly-webhook.js
 */

import dotenv from 'dotenv';
import fetch from 'node-fetch';
import { calendlyConfig } from '../src/config/index.js';

// Load environment variables
dotenv.config();

const CALENDLY_API_BASE = 'https://api.calendly.com';

/**
 * Get user information and organization URI
 */
async function getUserInfo(accessToken) {
  console.log('🔍 Getting user information...');
  
  try {
    const response = await fetch(`${CALENDLY_API_BASE}/users/me`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`HTTP ${response.status}: ${error}`);
    }

    const data = await response.json();
    console.log('✅ User info retrieved successfully');
    console.log(`📧 Email: ${data.resource.email}`);
    console.log(`👤 Name: ${data.resource.name}`);
    console.log(`🔗 Scheduling URL: ${data.resource.scheduling_url}`);
    console.log(`🏢 Organization: ${data.resource.current_organization}`);
    
    return data.resource;
  } catch (error) {
    console.error('❌ Failed to get user info:', error.message);
    throw error;
  }
}

/**
 * List existing webhook subscriptions
 */
async function listWebhooks(accessToken, organizationUri) {
  console.log('\n📋 Checking existing webhooks...');
  
  try {
    const url = new URL(`${CALENDLY_API_BASE}/webhook_subscriptions`);
    url.searchParams.append('organization', organizationUri);
    url.searchParams.append('scope', 'organization');
    
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`HTTP ${response.status}: ${error}`);
    }

    const data = await response.json();
    console.log(`✅ Found ${data.collection.length} existing webhook(s)`);
    
    if (data.collection.length > 0) {
      data.collection.forEach((webhook, index) => {
        console.log(`\n📌 Webhook ${index + 1}:`);
        console.log(`   URL: ${webhook.callback_url}`);
        console.log(`   Events: ${webhook.events.join(', ')}`);
        console.log(`   State: ${webhook.state}`);
        console.log(`   Created: ${webhook.created_at}`);
      });
    }
    
    return data.collection;
  } catch (error) {
    console.error('❌ Failed to list webhooks:', error.message);
    throw error;
  }
}

/**
 * Register a new webhook subscription
 */
async function registerWebhook(accessToken, organizationUri, webhookUrl) {
  console.log('\n🔗 Registering webhook...');
  console.log(`📍 URL: ${webhookUrl}`);
  console.log(`🏢 Organization: ${organizationUri}`);
  
  const webhookData = {
    url: webhookUrl,
    events: ['invitee.created', 'invitee.canceled'],
    organization: organizationUri,
    scope: 'organization'
  };

  try {
    const response = await fetch(`${CALENDLY_API_BASE}/webhook_subscriptions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(webhookData)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`HTTP ${response.status}: ${error}`);
    }

    const data = await response.json();
    console.log('✅ Webhook registered successfully!');
    console.log(`🆔 Webhook ID: ${data.resource.uri}`);
    console.log(`🔑 Signing Key: ${data.resource.signing_key}`);
    console.log(`📅 Events: ${data.resource.events.join(', ')}`);
    
    console.log('\n⚠️  IMPORTANT: Save this signing key to your .env file:');
    console.log(`CALENDLY_WEBHOOK_SIGNING_KEY=${data.resource.signing_key}`);
    
    return data.resource;
  } catch (error) {
    console.error('❌ Failed to register webhook:', error.message);
    throw error;
  }
}

/**
 * Test webhook endpoint
 */
async function testWebhookEndpoint(webhookUrl) {
  console.log('\n🧪 Testing webhook endpoint...');
  
  const testPayload = {
    created_at: new Date().toISOString(),
    created_by: 'https://api.calendly.com/users/test',
    event: 'invitee.created',
    payload: {
      event: {
        uri: 'https://api.calendly.com/scheduled_events/test',
        name: 'Test Meeting - Webhook Setup',
        start_time: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        end_time: new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString()
      },
      invitee: {
        uri: 'https://api.calendly.com/scheduled_events/test/invitees/test',
        name: 'Test User',
        email: 'test@example.com'
      }
    }
  };

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Calendly-Webhook-Signature': 'test-signature'
      },
      body: JSON.stringify(testPayload)
    });

    console.log(`📊 Response Status: ${response.status}`);
    
    if (response.ok) {
      console.log('✅ Webhook endpoint is responding!');
    } else {
      const error = await response.text();
      console.log(`⚠️  Webhook endpoint returned: ${error}`);
    }
    
    return response.ok;
  } catch (error) {
    console.error('❌ Failed to test webhook endpoint:', error.message);
    return false;
  }
}

/**
 * Main setup function
 */
async function main() {
  console.log('🚀 Calendly Webhook Setup Script');
  console.log('================================\n');

  // Check for required environment variables
  const accessToken = process.env.CALENDLY_PERSONAL_ACCESS_TOKEN;
  
  if (!accessToken || accessToken === 'your_personal_access_token_here') {
    console.error('❌ Missing CALENDLY_PERSONAL_ACCESS_TOKEN in .env file');
    console.log('\n📝 Please:');
    console.log('1. Get your Personal Access Token from Calendly');
    console.log('2. Add it to your .env file as CALENDLY_PERSONAL_ACCESS_TOKEN');
    console.log('3. Run this script again');
    process.exit(1);
  }

  const webhookUrl = 'https://tradeservice-automation.onrender.com/webhook/calendly';

  try {
    // Step 1: Get user info and organization URI
    const userInfo = await getUserInfo(accessToken);
    const organizationUri = userInfo.current_organization;

    // Step 2: List existing webhooks
    const existingWebhooks = await listWebhooks(accessToken, organizationUri);
    
    // Check if webhook already exists
    const existingWebhook = existingWebhooks.find(webhook => 
      webhook.callback_url === webhookUrl
    );

    if (existingWebhook) {
      console.log('\n⚠️  Webhook already exists for this URL!');
      console.log('🔑 Existing signing key:', existingWebhook.signing_key || 'Not available');
    } else {
      // Step 3: Register new webhook
      await registerWebhook(accessToken, organizationUri, webhookUrl);
    }

    // Step 4: Test webhook endpoint
    await testWebhookEndpoint(webhookUrl);

    console.log('\n🎉 Setup complete!');
    console.log('\n📋 Next steps:');
    console.log('1. Update your .env file with the signing key (if new)');
    console.log('2. Restart your backend server');
    console.log('3. Test with a real Calendly booking');
    console.log('4. Monitor your logs for incoming webhooks');

  } catch (error) {
    console.error('\n💥 Setup failed:', error.message);
    process.exit(1);
  }
}

// Run the script
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { getUserInfo, listWebhooks, registerWebhook, testWebhookEndpoint };