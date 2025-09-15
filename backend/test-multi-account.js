#!/usr/bin/env node

/**
 * Test Multi-Account Facebook Ads Service
 * Demonstrates unified campaign management across multiple ad accounts
 */

import dotenv from 'dotenv';
import MultiAccountFacebookService from './src/services/multi-account-facebook-service.js';

// Load environment variables
dotenv.config();

async function testMultiAccountService() {
  console.log('🚀 Testing Multi-Account Facebook Ads Service\n');
  
  try {
    // Test 1: Show configured accounts
    console.log('📊 Configured Ad Accounts:');
    console.log('─'.repeat(50));
    console.log(`Total accounts configured: ${MultiAccountFacebookService.allAccountIds.length}`);
    MultiAccountFacebookService.allAccountIds.forEach((accountId, index) => {
      console.log(`  ${index + 1}. ${accountId}`);
    });
    console.log('\n');
    
    // Test 2: Verify account access
    console.log('✅ Verifying Account Access:');
    console.log('─'.repeat(50));
    const verificationResults = await MultiAccountFacebookService.verifyAllAccounts();
    
    let accessibleCount = 0;
    Object.entries(verificationResults).forEach(([accountId, result]) => {
      if (result.accessible) {
        accessibleCount++;
        console.log(`✅ ${accountId}: ${result.info?.name || 'Accessible'}`);
      } else {
        console.log(`❌ ${accountId}: ${result.error}`);
      }
    });
    
    console.log(`\n📈 Summary: ${accessibleCount}/${MultiAccountFacebookService.allAccountIds.length} accounts accessible\n`);
    
    // Test 3: Get campaigns from all accounts
    console.log('📋 Retrieving Campaigns from All Accounts:');
    console.log('─'.repeat(50));
    
    const campaignResults = await MultiAccountFacebookService.getAllCampaigns();
    
    console.log(`✅ Retrieved campaigns from ${campaignResults.successfulAccounts}/${campaignResults.totalAccounts} accounts`);
    console.log(`📊 Total campaigns found: ${campaignResults.campaigns.length}\n`);
    
    if (campaignResults.campaigns.length > 0) {
      // Group campaigns by account
      const campaignsByAccount = campaignResults.campaigns.reduce((acc, campaign) => {
        if (!acc[campaign.account_id]) {
          acc[campaign.account_id] = [];
        }
        acc[campaign.account_id].push(campaign);
        return acc;
      }, {});
      
      console.log('📈 Campaign Breakdown by Account:');
      Object.entries(campaignsByAccount).forEach(([accountId, campaigns]) => {
        console.log(`\n  ${accountId}: ${campaigns.length} campaigns`);
        
        // Show status breakdown
        const statusCounts = campaigns.reduce((acc, campaign) => {
          acc[campaign.status] = (acc[campaign.status] || 0) + 1;
          return acc;
        }, {});
        
        Object.entries(statusCounts).forEach(([status, count]) => {
          console.log(`    ${status}: ${count}`);
        });
        
        // Show sample campaigns
        console.log('    Sample campaigns:');
        campaigns.slice(0, 3).forEach(campaign => {
          console.log(`      • ${campaign.name} (${campaign.status})`);
        });
        
        if (campaigns.length > 3) {
          console.log(`      ... and ${campaigns.length - 3} more`);
        }
      });
    }
    
    if (campaignResults.errors.length > 0) {
      console.log('\n⚠️  Account Errors:');
      campaignResults.errors.forEach(error => {
        console.log(`   ${error.accountId}: ${error.error}`);
      });
    }
    
    // Test 4: Get accounts summary
    console.log('\n\n📊 Accounts Summary:');
    console.log('─'.repeat(50));
    
    const summary = await MultiAccountFacebookService.getAccountsSummary();
    
    summary.forEach(account => {
      console.log(`\n${account.accountId}:`);
      if (account.accessible) {
        console.log(`  Name: ${account.name}`);
        console.log(`  Total Campaigns: ${account.totalCampaigns}`);
        if (account.statusBreakdown && Object.keys(account.statusBreakdown).length > 0) {
          console.log('  Status Breakdown:');
          Object.entries(account.statusBreakdown).forEach(([status, count]) => {
            console.log(`    ${status}: ${count}`);
          });
        }
      } else {
        console.log(`  Status: ❌ Not accessible`);
        console.log(`  Error: ${account.error}`);
      }
    });
    
    // Test 5: Search campaigns (if any exist)
    if (campaignResults.campaigns.length > 0) {
      console.log('\n\n🔍 Testing Campaign Search:');
      console.log('─'.repeat(50));
      
      const searchResults = await MultiAccountFacebookService.searchCampaigns('test');
      console.log(`Search term: "${searchResults.searchTerm}"`);
      console.log(`Matches found: ${searchResults.totalMatches}`);
      
      if (searchResults.matches.length > 0) {
        console.log('\nMatching campaigns:');
        searchResults.matches.forEach(campaign => {
          console.log(`  • ${campaign.name} (${campaign.account_id})`);
        });
      }
    }
    
    console.log('\n\n🎉 Multi-Account Service Test Complete!');
    console.log('\n💡 Usage Examples:');
    console.log('─'.repeat(50));
    console.log('// Get all campaigns from all accounts');
    console.log('const allCampaigns = await MultiAccountFacebookService.getAllCampaigns();');
    console.log('');
    console.log('// Get campaigns from specific account');
    console.log('const campaigns = await MultiAccountFacebookService.getCampaignsByAccount("act_123456789");');
    console.log('');
    console.log('// Search campaigns across all accounts');
    console.log('const results = await MultiAccountFacebookService.searchCampaigns("keyword");');
    console.log('');
    console.log('// Create campaign in specific account');
    console.log('const campaign = await MultiAccountFacebookService.createCampaignInAccount("act_123456789", campaignData);');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

// Run the test
testMultiAccountService().catch(console.error);