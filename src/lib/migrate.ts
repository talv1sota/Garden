// Run once: npx tsx src/lib/migrate.ts
import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('DATABASE_URL not set'); process.exit(1); }

const sql = neon(DATABASE_URL);

async function migrate() {
  // Users table — bcrypt-hashed passwords, never plaintext
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  // Gardens table — one per user, state stored as JSONB
  await sql`
    CREATE TABLE IF NOT EXISTS gardens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL DEFAULT 'My Garden',
      state JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, name)
    )
  `;

  // Index for fast lookup by user
  await sql`
    CREATE INDEX IF NOT EXISTS idx_gardens_user_id ON gardens(user_id)
  `;

  console.log('Migration complete.');
}

migrate().catch(e => { console.error(e); process.exit(1); });
