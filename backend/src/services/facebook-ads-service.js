/**
 * Facebook Ads Service
 * Handles campaign creation and management using Facebook Business SDK
 */

import dotenv from 'dotenv';
import bizSdk from 'facebook-nodejs-business-sdk';
import logger from '../utils/logger.js';

// Load environment variables
dotenv.config();

class FacebookAdsService {
  constructor() {
    this.accessToken = process.env.FACEBOOK_ACCESS_TOKEN;
    this.adAccountId = process.env.FACEBOOK_AD_ACCOUNT_ID;
    this.api = null;
    this.init();
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

    logger.info('Facebook Ads API initialized successfully');
  }

  /**
   * Create a new ad campaign
   * @param {Object} campaignData - Campaign configuration
   * @param {string} campaignData.name - Campaign name
   * @param {string} campaignData.objective - Campaign objective (default: OUTCOME_TRAFFIC)
   * @param {string} campaignData.status - Campaign status (default: PAUSED)
   * @param {Array} campaignData.specialAdCategories - Special ad categories
   * @returns {Promise<Object>} Created campaign data
   */
  async createCampaign(campaignData) {
    try {
      if (!this.api) {
        throw new Error('Facebook Ads API not initialized');
      }

      if (!this.adAccountId) {
        throw new Error('Facebook Ad Account ID not found in environment variables');
      }

      const {
        name,
        objective = 'OUTCOME_TRAFFIC',
        status = 'PAUSED',
        specialAdCategories = []
      } = campaignData;

      if (!name) {
        throw new Error('Campaign name is required');
      }

      const AdAccount = bizSdk.AdAccount;
      const fields = [];
      const params = {
        name,
        objective,
        status,
        special_ad_categories: specialAdCategories
      };

      logger.info(`Creating Facebook campaign: ${name}`);
      logger.debug('Campaign parameters:', params);

      const campaign = await (new AdAccount(this.adAccountId)).createCampaign(
        fields,
        params
      );

      const campaignResult = {
        id: campaign.id,
        name,
        objective,
        status,
        created_at: new Date().toISOString()
      };

      logger.info(`Campaign created successfully with ID: ${campaign.id}`);
      return campaignResult;

    } catch (error) {
      logger.error('Error creating Facebook campaign:', error);
      throw new Error(`Failed to create campaign: ${error.message}`);
    }
  }

  /**
   * Get campaign performance data
   * @param {string} campaignId - Campaign ID
   * @returns {Promise<Object>} Campaign insights
   */
  async getCampaignInsights(campaignId) {
    try {
      if (!this.api) {
        throw new Error('Facebook Ads API not initialized');
      }

      const Campaign = bizSdk.Campaign;
      const campaign = new Campaign(campaignId);
      
      const insights = await campaign.getInsights([
        'impressions',
        'clicks',
        'spend',
        'cpm',
        'cpc',
        'ctr',
        'reach'
      ]);

      logger.info(`Retrieved insights for campaign: ${campaignId}`);
      return insights;

    } catch (error) {
      logger.error('Error getting campaign insights:', error);
      throw new Error(`Failed to get campaign insights: ${error.message}`);
    }
  }

  /**
   * Update campaign status
   * @param {string} campaignId - Campaign ID
   * @param {string} status - New status (ACTIVE, PAUSED, DELETED)
   * @returns {Promise<Object>} Updated campaign data
   */
  async updateCampaignStatus(campaignId, status) {
    try {
      if (!this.api) {
        throw new Error('Facebook Ads API not initialized');
      }

      const Campaign = bizSdk.Campaign;
      const campaign = new Campaign(campaignId);
      
      const result = await campaign.update([], { status });
      
      logger.info(`Campaign ${campaignId} status updated to: ${status}`);
      return result;

    } catch (error) {
      logger.error('Error updating campaign status:', error);
      throw new Error(`Failed to update campaign status: ${error.message}`);
    }
  }

  /**
   * List all campaigns for the ad account
   * @returns {Promise<Array>} List of campaigns
   */
  async listCampaigns() {
    try {
      if (!this.api) {
        throw new Error('Facebook Ads API not initialized');
      }

      if (!this.adAccountId) {
        throw new Error('Facebook Ad Account ID not found in environment variables');
      }

      const AdAccount = bizSdk.AdAccount;
      const adAccount = new AdAccount(this.adAccountId);
      
      const campaigns = await adAccount.getCampaigns([
        'id',
        'name',
        'objective',
        'status',
        'created_time',
        'updated_time'
      ]);

      // Convert Facebook SDK objects to plain JavaScript objects
      const cleanCampaigns = campaigns.map(campaign => ({
        id: campaign.id,
        name: campaign.name,
        objective: campaign.objective,
        status: campaign.status,
        created_time: campaign.created_time,
        updated_time: campaign.updated_time
      }));

      logger.info(`Retrieved ${cleanCampaigns.length} campaigns`);
      return cleanCampaigns;

    } catch (error) {
      logger.error('Error listing campaigns:', error);
      throw new Error(`Failed to list campaigns: ${error.message}`);
    }
  }
}

export default new FacebookAdsService();