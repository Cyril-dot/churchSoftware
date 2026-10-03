import { getSql } from '@/lib/db';
import { handle, ok } from '@/lib/auth';

export const GET = handle(async () => {
  const sql = getSql();
  await sql`SELECT 1`;
  return ok({ ok: true, time: new Date().toISOString() });
});
