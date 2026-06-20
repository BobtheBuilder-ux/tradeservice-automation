import { Client as HubSpotClient } from '@hubspot/api-client';
import dotenv from 'dotenv';
import logger from '../utils/logger.js';
import { insforgeClientConfig } from '../services/insforge-client.js';
import { getRuntimeConfig } from '../utils/runtime-config.js';

dotenv.config();

const runtimeConfig = getRuntimeConfig();
export const hubspotEnabled = process.env.HUBSPOT_ENABLED === 'true' && Boolean(process.env.HUBSPOT_ACCESS_TOKEN);
export const automatedEmailWorkflowEnabled =
  process.env.AUTOMATED_EMAIL_WORKFLOW_ENABLED === 'true' && hubspotEnabled;

// Validate required environment variables (warn in development, error in production)
const missingVars = [];
if (!insforgeClientConfig.hasApiKey) {
  missingVars.push('INSFORGE_API_KEY');
}
if (process.env.HUBSPOT_ENABLED === 'true' && !process.env.HUBSPOT_ACCESS_TOKEN) {
  missingVars.push('HUBSPOT_ACCESS_TOKEN');
}
if (missingVars.length > 0) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
  } else {
    logger.warn(`Missing environment variables (development mode): ${missingVars.join(', ')}`);
  }
}

// HubSpot client configuration
export const hubspotClient = hubspotEnabled
  ? new HubSpotClient({
      accessToken: process.env.HUBSPOT_ACCESS_TOKEN
    })
  : null;




// Calendly configuration
export const calendlyConfig = {
  clientId: process.env.CALENDLY_CLIENT_ID,
  clientSecret: process.env.CALENDLY_CLIENT_SECRET,
  webhookSecret: process.env.CALENDLY_WEBHOOK_SECRET,
  apiToken: process.env.CALENDLY_API_TOKEN,
  // API configuration for webhook registration
  personalAccessToken: process.env.CALENDLY_PERSONAL_ACCESS_TOKEN,
  organizationUri: process.env.CALENDLY_ORGANIZATION_URI,
  webhookSigningKey: process.env.CALENDLY_WEBHOOK_SIGNING_KEY,
  schedulingUrl: process.env.CALENDLY_SCHEDULING_URL
};

// Application configuration
export const appConfig = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
  insforgeApiBaseUrl: runtimeConfig.insforgeApiBaseUrl,
  hubspotEnabled,
  automatedEmailWorkflowEnabled
};

export default {
  hubspotClient,
  calendlyConfig,
  appConfig
};
