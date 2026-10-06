import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getSql } from '@/lib/db';
import { handle, ok, requireUser, HttpError } from '@/lib/auth';
import { num } from '@/lib/api-utils';

const EntrySchema = z.object({
  entryType: z.enum(['top_up', 'withdrawal', 'set_balance', 'sale', 'cashout']),
  amount: z.number().min(0),
  reference: z.string().trim().max(100).nullish(),
  notes: z.string().trim().max(2000).nullish(),
});

function toEntry(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    entryType: row.entry_type as string,
    amount: num(row.amount),
    balanceAfter: num(row.balance_after),
    reference: row.reference as string | null,
    notes: row.notes as string | null,
    createdBy: row.created_by as string,
    createdByName: row.created_by_name as string | null,
    createdAt: row.created_at as string,
  };
}

// Current MoMo balance + history. Manager/admin only.
export const GET = handle(async (req) => {
  await requireUser(req, ['admin', 'manager']);
  const sql = getSql();

  const latest = (await sql`
    SELECT balance_after FROM momo_entries ORDER BY created_at DESC, id DESC LIMIT 1
  `) as { balance_after: unknown }[];
  const rows = (await sql`
    SELECT e.*, u.name AS created_by_name
    FROM momo_entries e LEFT JOIN users u ON u.id = e.created_by
    ORDER BY e.created_at DESC, e.id DESC LIMIT 100
  `) as Record<string, unknown>[];

  return ok({
    balance: latest.length ? num(latest[0].balance_after) : 0,
    entries: rows.map(toEntry),
  });
});

export const POST = handle(async (req) => {
  const user = await requireUser(req, ['admin', 'manager']);
  const body = EntrySchema.parse(await req.json().catch(() => ({})));
  const sql = getSql();

  const latest = (await sql`
    SELECT balance_after FROM momo_entries ORDER BY created_at DESC, id DESC LIMIT 1
  `) as { balance_after: unknown }[];
  const prev = latest.length ? num(latest[0].balance_after) : 0;

  let next: number;
  switch (body.entryType) {
    case 'top_up':
    case 'sale':
      next = prev + body.amount;
      break;
    case 'withdrawal':
    case 'cashout':
      if (body.amount > prev) {
        throw HttpError.badRequest('INSUFFICIENT', 'Insufficient MoMo balance.');
      }
      next = prev - body.amount;
      break;
    case 'set_balance':
      next = body.amount;
      break;
  }

  const id = randomUUID();
  const rows = (await sql`
    INSERT INTO momo_entries
      (id, entry_type, amount, balance_after, reference, notes, created_by)
    VALUES (${id}, ${body.entryType}, ${body.amount}, ${next},
            ${body.reference ?? null}, ${body.notes ?? null}, ${user.id})
    RETURNING *, (SELECT u.name FROM users u WHERE u.id = ${user.id}) AS created_by_name
  `) as Record<string, unknown>[];

  return ok({ entry: toEntry(rows[0]) }, 201);
});
