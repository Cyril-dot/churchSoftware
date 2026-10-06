import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getSql } from '@/lib/db';
import { handle, ok, requireUser } from '@/lib/auth';
import { num } from '@/lib/api-utils';

function toCashout(r: Record<string, unknown>) {
  return {
    id: r.id as string,
    referenceNumber: r.reference_number as string,
    amount: num(r.amount),
    cashedAt: r.cashed_at as string,
    cashedBy: r.cashed_by as string,
    cashedByName: r.cashed_by_name as string | null,
    notes: r.notes as string | null,
    createdAt: r.created_at as string,
  };
}

export const GET = handle(async (req) => {
  await requireUser(req, ['admin', 'manager']);
  const sp = req.nextUrl.searchParams;
  const limit = Math.min(100, Math.max(1, parseInt(sp.get('limit') || '50', 10) || 50));
  const sql = getSql();

  const rows = (await sql`
    SELECT c.id, c.reference_number, c.amount, c.cashed_at,
           c.cashed_by, u.name AS cashed_by_name, c.notes, c.created_at
      FROM cashouts c
      LEFT JOIN users u ON u.id = c.cashed_by
     ORDER BY c.created_at DESC, c.id DESC
     LIMIT ${limit}
  `) as Record<string, unknown>[];
  return ok({ items: rows.map(toCashout), nextCursor: null });
});

const createCashoutSchema = z.object({
  amount: z.number().positive(),
  cashedAt: z.string().datetime().nullish(),
  notes: z.string().trim().max(2000).nullish(),
});

// Admin records cash taken out of the till.
export const POST = handle(async (req) => {
  const user = await requireUser(req, ['admin']);
  const body = createCashoutSchema.parse(await req.json());
  const sql = getSql();

  const id = randomUUID();
  const refRows = (await sql`SELECT 'C-' || lpad(nextval('cashout_seq')::text, 6, '0') AS ref`) as {
    ref: string;
  }[];
  const reference = refRows[0].ref;

  await sql`
    INSERT INTO cashouts (id, reference_number, amount, cashed_at, cashed_by, notes)
    VALUES (${id}, ${reference}, ${body.amount},
            COALESCE(${body.cashedAt ?? null}::timestamptz, NOW()), ${user.id}, ${body.notes ?? null})
  `;

  const rows = (await sql`
    SELECT c.id, c.reference_number, c.amount, c.cashed_at,
           c.cashed_by, u.name AS cashed_by_name, c.notes, c.created_at
      FROM cashouts c
      LEFT JOIN users u ON u.id = c.cashed_by
     WHERE c.id = ${id}
  `) as Record<string, unknown>[];
  return ok({ cashout: toCashout(rows[0]) }, 201);
});
