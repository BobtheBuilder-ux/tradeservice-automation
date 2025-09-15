#!/usr/bin/env node

/**
 * Setup Multiple Facebook Ad Accounts
 * This script helps you discover and configure multiple Facebook ad accounts
 */

import dotenv from 'dotenv';
import MultiAccountFacebookService from './src/services/multi-account-facebook-service.js';
import fs from 'fs';
import path from 'path';

// Load environment variables
dotenv.config();

class MultiAccountSetup {
  constructor() {
    this.service = MultiAccountFacebookService;
  }

  async run() {
    console.log('🚀 Facebook Multi-Account Setup Tool\n');
    
    try {
      // Step 1: Check current configuration
      await this.checkCurrentConfig();
      
      // Step 2: Discover available ad accounts
      await this.discoverAccounts();
      
      // Step 3: Verify access to configured accounts
      await this.verifyConfiguredAccounts();
      
      // Step 4: Test campaign retrieval
      await this.testCampaignRetrieval();
      
      // Step 5: Generate configuration recommendations
      await this.generateRecommendations();
      
    } catch (error) {
      console.error('❌ Setup failed:', error.message);
      process.exit(1);
    }
  }

  async checkCurrentConfig() {
    console.log('📋 Current Configuration:');
    console.log('─'.repeat(50));
    
    const accessToken = process.env.FACEBOOK_ACCESS_TOKEN;
    const primaryAccount = process.env.FACEBOOK_AD_ACCOUNT_ID;
    const additionalAccounts = process.env.FACEBOOK_ADDITIONAL_AD_ACCOUNTS;
    
    console.log(`Access Token: ${accessToken ? '✅ Configured' : '❌ Missing'}`);
    console.log(`Primary Account: ${primaryAccount || '❌ Not set'}`);
    console.log(`Additional Accounts: ${additionalAccounts || '❌ Not set'}`);
    
    if (this.service.allAccountIds.length > 0) {
      console.log(`\n📊 Configured Ad Accounts (${this.service.allAccountIds.length}):`);
      this.service.allAccountIds.forEach((accountId, index) => {
        console.log(`  ${index + 1}. ${accountId}`);
      });
    }
    
    console.log('\n');
  }

  async discoverAccounts() {
    console.log('🔍 Discovering Available Ad Accounts:');
    console.log('─'.repeat(50));
    
    try {
      const discoveredAccounts = await this.service.discoverAdAccounts();
      
      if (discoveredAccounts.length === 0) {
        console.log('❌ No ad accounts found. This could mean:');
        console.log('   • Your access token lacks proper permissions');
        console.log('   • You don\'t have access to any ad accounts');
        console.log('   • The token is invalid or expired');
        return;
      }
      
      console.log(`✅ Found ${discoveredAccounts.length} accessible ad accounts:\n`);
      
      discoveredAccounts.forEach((account, index) => {
        console.log(`${index + 1}. Account ID: ${account.id}`);
        console.log(`   Name: ${account.name}`);
        console.log(`   Status: ${account.status}`);
        console.log(`   Currency: ${account.currency}`);
        console.log(`   Timezone: ${account.timezone}`);
        if (account.business) {
          console.log(`   Business: ${account.business.name || account.business.id}`);
        }
        console.log('');
      });
      
      // Save discovered accounts for reference
      const discoveredFile = path.join(process.cwd(), 'discovered-ad-accounts.json');
      fs.writeFileSync(discoveredFile, JSON.stringify(discoveredAccounts, null, 2));
      console.log(`💾 Discovered accounts saved to: ${discoveredFile}\n`);
      
    } catch (error) {
      console.error('❌ Error discovering accounts:', error.message);
      console.log('\n🔧 Troubleshooting:');
      console.log('   • Verify your access token has ads_read permission');
      console.log('   • Check if you have access to any ad accounts');
      console.log('   • Ensure your Facebook app is approved for Marketing API');
    }
    
    console.log('');
  }

