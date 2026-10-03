import { z } from 'zod';
import { getSql } from '@/lib/db';
import { handle, ok, requireUser } from '@/lib/auth';
import { getReceipt } from '@/lib/receipt';

const voidSchema = z.object({
  reason: z.string().trim().min(1).max(1000),
});

export const POST = handle(async (req, ctx) => {
  const user = await requireUser(req, ['admin', 'manager']);
  const { id } = await ctx.params;
  const body = voidSchema.parse(await req.json());
  const sql = getSql();

  await sql`SELECT void_sale(${id}, ${user.id}, ${body.reason})`;
  await sql`
    INSERT INTO audit_log (actor_id, action, entity_type, entity_id, details)
    VALUES (${user.id}, 'sale.void', 'sale', ${id}, ${JSON.stringify({ reason: body.reason })}::jsonb)
  `;

  const receipt = await getReceipt(sql, id, true);
  return ok(receipt);
});
