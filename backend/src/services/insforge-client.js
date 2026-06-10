import fs from 'fs';
import { createClient, createAdminClient } from '@insforge/sdk';
import { getRuntimeConfig } from '../utils/runtime-config.js';

const readSecret = (path) => {
  try {
    if (!path || !fs.existsSync(path)) return null;
    return fs.readFileSync(path, 'utf8').trim() || null;
  } catch {
    return null;
  }
};

const runtimeConfig = getRuntimeConfig();

const insforgeUrl =
  process.env.INSFORGE_URL ||
  runtimeConfig.insforgeApiBaseUrl ||
  'https://xb3khrd8.us-east.insforge.app';

const anonKey =
  process.env.INSFORGE_ANON_KEY ||
  readSecret(process.env.INSFORGE_ANON_KEY_FILE) ||
  readSecret('/data/.openclaw/secrets/insforge_anon_key');

const apiKey =
  process.env.INSFORGE_API_KEY ||
  readSecret(process.env.INSFORGE_API_KEY_FILE) ||
  readSecret('/data/.openclaw/secrets/insforge_api_key');

export const insforge = createClient({
  baseUrl: insforgeUrl,
  ...(anonKey ? { anonKey } : {}),
});

export const insforgeAdmin = apiKey
  ? createAdminClient({
      baseUrl: insforgeUrl,
      apiKey,
    })
  : null;

export const insforgeClientConfig = {
  baseUrl: insforgeUrl,
  hasAnonKey: Boolean(anonKey),
  hasApiKey: Boolean(apiKey),
};

export default insforge;
