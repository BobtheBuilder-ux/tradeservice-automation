import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import * as schema from './schema.js';

// Load environment variables
dotenv.config();

// Validate required environment variables
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

// Create PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 10000, // Return an error after 10 seconds if connection could not be established
  query_timeout: 30000, // Query timeout of 30 seconds
  statement_timeout: 30000, // Statement timeout of 30 seconds
});

// Create Drizzle database instance
export const db = drizzle(pool, { schema });

// Export the pool for direct access if needed
export { pool };

// Export schema for use in other files
export * from './schema.js';

// Health check function
export async function checkDatabaseConnection() {
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