import { createClient } from '@supabase/supabase-js';
import { Client as HubSpotClient } from '@hubspot/api-client';
import dotenv from 'dotenv';
import logger from '../utils/logger.js';

dotenv.config();

// Validate required environment variables (warn in development, error in production)
const requiredVars = [
  'FACEBOOK_APP_SECRET',
  'FACEBOOK_VERIFY_TOKEN',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
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

// Supabase client configuration
export const supabase = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )
  : null;

// HubSpot client configuration
export const hubspotClient = process.env.HUBSPOT_ACCESS_TOKEN
  ? new HubSpotClient({
      accessToken: process.env.HUBSPOT_ACCESS_TOKEN
    })
  : null;



// Facebook configuration
export const facebookConfig = {
  appSecret: process.env.FACEBOOK_APP_SECRET,
  verifyToken: process.env.FACEBOOK_VERIFY_TOKEN,
  accessToken: process.env.FACEBOOK_ACCESS_TOKEN,
  graphApiUrl: 'https://graph.facebook.com/v18.0'
};



// Calendly configuration
export const calendlyConfig = {
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
  supabase,
  hubspotClient,
  facebookConfig,

  calendlyConfig,
  appConfig
};