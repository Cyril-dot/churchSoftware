/**
 * Versioned migration runner.
 * Uses `pg` over DATABASE_URL_UNPOOLED (direct TCP — runs on your laptop or
 * Vercel's build machine, NOT inside a serverless function).
 *
 * Usage: npm run db:migrate
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '..', 'db', 'migrations');

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) {
    console.error('Set DATABASE_URL_UNPOOLED (or DATABASE_URL) to run migrations.');
    process.exit(1);
  }

  const client = new Client({ connectionString: url });
  await client.connect();

  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const { rows } = await client.query('SELECT name FROM schema_migrations');
  const applied = new Set(rows.map((r: any) => r.name));

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`  ✓ ${file} (already applied)`);
      continue;
    }
    console.log(`  → ${file} ...`);
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`  ✓ ${file} applied`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
  }

  await client.end();
  console.log('Migrations complete.');
}

main().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