  async verifyConfiguredAccounts() {
    console.log('✅ Verifying Configured Ad Accounts:');
    console.log('─'.repeat(50));
    
    if (this.service.allAccountIds.length === 0) {
      console.log('❌ No ad accounts configured in environment variables\n');
      return;
    }
    
    const verificationResults = await this.service.verifyAllAccounts();
    
    Object.entries(verificationResults).forEach(([accountId, result]) => {
      if (result.accessible) {
        console.log(`✅ ${accountId}: Accessible`);
        if (result.info) {
          console.log(`   Name: ${result.info.name}`);
          console.log(`   Status: ${result.info.account_status}`);
          console.log(`   Currency: ${result.info.currency}`);
        }
      } else {
        console.log(`❌ ${accountId}: Not accessible`);
        console.log(`   Error: ${result.error}`);
      }
      console.log('');
    });
  }

  async testCampaignRetrieval() {
    console.log('📊 Testing Campaign Retrieval:');
    console.log('─'.repeat(50));
    
    try {
      const campaignResults = await this.service.getAllCampaigns();
      
      console.log(`✅ Successfully retrieved campaigns from ${campaignResults.successfulAccounts}/${campaignResults.totalAccounts} accounts`);
      console.log(`📈 Total campaigns found: ${campaignResults.campaigns.length}\n`);
      
      if (campaignResults.campaigns.length > 0) {
        console.log('📋 Campaign Summary by Account:');
        const accountGroups = campaignResults.campaigns.reduce((acc, campaign) => {
          if (!acc[campaign.account_id]) {
            acc[campaign.account_id] = [];
          }
          acc[campaign.account_id].push(campaign);
          return acc;
        }, {});
        
        Object.entries(accountGroups).forEach(([accountId, campaigns]) => {
          console.log(`\n  ${accountId}: ${campaigns.length} campaigns`);
          campaigns.slice(0, 3).forEach(campaign => {
            console.log(`    • ${campaign.name} (${campaign.status})`);
          });
          if (campaigns.length > 3) {
            console.log(`    ... and ${campaigns.length - 3} more`);
          }
        });
      }
      
      if (campaignResults.errors.length > 0) {
        console.log('\n⚠️  Errors encountered:');
        campaignResults.errors.forEach(error => {
          console.log(`   ${error.accountId}: ${error.error}`);
        });
      }
      
    } catch (error) {
      console.error('❌ Error testing campaign retrieval:', error.message);
    }
    
    console.log('\n');
  }

  async generateRecommendations() {
    console.log('💡 Configuration Recommendations:');
    console.log('─'.repeat(50));
    
    try {
      const discoveredAccounts = JSON.parse(
        fs.readFileSync(path.join(process.cwd(), 'discovered-ad-accounts.json'), 'utf8')
      );
      
      const configuredIds = new Set(this.service.allAccountIds);
      const discoveredIds = discoveredAccounts.map(acc => acc.id);
      const missingIds = discoveredIds.filter(id => !configuredIds.has(id));
      
      if (missingIds.length > 0) {
        console.log('🔧 Suggested Environment Variables:');
        console.log('\nAdd these to your .env file:\n');
        
        if (!process.env.FACEBOOK_AD_ACCOUNT_ID && discoveredIds.length > 0) {
          console.log(`FACEBOOK_AD_ACCOUNT_ID=${discoveredIds[0]}`);
        }
        
        if (missingIds.length > 0) {
          console.log(`FACEBOOK_ADDITIONAL_AD_ACCOUNTS=${missingIds.join(',')}`);
        }
        
        console.log('\n📝 Alternative format (individual variables):');
        discoveredIds.forEach((id, index) => {
          console.log(`FACEBOOK_AD_ACCOUNT_${index + 1}=${id}`);
        });
      } else {
        console.log('✅ All discovered accounts are already configured!');
      }
      
      console.log('\n🎯 Next Steps:');
      console.log('1. Update your .env file with the recommended configuration');
      console.log('2. Restart your application to load new environment variables');
      console.log('3. Use the MultiAccountFacebookService for unified campaign management');
      console.log('4. Consider setting up Business Manager for better account organization');
      
    } catch (error) {
      console.log('⚠️  Could not generate recommendations (discovery data not found)');
    }
    
    console.log('\n');
  }
}

// Run the setup if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const setup = new MultiAccountSetup();
  setup.run().catch(console.error);
}

export default MultiAccountSetup;