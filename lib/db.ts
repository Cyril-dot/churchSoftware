import { neon } from '@neondatabase/serverless';

// Lazy client — only created when DATABASE_URL is set.
// When unset (e.g. local preview without a DB), API routes return a
// clear "not configured" error instead of crashing at import time.
let _sql: ReturnType<typeof neon> | null = null;

export function getSql() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Connect a Neon database (Vercel → Storage → Neon) or set DATABASE_URL locally.'
    );
  }
  if (!_sql) _sql = neon(url);
  return _sql;
}

export function isDbConfigured() {
  return !!process.env.DATABASE_URL;
}
