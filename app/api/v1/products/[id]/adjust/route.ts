import { z } from 'zod';
import { getSql } from '@/lib/db';
import { handle, ok, requireUser } from '@/lib/auth';

const adjustSchema = z.object({
  change: z.number().int().refine((v) => v !== 0, 'Change cannot be zero.'),
  type: z.enum(['adjustment', 'damage', 'return']),
  notes: z.string().trim().max(1000).nullish(),
});

export const POST = handle(async (req, ctx) => {
  const user = await requireUser(req, ['admin', 'manager']);
  const { id } = await ctx.params;
  const body = adjustSchema.parse(await req.json());
  const sql = getSql();

  const rows = (await sql`
    SELECT adjust_stock(${id}, ${user.id}, ${body.change}, ${body.type}, ${body.notes ?? null}) AS quantity_on_hand
  `) as { quantity_on_hand: number }[];
  return ok({
    id,
    change: body.change,
    type: body.type,
    quantityOnHand: (rows[0] as { quantity_on_hand: number }).quantity_on_hand,
  });
});
