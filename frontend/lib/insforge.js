import { createClient } from '@insforge/sdk';

const baseUrl =
  process.env.NEXT_PUBLIC_INSFORGE_URL ||
  process.env.NEXT_PUBLIC_INSFORGE_API_BASE_URL ||
  'https://xb3khrd8.us-east.insforge.app';

const anonKey =
  process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY ||
  process.env.NEXT_PUBLIC_INSFORGE_PUBLIC_KEY ||
  '';

export const insforge = createClient({
  baseUrl,
  ...(anonKey ? { anonKey } : {}),
});

export const insforgeConfig = {
  baseUrl,
  hasAnonKey: Boolean(anonKey),
};

export default insforge;
