import express from 'express';
import { supabase, hubspotClient } from '../config/index.js';
import logger from '../utils/logger.js';

const router = express.Router();

/**
 * Health check endpoint
 * GET /health
 */
router.get('/', async (req, res) => {
  const healthCheck = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.0',
    services: {
      supabase: 'unknown',
      hubspot: 'unknown',
  
    }
  };

  try {
    // Check Supabase connection
    const { error: supabaseError } = await supabase
      .from('leads')
      .select('count', { count: 'exact', head: true })
      .limit(1);
    
    healthCheck.services.supabase = supabaseError ? 'error' : 'ok';

    // Check HubSpot connection
    try {
      await hubspotClient.crm.contacts.basicApi.getPage(1);
      healthCheck.services.hubspot = 'ok';
    } catch (hubspotError) {
      healthCheck.services.hubspot = 'error';
      logger.warn('HubSpot health check failed', { error: hubspotError.message });
    }

    // Determine overall status
    const hasErrors = Object.values(healthCheck.services).includes('error');
    if (hasErrors) {
      healthCheck.status = 'degraded';
      res.status(503);
    }

    res.json(healthCheck);

  } catch (error) {
    logger.logError(error, { context: 'health_check' });
    
    healthCheck.status = 'error';
    healthCheck.error = error.message;
    
    res.status(503).json(healthCheck);
  }
});

/**
 * Detailed health check endpoint
 * GET /health/detailed
 */
router.get('/detailed', async (req, res) => {
  const detailedHealth = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.0',
    services: {},
    configuration: {
      facebook: {
        configured: !!(process.env.FACEBOOK_APP_SECRET && process.env.FACEBOOK_VERIFY_TOKEN)
      },
      supabase: {
        configured: !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
      },
      hubspot: {
        configured: !!process.env.HUBSPOT_API_KEY
      },
      calendly: {
        configured: !!process.env.CALENDLY_WEBHOOK_SECRET
      }
    }
  };

  try {
    // Test Supabase connection with more details
    const supabaseStart = Date.now();
    const { data: supabaseData, error: supabaseError } = await supabase
      .from('leads')
      .select('count', { count: 'exact', head: true })
      .limit(1);
    
    detailedHealth.services.supabase = {
      status: supabaseError ? 'error' : 'ok',
      responseTime: Date.now() - supabaseStart,
      error: supabaseError?.message
    };

    // Test HubSpot connection with more details
    const hubspotStart = Date.now();
    try {
      await hubspotClient.crm.contacts.basicApi.getPage(1);
      detailedHealth.services.hubspot = {
        status: 'ok',
        responseTime: Date.now() - hubspotStart
      };
    } catch (hubspotError) {
      detailedHealth.services.hubspot = {
        status: 'error',
        responseTime: Date.now() - hubspotStart,
        error: hubspotError.message
      };
    }

    // Determine overall status
    const hasErrors = Object.values(detailedHealth.services)
      .some(service => service.status === 'error');
    
    if (hasErrors) {
      detailedHealth.status = 'degraded';
      res.status(503);
    }

    res.json(detailedHealth);

  } catch (error) {
    logger.logError(error, { context: 'detailed_health_check' });
    
    detailedHealth.status = 'error';
    detailedHealth.error = error.message;
    
    res.status(503).json(detailedHealth);
  }
});

export default router;