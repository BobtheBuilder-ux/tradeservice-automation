#!/usr/bin/env node

import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

const CALENDLY_API_BASE = 'https://api.calendly.com';

/**
 * Get user information and organization URI
 */
async function getUserInfo(accessToken) {
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
    return data.resource;
  } catch (error) {
    console.error('❌ Failed to get user info:', error.message);
    throw error;
  }
}

/**
 * List all webhook subscriptions
 */
async function listWebhooks(accessToken, organizationUri) {
  console.log('🔍 Fetching all webhook subscriptions...');
  
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
    
    console.log(`\n📊 Total webhooks found: ${data.collection.length}`);
    console.log('=' .repeat(50));
    
    if (data.collection.length === 0) {
      console.log('❌ No webhooks found for this organization.');
      console.log('\n💡 To create a webhook, run: node scripts/setup-calendly-webhook.js');
      return [];
    }
    
    data.collection.forEach((webhook, index) => {
      console.log(`\n📌 Webhook ${index + 1}:`);
      console.log(`   🆔 ID: ${webhook.uri}`);
      console.log(`   🔗 URL: ${webhook.callback_url}`);
      console.log(`   📅 Events: ${webhook.events.join(', ')}`);
      console.log(`   🟢 State: ${webhook.state}`);
      console.log(`   📍 Scope: ${webhook.scope}`);
      console.log(`   🏢 Organization: ${webhook.organization}`);
      console.log(`   📆 Created: ${new Date(webhook.created_at).toLocaleString()}`);
      console.log(`   🔄 Updated: ${new Date(webhook.updated_at).toLocaleString()}`);
      
      if (webhook.signing_key) {
        console.log(`   🔑 Signing Key: ${webhook.signing_key}`);
      } else {
        console.log(`   🔑 Signing Key: Not available (check your .env file)`);
      }
    });
    
    return data.collection;
  } catch (error) {
    console.error('❌ Failed to list webhooks:', error.message);
    throw error;
  }
}

/**
 * Main function
 */
async function main() {
  console.log('📋 Calendly Webhook List');
  console.log('========================\n');

  const accessToken = process.env.CALENDLY_PERSONAL_ACCESS_TOKEN;
  
  if (!accessToken || accessToken === 'your_personal_access_token_here') {
    console.error('❌ Missing CALENDLY_PERSONAL_ACCESS_TOKEN in .env file');
    process.exit(1);
  }

  try {
    // Get user info and organization URI
    const userInfo = await getUserInfo(accessToken);
    const organizationUri = userInfo.current_organization;
    
    console.log(`👤 User: ${userInfo.name} (${userInfo.email})`);
    console.log(`🏢 Organization: ${organizationUri}`);
    
    // List all webhooks
    const webhooks = await listWebhooks(accessToken, organizationUri);
    
    console.log('\n✅ Webhook listing complete!');
    
  } catch (error) {
    console.error('\n💥 Failed to list webhooks:', error.message);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { listWebhooks };