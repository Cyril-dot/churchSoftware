import { getSql } from '@/lib/db';
import { handle, ok, requireUser, HttpError } from '@/lib/auth';
import { getReceipt } from '@/lib/receipt';

export const GET = handle(async (req, ctx) => {
  const user = await requireUser(req);
  const { id } = await ctx.params;
  const sql = getSql();

  if (user.role === 'cashier') {
    const own = (await sql`SELECT id FROM sales WHERE id = ${id} AND sold_by = ${user.id}`) as {
      id: string;
    }[];
    if (!own[0]) throw HttpError.notFound('That sale no longer exists.');
  }

  const receipt = await getReceipt(sql, id, user.role !== 'cashier');
  if (!receipt) throw HttpError.notFound('That sale no longer exists.');
  return ok(receipt);
});
