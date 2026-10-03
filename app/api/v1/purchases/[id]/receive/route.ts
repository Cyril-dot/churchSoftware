import { getSql } from '@/lib/db';
import { handle, ok, requireUser } from '@/lib/auth';

export const POST = handle(async (req, ctx) => {
  const user = await requireUser(req, ['admin', 'manager']);
  const { id } = await ctx.params;
  const sql = getSql();
  await sql`SELECT receive_purchase(${id}, ${user.id})`;
  return ok({ id, received: true });
});
