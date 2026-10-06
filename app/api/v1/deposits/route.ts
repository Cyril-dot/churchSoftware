import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getSql } from '@/lib/db';
import { handle, ok, requireUser, HttpError } from '@/lib/auth';
import { num } from '@/lib/api-utils';

function toDeposit(r: Record<string, unknown>) {
  return {
    id: r.id as string,
    referenceNumber: r.reference_number as string,
    depositAccountId: r.deposit_account_id as string,
    depositAccountName: r.deposit_account_name as string,
    amount: num(r.amount),
    depositedOn: r.deposited_on as string,
    depositedBy: r.deposited_by as string,
    depositedByName: r.deposited_by_name as string | null,
    notes: r.notes as string | null,
    createdAt: r.created_at as string,
  };
}

export const GET = handle(async (req) => {
  await requireUser(req, ['admin', 'manager']);
  const sp = req.nextUrl.searchParams;
  const limit = Math.min(100, Math.max(1, parseInt(sp.get('limit') || '50', 10) || 50));
  const accountId = sp.get('accountId') || null;

  const sql = getSql();
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (accountId) {
    params.push(accountId);
    conditions.push(`d.deposit_account_id = $${params.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit);

  const rows = (await sql.query(
    `SELECT d.id, d.reference_number, d.deposit_account_id, a.name AS deposit_account_name,
            d.amount, d.deposited_on::text AS deposited_on, d.deposited_by, u.name AS deposited_by_name,
            d.notes, d.created_at
       FROM deposits d
       JOIN deposit_accounts a ON a.id = d.deposit_account_id
       JOIN users u ON u.id = d.deposited_by
      ${where}
      ORDER BY d.created_at DESC, d.id DESC
      LIMIT $${params.length}`,
    params
  )) as Record<string, unknown>[];
  return ok({ items: rows.map(toDeposit), nextCursor: null });
});

const createDepositSchema = z.object({
  depositAccountId: z.string().uuid(),
  amount: z.number().positive(),
  depositedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.').nullish(),
  notes: z.string().trim().max(1000).nullish(),
});

export const POST = handle(async (req) => {
  const user = await requireUser(req, ['admin', 'manager']);
  const body = createDepositSchema.parse(await req.json());
  const sql = getSql();

  const acct = (await sql`SELECT id FROM deposit_accounts WHERE id = ${body.depositAccountId} AND active`) as {
    id: string;
  }[];
  if (!acct[0]) throw HttpError.badRequest('INVALID_ACCOUNT', 'That deposit account does not exist.');

  const id = randomUUID();
  const refRows = (await sql`SELECT 'D-' || lpad(nextval('deposit_seq')::text, 6, '0') AS ref`) as {
    ref: string;
  }[];
  const reference = refRows[0].ref;

  await sql`
    INSERT INTO deposits (id, reference_number, deposit_account_id, amount, deposited_on, deposited_by, notes)
    VALUES (${id}, ${reference}, ${body.depositAccountId}, ${body.amount},
            COALESCE(${body.depositedOn}::date, CURRENT_DATE), ${user.id}, ${body.notes ?? null})
  `;

  const rows = (await sql`
    SELECT d.id, d.reference_number, d.deposit_account_id, a.name AS deposit_account_name,
           d.amount, d.deposited_on::text, d.deposited_by, u.name AS deposited_by_name,
           d.notes, d.created_at
      FROM deposits d
      JOIN deposit_accounts a ON a.id = d.deposit_account_id
      JOIN users u ON u.id = d.deposited_by
     WHERE d.id = ${id}
  `) as Record<string, unknown>[];
  return ok(toDeposit(rows[0]), 201);
});
