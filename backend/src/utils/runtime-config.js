import fs from 'fs';

const readSecretFile = (path) => {
  try {
    if (!path || !fs.existsSync(path)) return null;
    return fs.readFileSync(path, 'utf8').trim() || null;
  } catch {
    return null;
  }
};

export const getRuntimeConfig = () => {
  const insforgeDatabaseUrl =
    process.env.INSFORGE_DATABASE_URL ||
    readSecretFile(process.env.INSFORGE_DATABASE_URL_FILE) ||
    readSecretFile('/data/.openclaw/secrets/insforge_database_url');

  const databaseUrl =
    process.env.DATABASE_URL ||
    insforgeDatabaseUrl ||
    readSecretFile(process.env.DATABASE_URL_FILE);

  const insforgeApiBaseUrl =
    process.env.INSFORGE_API_BASE_URL ||
    process.env.INSFORGE_URL ||
    process.env.NEXT_PUBLIC_INSFORGE_API_BASE_URL ||
    'https://xb3khrd8.us-east.insforge.app';

  return {
    databaseUrl,
    insforgeDatabaseUrl,
    insforgeApiBaseUrl,
  };
};

export default getRuntimeConfig;
