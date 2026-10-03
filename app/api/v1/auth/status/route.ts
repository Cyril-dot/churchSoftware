import { getSql } from '@/lib/db';
import { handle, ok } from '@/lib/auth';

export const GET = handle(async () => {
  const sql = getSql();
  const rows = (await sql`
    SELECT COUNT(*)::int AS count FROM users WHERE role = 'admin' AND active
  `) as { count: number }[];
  return ok({ needsSetup: (rows[0] as { count: number }).count === 0 });
});
