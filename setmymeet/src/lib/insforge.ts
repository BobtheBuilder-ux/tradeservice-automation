import { createClient } from '@insforge/sdk';

import { requireEnv } from './env';

let cachedClient: ReturnType<typeof createClient> | null = null;

export function getInsForgeClient() {
  if (cachedClient) return cachedClient;

  cachedClient = createClient({
    baseUrl: requireEnv('NEXT_PUBLIC_INSFORGE_BASE_URL'),
    anonKey: requireEnv('NEXT_PUBLIC_INSFORGE_ANON_KEY'),
  });

  return cachedClient;
}

