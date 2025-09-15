/**
 * Facebook App Permissions Setup Script
 * Helps verify and guide through setting up proper Facebook app permissions
 */

import dotenv from 'dotenv';
import logger from './src/utils/logger.js';

// Load environment variables
dotenv.config();

const REQUIRED_PERMISSIONS = [
  'ads_management',
  'ads_read',
  'pages_read_engagement',
  'leads_retrieval',
  'business_management'
];

const FACEBOOK_API_VERSION = 'v19.0';

/**
 * Check current token permissions
 */
async function checkTokenPermissions() {
  const accessToken = process.env.FACEBOOK_ACCESS_TOKEN;
  
  if (!accessToken) {
    console.error('❌ FACEBOOK_ACCESS_TOKEN not found in environment variables');
    return false;
  }

  try {
    console.log('🔍 Checking current token permissions...');
    
    const response = await fetch(
      `https://graph.facebook.com/${FACEBOOK_API_VERSION}/me/permissions?access_token=${accessToken}`
    );
    
    if (!response.ok) {
      const error = await response.json();
      console.error('❌ Failed to check permissions:', error.error?.message || 'Unknown error');
      return false;
    }
    
    const data = await response.json();
    const grantedPermissions = data.data
      .filter(perm => perm.status === 'granted')
      .map(perm => perm.permission);
    
    console.log('\n📋 Current Granted Permissions:');
    grantedPermissions.forEach(perm => {
      const isRequired = REQUIRED_PERMISSIONS.includes(perm);
      console.log(`  ${isRequired ? '✅' : '📝'} ${perm}`);
    });
    
    console.log('\n🎯 Required Permissions for Ads Management:');
    const missingPermissions = [];
    REQUIRED_PERMISSIONS.forEach(perm => {
      const hasPermission = grantedPermissions.includes(perm);
      console.log(`  ${hasPermission ? '✅' : '❌'} ${perm}`);
      if (!hasPermission) {
        missingPermissions.push(perm);
      }
    });
    
    if (missingPermissions.length > 0) {
      console.log('\n⚠️  Missing Required Permissions:');
      missingPermissions.forEach(perm => {
        console.log(`  - ${perm}`);
      });
      return false;
    }
    
    console.log('\n✅ All required permissions are granted!');
    return true;
    
  } catch (error) {
    console.error('❌ Error checking permissions:', error.message);
    return false;
  }
}

/**
 * Test ad account access
 */
async function testAdAccountAccess() {
  const accessToken = process.env.FACEBOOK_ACCESS_TOKEN;
  const adAccountId = process.env.FACEBOOK_AD_ACCOUNT_ID;
  
  if (!accessToken || !adAccountId) {
    console.error('❌ Missing Facebook credentials in environment variables');
    return false;
  }

  try {
    console.log('🏢 Testing ad account access...');
    
    const response = await fetch(
      `https://graph.facebook.com/${FACEBOOK_API_VERSION}/${adAccountId}?fields=name,account_status,account_id,business&access_token=${accessToken}`
    );
    
    if (!response.ok) {
      const error = await response.json();
      console.error('❌ Failed to access ad account:', error.error?.message || 'Unknown error');
      
      if (error.error?.code === 200) {
        console.log('\n💡 This error indicates missing permissions. Please follow the setup guide below.');
      }
      
      return false;
    }
    
    const data = await response.json();
    console.log('\n✅ Ad Account Access Successful:');
    console.log(`  📊 Account Name: ${data.name}`);
    console.log(`  🆔 Account ID: ${data.account_id}`);
    console.log(`  📈 Status: ${data.account_status}`);
    
    return true;
    
  } catch (error) {
    console.error('❌ Error testing ad account access:', error.message);
    return false;
  }
}

/**
 * Display setup instructions
 */
function displaySetupInstructions() {
  console.log('\n' + '='.repeat(80));
  console.log('🚀 FACEBOOK APP PERMISSIONS SETUP GUIDE');
  console.log('='.repeat(80));
  
  console.log('\n📱 Step 1: Facebook App Configuration');
  console.log('1. Go to https://developers.facebook.com/apps/');
  console.log('2. Select your app or create a new one');
  console.log('3. Add the "Marketing API" product to your app');
  console.log('4. Configure app settings for production use');
  
  console.log('\n🔐 Step 2: Request Required Permissions');
  console.log('Required permissions for ads management:');
  REQUIRED_PERMISSIONS.forEach(perm => {
    console.log(`  - ${perm}`);
  });
  
  console.log('\n🎯 Step 3: Generate Production Access Token');
  console.log('Option A - User Access Token:');
  console.log('1. Use Facebook Graph API Explorer: https://developers.facebook.com/tools/explorer/');
  console.log('2. Select your app and required permissions');
  console.log('3. Generate token and extend to long-lived (60 days)');
  
  console.log('\nOption B - System User Token (Recommended):');
  console.log('1. Create system user in Facebook Business Manager');
  console.log('2. Assign system user to ad account with admin permissions');
  console.log('3. Generate system user access token (never expires)');
  
  console.log('\n🏢 Step 4: Ad Account Setup');
  console.log('1. Ensure ad account is added to Facebook Business Manager');
  console.log('2. Grant proper roles and permissions to your app/user');
  console.log('3. Verify ad account status is active');
  
  console.log('\n🔧 Step 5: Update Environment Variables');
  console.log('Update your .env file with the new production token:');
  console.log('FACEBOOK_ACCESS_TOKEN=your_new_production_token');
  
  console.log('\n✅ Step 6: Test Setup');
  console.log('Run this script again to verify permissions and access');
  
  console.log('\n' + '='.repeat(80));
}

/**
 * Main setup function
 */
async function setupFacebookPermissions() {
  console.log('🚀 Facebook App Permissions Setup');
  console.log('==================================\n');
  
  // Check if we have basic credentials
  const accessToken = process.env.FACEBOOK_ACCESS_TOKEN;
  const adAccountId = process.env.FACEBOOK_AD_ACCOUNT_ID;
  
  if (!accessToken) {
    console.error('❌ FACEBOOK_ACCESS_TOKEN not found in environment variables');
    displaySetupInstructions();
    return;
  }
  
  if (!adAccountId) {
    console.error('❌ FACEBOOK_AD_ACCOUNT_ID not found in environment variables');
    displaySetupInstructions();
    return;
  }
  
  console.log('✅ Basic credentials found in environment');
  console.log(`📊 Ad Account ID: ${adAccountId}`);
  console.log(`🔑 Access Token: ${accessToken.substring(0, 20)}...\n`);
  
  // Check permissions
  const hasPermissions = await checkTokenPermissions();
  
  // Test ad account access
  const hasAccess = await testAdAccountAccess();
  
  if (hasPermissions && hasAccess) {
    console.log('\n🎉 SUCCESS: Facebook app is properly configured for production!');
    console.log('✅ All required permissions are granted');
    console.log('✅ Ad account access is working');
    console.log('\n🚀 You can now proceed with live Facebook ads testing');
  } else {
    console.log('\n⚠️  SETUP REQUIRED: Facebook app needs configuration');
    displaySetupInstructions();
  }
}

// Run setup if script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  setupFacebookPermissions()
    .then(() => {
      console.log('\n🏁 Setup check completed');
    })
    .catch(error => {
      console.error('💥 Setup check failed:', error);
      process.exit(1);
    });
}

export default setupFacebookPermissions;