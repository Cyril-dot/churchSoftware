import { getSql } from '@/lib/db';
import { handle, ok, requireUser, HttpError } from '@/lib/auth';

/* Mark a pending delivery order as delivered. Stock was already deducted
   from the warehouse when the order was created. */
export const POST = handle(async (req, ctx) => {
  const user = await requireUser(req, ['admin', 'manager']);
  const { id } = await ctx.params;
  const sql = getSql();

  const updated = (await sql`
    UPDATE delivery_orders
       SET status = 'delivered', delivered_at = NOW(), delivered_by = ${user.id}
     WHERE id = ${id} AND status = 'pending'
     RETURNING id
  `) as { id: string }[];
  if (!updated[0]) {
    const exists = (await sql`SELECT id, status FROM delivery_orders WHERE id = ${id}`) as {
      id: string;
      status: string;
    }[];
    if (!exists[0]) throw HttpError.notFound('That delivery order no longer exists.');
    throw HttpError.conflict('ALREADY_DELIVERED', 'This order has already been marked delivered.');
  }
  return ok({ id, delivered: true });
});
