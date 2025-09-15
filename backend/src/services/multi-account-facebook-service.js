/**
 * Multi-Account Facebook Ads Service
 * Handles multiple Facebook ad accounts for unified campaign management
 */

import dotenv from 'dotenv';
import bizSdk from 'facebook-nodejs-business-sdk';
import logger from '../utils/logger.js';

// Load environment variables
dotenv.config();

class MultiAccountFacebookService {
  constructor() {
    this.accessToken = process.env.FACEBOOK_ACCESS_TOKEN;
    this.primaryAccountId = process.env.FACEBOOK_AD_ACCOUNT_ID;
    this.additionalAccounts = this.parseAdditionalAccounts();
    this.allAccountIds = this.getAllAccountIds();
    this.api = null;
    this.accountCache = new Map();
    this.init();
  }

  /**
   * Parse additional ad accounts from environment variables
   */
  parseAdditionalAccounts() {
    const additional = [];
    
    // Method 1: Comma-separated list
    if (process.env.FACEBOOK_ADDITIONAL_AD_ACCOUNTS) {
      additional.push(...process.env.FACEBOOK_ADDITIONAL_AD_ACCOUNTS.split(',').map(id => id.trim()));
    }
    
    // Method 2: Individual environment variables
    let i = 1;
    while (process.env[`FACEBOOK_AD_ACCOUNT_${i}`]) {
      const accountId = process.env[`FACEBOOK_AD_ACCOUNT_${i}`];
      if (accountId && !additional.includes(accountId)) {
        additional.push(accountId);
      }
      i++;
    }
    
    return additional.filter(id => id && id !== this.primaryAccountId);
  }

  /**
   * Get all configured ad account IDs
   */
  getAllAccountIds() {
    const accounts = [];
    if (this.primaryAccountId) {
      accounts.push(this.primaryAccountId);
    }
    accounts.push(...this.additionalAccounts);
    return [...new Set(accounts)]; // Remove duplicates
  }

  init() {
    if (!this.accessToken) {
      logger.error('Facebook access token not found in environment variables');
      return;
    }

    this.api = bizSdk.FacebookAdsApi.init(this.accessToken);
    
    // Enable debugging in development
    if (process.env.NODE_ENV === 'development') {
      this.api.setDebug(true);
    }

    logger.info(`Facebook Ads API initialized with ${this.allAccountIds.length} ad accounts`);
    logger.info(`Ad Accounts: ${this.allAccountIds.join(', ')}`);
  }

  /**
   * Discover all accessible ad accounts for the current access token
   */
  async discoverAdAccounts() {
    try {
      if (!this.api) {
        throw new Error('Facebook Ads API not initialized');
      }

      const me = new bizSdk.User('me');
      const adAccounts = await me.getAdAccounts([
        'id',
        'name',
        'account_status',
        'business',
        'currency',
        'timezone_name'
      ]);

      const discoveredAccounts = adAccounts.map(account => ({
        id: account.id,
        name: account.name,
        status: account.account_status,
        business: account.business,
        currency: account.currency,
        timezone: account.timezone_name
      }));

      logger.info(`Discovered ${discoveredAccounts.length} accessible ad accounts`);
      return discoveredAccounts;
    } catch (error) {
      logger.error('Error discovering ad accounts:', error.message);
      throw error;
    }
  }

  /**
   * Verify access to a specific ad account
   */
  async verifyAccountAccess(accountId) {
    try {
      const adAccount = new bizSdk.AdAccount(accountId);
      const accountInfo = await adAccount.read([
        'id',
        'name',
        'account_status',
        'currency'
      ]);
      
      this.accountCache.set(accountId, {
        ...accountInfo,
        lastVerified: new Date(),
        accessible: true
      });
      
      return { accessible: true, info: accountInfo };
    } catch (error) {
      logger.warn(`Cannot access ad account ${accountId}:`, error.message);
      this.accountCache.set(accountId, {
        accessible: false,
        error: error.message,
        lastVerified: new Date()
      });
      return { accessible: false, error: error.message };
    }
  }

  /**
   * Verify access to all configured ad accounts
   */
  async verifyAllAccounts() {
    const results = {};
    
    for (const accountId of this.allAccountIds) {
      results[accountId] = await this.verifyAccountAccess(accountId);
    }
    
    const accessibleAccounts = Object.entries(results)
      .filter(([_, result]) => result.accessible)
      .map(([accountId, _]) => accountId);
    
    logger.info(`${accessibleAccounts.length}/${this.allAccountIds.length} ad accounts are accessible`);
    
    return results;
  }

