import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import * as schema from './schema.js';
import { getRuntimeConfig } from '../utils/runtime-config.js';

// Load environment variables
dotenv.config();

const runtimeConfig = getRuntimeConfig();
const directDatabaseUrl = runtimeConfig.databaseUrl;
const directDatabaseMissingMessage =
  'Direct Postgres DATABASE_URL is not configured. This project is linked to InsForge; migrate this code path to the InsForge SDK/data service or set INSFORGE_DATABASE_URL/DATABASE_URL for legacy Drizzle access.';

// Create PostgreSQL connection pool only when a direct Postgres URL is available.
// InsForge cloud projects may expose database access through the SDK/API instead
// of a direct DATABASE_URL, so importing the backend must not crash at startup.
const pool = directDatabaseUrl
  ? new Pool({
      connectionString: directDatabaseUrl,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      query_timeout: 30000,
      statement_timeout: 30000,
    })
  : null;

const unavailableDb = new Proxy(
  {},
  {
    get() {
      throw new Error(directDatabaseMissingMessage);
    },
  }
);

// Create Drizzle database instance when direct Postgres is configured.
export const db = pool ? drizzle(pool, { schema }) : unavailableDb;

// Export the pool for direct access if needed
export { pool };

// Export schema for legacy Drizzle code paths that still use table definitions.
export * from './schema.js';

// Health check function
export async function checkDatabaseConnection() {
  if (!pool) {
    return false;
  }

  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    return true;
  } catch (error) {
    console.error('Database connection failed:', error);
    return false;
  }
}

// Graceful shutdown
export async function closeDatabaseConnection() {
  if (!pool) {
    return;
  }

  try {
    await pool.end();
    console.log('Database connection pool closed');
  } catch (error) {
    console.error('Error closing database connection:', error);
  }
}

// Handle process termination
process.on('SIGINT', async () => {
  await closeDatabaseConnection();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await closeDatabaseConnection();
  process.exit(0);
});
