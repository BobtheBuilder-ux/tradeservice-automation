/**
 * Cleanup Test Campaigns Script
 * Removes all test/demo campaigns from Facebook Ads account
 */

import facebookAdsService from './src/services/facebook-ads-service.js';
import logger from './src/utils/logger.js';

const TEST_CAMPAIGN_KEYWORDS = [
  'test',
  'demo',
  'quick',
  'debug',
  'sample',
  'example',
  'trial',
  'temp',
  'temporary',
  'hello',
  'here'
];

/**
 * Check if a campaign name indicates it's a test campaign
 */
function isTestCampaign(campaignName) {
  const name = campaignName.toLowerCase();
  return TEST_CAMPAIGN_KEYWORDS.some(keyword => name.includes(keyword));
}

/**
 * Delete all test campaigns
 */
async function cleanupTestCampaigns() {
  try {
    console.log('🧹 Starting cleanup of test campaigns...');
    
    // Get all campaigns
    const campaigns = await facebookAdsService.listCampaigns();
    console.log(`📋 Found ${campaigns.length} total campaigns`);
    
    // Filter test campaigns
    const testCampaigns = campaigns.filter(campaign => 
      isTestCampaign(campaign.name) || campaign.status === 'PAUSED'
    );
    
    console.log(`🎯 Identified ${testCampaigns.length} test campaigns to remove:`);
    testCampaigns.forEach(campaign => {
      console.log(`  - ${campaign.name} (ID: ${campaign.id})`);
    });
    
    if (testCampaigns.length === 0) {
      console.log('✅ No test campaigns found to remove');
      return;
    }
    
    // Delete test campaigns
    let deletedCount = 0;
    for (const campaign of testCampaigns) {
      try {
        await facebookAdsService.updateCampaignStatus(campaign.id, 'DELETED');
        console.log(`✅ Deleted: ${campaign.name}`);
        deletedCount++;
      } catch (error) {
        console.error(`❌ Failed to delete ${campaign.name}: ${error.message}`);
      }
    }
    
    console.log(`\n🎉 Cleanup completed! Deleted ${deletedCount} out of ${testCampaigns.length} test campaigns`);
    
    // Verify cleanup
    const remainingCampaigns = await facebookAdsService.listCampaigns();
    const remainingTestCampaigns = remainingCampaigns.filter(campaign => 
      isTestCampaign(campaign.name)
    );
    
    if (remainingTestCampaigns.length > 0) {
      console.log(`\n⚠️  Warning: ${remainingTestCampaigns.length} test campaigns still remain:`);
      remainingTestCampaigns.forEach(campaign => {
        console.log(`  - ${campaign.name} (Status: ${campaign.status})`);
      });
    } else {
      console.log('\n✨ All test campaigns successfully removed!');
    }
    
  } catch (error) {
    console.error('💥 Error during cleanup:', error.message);
    process.exit(1);
  }
}

// Run cleanup if script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  cleanupTestCampaigns()
    .then(() => {
      console.log('\n🏁 Cleanup script completed');
      process.exit(0);
    })
    .catch(error => {
      console.error('💥 Cleanup script failed:', error);
      process.exit(1);
    });
}

export default cleanupTestCampaigns;