  /**
   * Get campaigns from all accessible ad accounts
   */
  async getAllCampaigns(fields = ['id', 'name', 'status', 'objective', 'created_time', 'updated_time']) {
    const allCampaigns = [];
    const errors = [];

    for (const accountId of this.allAccountIds) {
      try {
        const campaigns = await this.getCampaignsByAccount(accountId, fields);
        allCampaigns.push(...campaigns.map(campaign => ({
          ...campaign,
          account_id: accountId
        })));
      } catch (error) {
        logger.warn(`Error fetching campaigns from ${accountId}:`, error.message);
        errors.push({ accountId, error: error.message });
      }
    }

    logger.info(`Retrieved ${allCampaigns.length} campaigns from ${this.allAccountIds.length - errors.length} accounts`);
    
    return {
      campaigns: allCampaigns,
      errors,
      totalAccounts: this.allAccountIds.length,
      successfulAccounts: this.allAccountIds.length - errors.length
    };
  }

  /**
   * Get campaigns from a specific ad account
   */
  async getCampaignsByAccount(accountId, fields = ['id', 'name', 'status', 'objective', 'created_time', 'updated_time']) {
    try {
      if (!this.api) {
        throw new Error('Facebook Ads API not initialized');
      }

      const adAccount = new bizSdk.AdAccount(accountId);
      const campaigns = await adAccount.getCampaigns(fields);
      
      return campaigns.map(campaign => ({
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        objective: campaign.objective,
        created_time: campaign.created_time,
        updated_time: campaign.updated_time,
        account_id: accountId
      }));
    } catch (error) {
      logger.error(`Error fetching campaigns from account ${accountId}:`, error.message);
      throw error;
    }
  }

  /**
   * Create a campaign in a specific ad account
   */
  async createCampaignInAccount(accountId, campaignData) {
    try {
      if (!this.api) {
        throw new Error('Facebook Ads API not initialized');
      }

      const adAccount = new bizSdk.AdAccount(accountId);
      const campaign = await adAccount.createCampaign([], {
        name: campaignData.name,
        objective: campaignData.objective || 'OUTCOME_TRAFFIC',
        status: campaignData.status || 'PAUSED',
        special_ad_categories: campaignData.specialAdCategories || []
      });

      logger.info(`Campaign created successfully in account ${accountId}:`, campaign.id);
      return {
        ...campaign,
        account_id: accountId
      };
    } catch (error) {
      logger.error(`Error creating campaign in account ${accountId}:`, error.message);
      throw error;
    }
  }

  /**
   * Update campaign status across multiple accounts
   */
  async updateCampaignStatusBulk(campaignUpdates) {
    const results = [];
    const errors = [];

    for (const update of campaignUpdates) {
      try {
        const result = await this.updateCampaignStatus(update.campaignId, update.status);
        results.push({ ...result, campaignId: update.campaignId });
      } catch (error) {
        logger.error(`Error updating campaign ${update.campaignId}:`, error.message);
        errors.push({ campaignId: update.campaignId, error: error.message });
      }
    }

    return { results, errors };
  }

  /**
   * Update campaign status (works with any account)
   */
  async updateCampaignStatus(campaignId, status) {
    try {
      if (!this.api) {
        throw new Error('Facebook Ads API not initialized');
      }

      const campaign = new bizSdk.Campaign(campaignId);
      const result = await campaign.update([], { status });
      
      logger.info(`Campaign ${campaignId} status updated to ${status}`);
      return result;
    } catch (error) {
      logger.error(`Error updating campaign ${campaignId}:`, error.message);
      throw error;
    }
  }

  /**
   * Get account summary with campaign counts
   */
  async getAccountsSummary() {
    const summary = [];

    for (const accountId of this.allAccountIds) {
      try {
        const campaigns = await this.getCampaignsByAccount(accountId, ['id', 'status']);
        const statusCounts = campaigns.reduce((acc, campaign) => {
          acc[campaign.status] = (acc[campaign.status] || 0) + 1;
          return acc;
        }, {});

        const accountInfo = this.accountCache.get(accountId);
        
        summary.push({
          accountId,
          name: accountInfo?.name || 'Unknown',
          accessible: accountInfo?.accessible !== false,
          totalCampaigns: campaigns.length,
          statusBreakdown: statusCounts,
          lastChecked: new Date()
        });
      } catch (error) {
        summary.push({
          accountId,
          accessible: false,
          error: error.message,
          lastChecked: new Date()
        });
      }
    }

    return summary;
  }

  /**
   * Search campaigns across all accounts
   */
  async searchCampaigns(searchTerm, fields = ['id', 'name', 'status', 'objective']) {
    const allCampaigns = await this.getAllCampaigns(fields);
    
    const matchingCampaigns = allCampaigns.campaigns.filter(campaign => 
      campaign.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return {
      searchTerm,
      matches: matchingCampaigns,
      totalMatches: matchingCampaigns.length,
      searchedAccounts: allCampaigns.successfulAccounts
    };
  }
}

export default new MultiAccountFacebookService();