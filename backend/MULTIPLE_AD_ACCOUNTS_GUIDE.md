# Managing Multiple Facebook Ad Accounts

## Overview
This guide explains how to manage multiple Facebook ad accounts efficiently for easier data retrieval and campaign management.

## Current Situation Analysis
You mentioned having several ad accounts and wanting to consolidate them for easier retrieval. Here's what you need to know:

### Facebook Sandbox vs Production
- **Sandbox**: Limited to test data, not suitable for real ad accounts
- **Production**: Required for managing real ad accounts and campaigns
- **Multiple Pages**: You can add multiple Facebook pages, but ad accounts are separate entities

### Access Token vs Ad Account Management
- **Access Token**: Provides API access permissions
- **Ad Account IDs**: Specific identifiers for each ad account (format: `act_XXXXXXXXXX`)
- **Business Manager**: Central hub for managing multiple ad accounts

## Solutions for Multiple Ad Accounts

### Option 1: Business Manager Consolidation (Recommended)

#### Benefits:
- Centralized management of all ad accounts
- Single access token can access multiple accounts
- Better permission management
- Unified reporting and insights

#### Setup Steps:
1. **Create/Access Facebook Business Manager**
   - Go to [business.facebook.com](https://business.facebook.com)
   - Create a business manager account if you don't have one

2. **Add All Ad Accounts to Business Manager**
   - Navigate to Business Settings → Accounts → Ad Accounts
   - Add existing ad accounts or request access
   - Ensure you have admin permissions on all accounts

3. **Create System User (Recommended)**
   - Go to Business Settings → Users → System Users
   - Create a system user for API access
   - Assign the system user to all ad accounts with admin permissions
   - Generate a system user access token (never expires)

4. **Configure App Permissions**
   - Ensure your Facebook app has access to the business manager
   - Grant necessary permissions: `ads_management`, `ads_read`, `business_management`

### Option 2: Multiple Account Configuration

#### Environment Setup
Configure multiple ad account IDs in your environment:

```env
# Primary ad account
FACEBOOK_AD_ACCOUNT_ID=act_1319734902978608

# Additional ad accounts (comma-separated)
FACEBOOK_ADDITIONAL_AD_ACCOUNTS=act_1234567890,act_0987654321,act_1122334455

# Or as separate variables
FACEBOOK_AD_ACCOUNT_1=act_1319734902978608
FACEBOOK_AD_ACCOUNT_2=act_1234567890
FACEBOOK_AD_ACCOUNT_3=act_0987654321
```

## Implementation Strategy

### Multi-Account Service Class
I'll create an enhanced service that can:
- Handle multiple ad account IDs
- Aggregate data across all accounts
- Provide unified campaign management
- Support both individual and bulk operations

### Key Features:
1. **Account Discovery**: Automatically detect accessible ad accounts
2. **Unified Retrieval**: Get campaigns from all accounts in one call
3. **Account-Specific Operations**: Target specific accounts when needed
4. **Error Handling**: Graceful handling of account-specific issues
5. **Caching**: Improve performance for frequent operations

## Next Steps

1. **Immediate Actions**:
   - Set up Business Manager if not already done
   - Add all your ad accounts to Business Manager
   - Generate a system user access token

2. **Technical Implementation**:
   - Update the Facebook Ads Service to support multiple accounts
   - Create account management utilities
   - Implement unified data retrieval methods

3. **Testing**:
   - Verify access to all ad accounts
   - Test campaign retrieval across accounts
   - Validate permissions and error handling

## Recommendations

### For Production Use:
- **Use Business Manager**: Essential for managing multiple accounts
- **System User Tokens**: More reliable than user access tokens
- **Proper Permissions**: Ensure all required permissions are granted
- **Error Handling**: Implement robust error handling for account-specific issues

### For Development:
- **Test with Sandbox**: Use sandbox for initial development
- **Gradual Migration**: Test with one account before adding others
- **Monitoring**: Implement logging for multi-account operations

Would you like me to implement the multi-account Facebook Ads Service to handle all your ad accounts efficiently?