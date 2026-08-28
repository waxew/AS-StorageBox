import pg from 'pg';
import { config } from './config.js';

const { Pool } = pg;

// A single process-wide pool is shared by repositories. Route handlers should
// never construct ad-hoc database connections.
export const db = new Pool({ connectionString: config.DATABASE_URL });

export async function checkDatabase(): Promise<void> {
  await db.query('SELECT 1');
}
