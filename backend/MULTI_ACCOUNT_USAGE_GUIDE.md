# Multi-Account Facebook Ads Management Guide

## Overview

You now have a powerful multi-account Facebook Ads management system that allows you to:
- Manage **10 Facebook ad accounts** from a single interface
- Retrieve campaigns from all accounts with one API call
- Search campaigns across all accounts simultaneously
- Create campaigns in specific accounts
- Get unified reporting and insights

## Your Configured Ad Accounts

✅ **All 10 accounts are accessible and configured:**

1. **act_297553364641481** - Derek Obasi (2 campaigns: 1 active, 1 paused)
2. **act_493862779635991** - AFRIEFACTS (0 campaigns)
3. **act_2137921796592508** - goodkompany (0 campaigns)
4. **act_1075736330432290** - 9494jobs (1 active campaign)
5. **act_1478716326153231** - Insurance ad (7 campaigns: 1 active, 6 paused)
6. **act_3113130818860654** - wealthandcareerhubsubscribe (9 campaigns: 1 active, 8 paused)
7. **act_1323895532192651** - Nasco (3 paused campaigns)
8. **act_650466154034204** - Global Elite Travel (1 paused campaign)
9. **act_596775403524881** - ONESHOPCENTRALE (10 campaigns: 1 active, 9 paused)
10. **act_1921736338634981** - Sceen Connect (0 campaigns)

**Total: 33 campaigns across 10 accounts**

## How to Use the Multi-Account Service

### 1. Import the Service

```javascript
import MultiAccountFacebookService from './src/services/multi-account-facebook-service.js';
```

### 2. Get All Campaigns from All Accounts

```javascript
// Retrieve campaigns from all 10 accounts at once
const result = await MultiAccountFacebookService.getAllCampaigns();

console.log(`Found ${result.campaigns.length} campaigns`);
console.log(`Successfully accessed ${result.successfulAccounts}/${result.totalAccounts} accounts`);

// Each campaign includes the account_id for identification
result.campaigns.forEach(campaign => {
  console.log(`${campaign.name} (${campaign.account_id})`);
});
```

### 3. Get Campaigns from a Specific Account

```javascript
// Get campaigns from just one account
const campaigns = await MultiAccountFacebookService.getCampaignsByAccount('act_297553364641481');
console.log(`Derek Obasi account has ${campaigns.length} campaigns`);
```

### 4. Search Campaigns Across All Accounts

```javascript
// Search for campaigns containing specific keywords
const searchResults = await MultiAccountFacebookService.searchCampaigns('insurance');
console.log(`Found ${searchResults.totalMatches} campaigns matching "insurance"`);

searchResults.matches.forEach(campaign => {
  console.log(`${campaign.name} in account ${campaign.account_id}`);
});
```

### 5. Create a Campaign in a Specific Account

```javascript
// Create a new campaign in the Insurance ad account
const newCampaign = await MultiAccountFacebookService.createCampaignInAccount(
  'act_1478716326153231', // Insurance ad account
  {
    name: 'New Insurance Campaign',
    objective: 'OUTCOME_LEADS',
    status: 'PAUSED'
  }
);
```

### 6. Get Account Summary

```javascript
// Get overview of all accounts with campaign counts
const summary = await MultiAccountFacebookService.getAccountsSummary();

summary.forEach(account => {
  console.log(`${account.name}: ${account.totalCampaigns} campaigns`);
  console.log('Status breakdown:', account.statusBreakdown);
});
```

### 7. Verify Account Access

```javascript
// Check which accounts are accessible
const verification = await MultiAccountFacebookService.verifyAllAccounts();

Object.entries(verification).forEach(([accountId, result]) => {
  if (result.accessible) {
    console.log(`✅ ${accountId}: ${result.info.name}`);
  } else {
    console.log(`❌ ${accountId}: ${result.error}`);
  }
});
```

## Practical Use Cases

### 1. Daily Campaign Monitoring

```javascript
// Get all active campaigns across all accounts
const allCampaigns = await MultiAccountFacebookService.getAllCampaigns();
const activeCampaigns = allCampaigns.campaigns.filter(c => c.status === 'ACTIVE');

console.log(`You have ${activeCampaigns.length} active campaigns running`);
```

### 2. Bulk Campaign Management

```javascript
// Pause all campaigns containing "test" in the name
const testCampaigns = await MultiAccountFacebookService.searchCampaigns('test');

for (const campaign of testCampaigns.matches) {
  if (campaign.status === 'ACTIVE') {
    await MultiAccountFacebookService.updateCampaignStatus(campaign.id, 'PAUSED');
    console.log(`Paused test campaign: ${campaign.name}`);
  }
}
```

### 3. Account Performance Overview

```javascript
// Get performance summary for all accounts
const summary = await MultiAccountFacebookService.getAccountsSummary();

const totalCampaigns = summary.reduce((sum, account) => sum + (account.totalCampaigns || 0), 0);
const activeAccounts = summary.filter(account => account.accessible && account.totalCampaigns > 0);

console.log(`Total campaigns: ${totalCampaigns}`);
console.log(`Active accounts: ${activeAccounts.length}`);
```

## Environment Configuration

Your `.env` file is now configured with:

```env
# Primary account (optional - included in additional accounts)
FACEBOOK_AD_ACCOUNT_ID=act_1319734902978608

# All your accessible ad accounts
FACEBOOK_ADDITIONAL_AD_ACCOUNTS=act_297553364641481,act_493862779635991,act_2137921796592508,act_1075736330432290,act_1478716326153231,act_3113130818860654,act_1323895532192651,act_650466154034204,act_596775403524881,act_1921736338634981
```

## Benefits of This Setup

### ✅ **Unified Management**
- Single API service manages all 10 accounts
- No need to switch between different account configurations
- Consistent error handling across all accounts

### ✅ **Easy Data Retrieval**
- Get campaigns from all accounts with one function call
- Search across all accounts simultaneously
- Automatic account identification in results

### ✅ **Scalable Architecture**
- Easy to add new accounts by updating environment variables
- Service automatically discovers and configures new accounts
- Built-in caching for improved performance

### ✅ **Production Ready**
- Robust error handling for individual account failures
- Detailed logging and monitoring
- Graceful degradation when some accounts are inaccessible

## Sandbox vs Production

**Your Question About Sandbox:**
- ❌ **Sandbox**: Only for testing with fake data, cannot access real ad accounts
- ✅ **Production**: What you're using now - manages real ad accounts and campaigns
- ✅ **Business Manager**: Recommended for organizing multiple accounts (optional but helpful)

**Access Token vs Ad Account Management:**
- **Access Token**: Provides API permissions (you have this configured)
- **Ad Account IDs**: Specific identifiers for each account (now configured for all 10 accounts)
- **Multiple Pages**: Different from ad accounts - pages are for content, ad accounts are for advertising

## Next Steps

1. **Start using the MultiAccountFacebookService** in your application
2. **Consider Business Manager setup** for better organization (optional)
3. **Implement monitoring** for campaign performance across accounts
4. **Set up automated reporting** using the unified data retrieval

## Testing

Run the test script anytime to verify your setup:

```bash
node test-multi-account.js
```

This will show you the current status of all accounts and campaigns.

---

**🎉 Congratulations!** You now have a powerful, unified Facebook Ads management system that can handle all your ad accounts efficiently from a single interface.