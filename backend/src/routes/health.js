import express from 'express';
import { hubspotClient, hubspotEnabled } from '../config/index.js';
import insforgeDataService from '../services/insforge-data-service.js';
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
      database: 'unknown',
      hubspot: hubspotEnabled ? 'unknown' : 'disabled'
    }
  };

  try {
    // Check database connection
    try {
      await insforgeDataService.getDefaultTenant();
      healthCheck.services.database = 'ok';
    } catch (dbError) {
      healthCheck.services.database = 'error';
      logger.warn('Database health check failed', { error: dbError.message });
    }

    if (hubspotEnabled) {
      try {
        await hubspotClient.crm.contacts.basicApi.getPage(1);
        healthCheck.services.hubspot = 'ok';
      } catch (hubspotError) {
        healthCheck.services.hubspot = 'error';
        logger.warn('HubSpot health check failed', { error: hubspotError.message });
      }
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
      insforge: {
        configured: insforgeDataService.getStatus().hasApiKey
      },
      hubspot: {
        configured: hubspotEnabled
      },
      calendly: {
        configured: !!process.env.CALENDLY_WEBHOOK_SECRET
      }
    }
  };

  try {
    const insforgeStart = Date.now();
    try {
      await insforgeDataService.getDefaultTenant();
      detailedHealth.services.insforge = {
        status: 'ok',
        responseTime: Date.now() - insforgeStart,
      };
    } catch (insforgeError) {
      detailedHealth.services.insforge = {
        status: 'error',
        responseTime: Date.now() - insforgeStart,
        error: insforgeError.message,
      };
    }

    const hubspotStart = Date.now();
    if (!hubspotEnabled) {
      detailedHealth.services.hubspot = {
        status: 'disabled',
        responseTime: 0
      };
    } else {
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
