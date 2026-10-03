import { getSql } from '@/lib/db';
import { handle, ok, requireUser, HttpError } from '@/lib/auth';

export const POST = handle(async (req, ctx) => {
  await requireUser(req, ['admin', 'manager']);
  const { id } = await ctx.params;
  const sql = getSql();
  const rows = (await sql`
    UPDATE products SET active = true, updated_at = NOW()
    WHERE id = ${id} AND NOT active
    RETURNING id
  `) as { id: string }[];
  if (!rows[0]) throw HttpError.notFound('That product no longer exists or is already active.');
  return ok({ id, restored: true });
});
