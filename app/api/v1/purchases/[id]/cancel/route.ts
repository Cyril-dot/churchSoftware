import { getSql } from '@/lib/db';
import { handle, ok, requireUser, HttpError } from '@/lib/auth';

export const POST = handle(async (req, ctx) => {
  await requireUser(req, ['admin', 'manager']);
  const { id } = await ctx.params;
  const sql = getSql();
  const rows = (await sql`
    UPDATE purchases
    SET status = 'cancelled', cancelled_at = NOW()
    WHERE id = ${id} AND status IN ('draft', 'ordered')
    RETURNING id
  `) as { id: string }[];
  if (!rows[0]) {
    throw HttpError.conflict(
      'NOT_CANCELLABLE',
      'Only draft or ordered purchase orders can be cancelled.'
    );
  }
  return ok({ id, cancelled: true });
});
