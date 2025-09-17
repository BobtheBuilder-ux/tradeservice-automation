import { Client as HubSpotClient } from '@hubspot/api-client';
import dotenv from 'dotenv';
import logger from '../utils/logger.js';
import { db, checkDatabaseConnection } from '../db/connection.js';

dotenv.config();

// Validate required environment variables (warn in development, error in production)
const requiredVars = [
  'DATABASE_URL',
  'HUBSPOT_ACCESS_TOKEN'
];

const missingVars = requiredVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
  } else {
    logger.warn(`Missing environment variables (development mode): ${missingVars.join(', ')}`);
  }
}

// Database connection (Drizzle)
export { db };
export { checkDatabaseConnection };

// HubSpot client configuration
export const hubspotClient = process.env.HUBSPOT_ACCESS_TOKEN
  ? new HubSpotClient({
      accessToken: process.env.HUBSPOT_ACCESS_TOKEN
    })
  : null;




// Calendly configuration
export const calendlyConfig = {
  clientId: process.env.CALENDLY_CLIENT_ID,
  clientSecret: process.env.CALENDLY_CLIENT_SECRET,
  webhookSecret: process.env.CALENDLY_WEBHOOK_SECRET,
  apiToken: process.env.CALENDLY_API_TOKEN
};

// Application configuration
export const appConfig = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info'
};

export default {
  db,
  hubspotClient,
  calendlyConfig,
  appConfig
};