import { z } from 'zod';
import { getSql } from '@/lib/db';
import { handle, ok, requireUser, HttpError } from '@/lib/auth';

const transferSchema = z.object({
  quantity: z.number().int().min(1),
  from: z.enum(['warehouse', 'shop']),
  to: z.enum(['warehouse', 'shop']),
  notes: z.string().trim().max(1000).nullish(),
});

/**
 * Move stock between warehouse and shop.
 * Uses the atomic transfer_stock() database function.
 */
export const POST = handle(async (req, ctx) => {
  const user = await requireUser(req, ['admin', 'manager']);
  const { id } = await ctx.params;
  const body = transferSchema.parse(await req.json());
  if (body.from === body.to) {
    throw HttpError.badRequest('SAME_LOCATION', 'Pick two different locations.');
  }

  const sql = getSql();
  try {
    await sql`SELECT transfer_stock(${id}, ${user.id}, ${body.quantity}, ${body.from}, ${body.to}, ${body.notes ?? null})`;
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    if (msg.includes('INSUFFICIENT_STOCK')) {
      throw HttpError.badRequest('INSUFFICIENT_STOCK', `Not enough stock in the ${body.from}.`);
    }
    if (msg.includes('ITEM_NOT_FOUND')) throw HttpError.notFound('That product no longer exists.');
    if (msg.includes('SAME_LOCATION') || msg.includes('INVALID')) {
      throw HttpError.badRequest('INVALID_TRANSFER', 'That transfer is not valid.');
    }
    throw e;
  }
  return ok({ transferred: body.quantity, from: body.from, to: body.to });
});
