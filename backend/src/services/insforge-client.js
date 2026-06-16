import fs from 'fs';
import path from 'path';
import { createClient, createAdminClient } from '@insforge/sdk';
import { getRuntimeConfig } from '../utils/runtime-config.js';

const readSecret = (filePath) => {
  try {
    if (!filePath || !fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath, 'utf8').trim() || null;
  } catch {
    return null;
  }
};

const readLinkedProject = () => {
  const candidates = [
    path.resolve(process.cwd(), '.insforge/project.json'),
    path.resolve(process.cwd(), '../.insforge/project.json'),
    path.resolve(process.cwd(), '../../.insforge/project.json'),
  ];

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        return JSON.parse(fs.readFileSync(candidate, 'utf8'));
      }
    } catch {
      return null;
    }
  }

  return null;
};

const runtimeConfig = getRuntimeConfig();
const linkedProject = readLinkedProject();

const insforgeUrl =
  process.env.INSFORGE_URL ||
  linkedProject?.oss_host ||
  runtimeConfig.insforgeApiBaseUrl ||
  'https://xb3khrd8.us-east.insforge.app';

const anonKey =
  process.env.INSFORGE_ANON_KEY ||
  readSecret(process.env.INSFORGE_ANON_KEY_FILE) ||
  readSecret('/data/.openclaw/secrets/insforge_anon_key');

const apiKey =
  process.env.INSFORGE_API_KEY ||
  readSecret(process.env.INSFORGE_API_KEY_FILE) ||
  readSecret('/data/.openclaw/secrets/insforge_api_key') ||
  linkedProject?.api_key;

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
