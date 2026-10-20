import { getSql } from '@/lib/db';
import { handle, ok, requireUser, HttpError } from '@/lib/auth';

export const POST = handle(async (req, ctx) => {
  await requireUser(req, ['admin', 'manager']);
  const { id } = await ctx.params;
  const sql = getSql();
  const rows = (await sql`
    UPDATE purchases
    SET status = 'ordered', ordered_at = NOW()
    WHERE id = ${id} AND status = 'draft'
    RETURNING id
  `) as { id: string }[];
  if (!rows[0]) {
    throw HttpError.conflict(
      'NOT_ORDERABLE',
      'Only draft purchase orders can be marked as ordered.'
    );
  }
  return ok({ id, ordered: true });
});
