#!/usr/bin/env node

/**
 * Enable Calendly Webhook Script
 * 
 * This script enables a disabled Calendly webhook
 * Run with: node scripts/enable-calendly-webhook.js
 */

import dotenv from 'dotenv';
import fetch from 'node-fetch';

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
        console.log(`   ID: ${webhook.uri}`);
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
 * Delete a webhook subscription
 */
async function deleteWebhook(accessToken, webhookUri) {
  console.log(`\n🗑️ Deleting webhook: ${webhookUri}`);
  
  try {
    const response = await fetch(webhookUri, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`HTTP ${response.status}: ${error}`);
    }

    console.log('✅ Webhook deleted successfully!');
    return true;
  } catch (error) {
    console.error('❌ Failed to delete webhook:', error.message);
    throw error;
  }
}

/**
 * Register a new webhook subscription
 */
async function registerWebhook(accessToken, organizationUri, webhookUrl) {
  console.log('\n🔗 Registering new webhook...');
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
    console.log(`🟢 State: ${data.resource.state}`);
    
    console.log('\n⚠️  IMPORTANT: Save this signing key to your .env file:');
    console.log(`CALENDLY_WEBHOOK_SIGNING_KEY=${data.resource.signing_key}`);
    
    return data.resource;
  } catch (error) {
    console.error('❌ Failed to register webhook:', error.message);
    throw error;
  }
}

/**
 * Main function
 */
async function main() {
  console.log('🔄 Calendly Webhook Enable Script');
  console.log('=================================\n');

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
    
    // Find the disabled webhook
    const disabledWebhook = existingWebhooks.find(webhook => 
      webhook.callback_url === webhookUrl && webhook.state === 'disabled'
    );

    if (disabledWebhook) {
      console.log('\n⚠️  Found disabled webhook. Deleting and recreating...');
      
      // Delete the disabled webhook
      await deleteWebhook(accessToken, disabledWebhook.uri);
      
      // Register a new webhook
      await registerWebhook(accessToken, organizationUri, webhookUrl);
    } else {
      const activeWebhook = existingWebhooks.find(webhook => 
        webhook.callback_url === webhookUrl && webhook.state === 'active'
      );
      
      if (activeWebhook) {
        console.log('\n✅ Webhook is already active!');
        console.log(`🔑 Signing Key: ${activeWebhook.signing_key || 'Not available'}`);
      } else {
        console.log('\n❌ No webhook found for this URL. Creating new one...');
        await registerWebhook(accessToken, organizationUri, webhookUrl);
      }
    }

    console.log('\n🎉 Webhook enable complete!');
    console.log('\n📋 Next steps:');
    console.log('1. Verify the signing key in your .env file');
    console.log('2. Test with a real Calendly booking');
    console.log('3. Monitor your logs for incoming webhooks');

  } catch (error) {
    console.error('\n💥 Enable failed:', error.message);
    process.exit(1);
  }
}

// Run the script
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { getUserInfo, listWebhooks, deleteWebhook, registerWebhook };