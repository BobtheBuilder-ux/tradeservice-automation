/**
 * Facebook Ads API Routes
 * Provides endpoints for campaign creation and management
 */

import express from 'express';
import facebookAdsService from '../services/facebook-ads-service.js';
import logger from '../utils/logger.js';

const router = express.Router();

/**
 * POST /api/facebook-ads/campaigns
 * Create a new Facebook ad campaign
 */
router.post('/campaigns', async (req, res) => {
  try {
    const { name, objective, status, specialAdCategories } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Campaign name is required'
      });
    }

    const campaignData = {
      name,
      objective,
      status,
      specialAdCategories
    };

    logger.info('Creating new Facebook campaign:', { name, objective, status });
    
    const campaign = await facebookAdsService.createCampaign(campaignData);
    
    res.status(201).json({
      success: true,
      data: campaign,
      message: 'Campaign created successfully'
    });

  } catch (error) {
    logger.error('Error in POST /campaigns:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/facebook-ads/campaigns
 * List all campaigns for the ad account
 */
router.get('/campaigns', async (req, res) => {
  try {
    logger.info('Fetching all Facebook campaigns');
    
    const campaigns = await facebookAdsService.listCampaigns();
    
    res.json({
      success: true,
      data: campaigns,
      count: campaigns.length
    });

  } catch (error) {
    logger.error('Error in GET /campaigns:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/facebook-ads/campaigns/:campaignId/insights
 * Get campaign performance insights
 */
router.get('/campaigns/:campaignId/insights', async (req, res) => {
  try {
    const { campaignId } = req.params;

    if (!campaignId) {
      return res.status(400).json({
        success: false,
        error: 'Campaign ID is required'
      });
    }

    logger.info('Fetching campaign insights:', { campaignId });
    
    const insights = await facebookAdsService.getCampaignInsights(campaignId);
    
    res.json({
      success: true,
      data: insights
    });

  } catch (error) {
    logger.error('Error in GET /campaigns/:campaignId/insights:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PUT /api/facebook-ads/campaigns/:campaignId/status
 * Update campaign status
 */
router.put('/campaigns/:campaignId/status', async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { status } = req.body;

    if (!campaignId) {
      return res.status(400).json({
        success: false,
        error: 'Campaign ID is required'
      });
    }

    if (!status) {
      return res.status(400).json({
        success: false,
        error: 'Status is required'
      });
    }

    const validStatuses = ['ACTIVE', 'PAUSED', 'DELETED'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Status must be one of: ${validStatuses.join(', ')}`
      });
    }

    logger.info('Updating campaign status:', { campaignId, status });
    
    const result = await facebookAdsService.updateCampaignStatus(campaignId, status);
    
    res.json({
      success: true,
      data: result,
      message: `Campaign status updated to ${status}`
    });

  } catch (error) {
    logger.error('Error in PUT /campaigns/:campaignId/status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/facebook-ads/campaigns/quick-create
 * Quick campaign creation with predefined settings for lead generation
 */
router.post('/campaigns/quick-create', async (req, res) => {
  try {
    const { name, budget } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Campaign name is required'
      });
    }

    // Predefined settings optimized for lead generation
    const campaignData = {
      name: `Lead Gen - ${name}`,
      objective: 'OUTCOME_LEADS',
      status: 'PAUSED', // Start paused for review
      specialAdCategories: []
    };

    logger.info('Creating quick lead generation campaign:', campaignData);
    
    const campaign = await facebookAdsService.createCampaign(campaignData);
    
    res.status(201).json({
      success: true,
      data: campaign,
      message: 'Lead generation campaign created successfully. Remember to set up ad sets and ads before activating.'
    });

  } catch (error) {
    logger.error('Error in POST /campaigns/quick-create:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;