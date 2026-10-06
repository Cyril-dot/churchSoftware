import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getSql } from '@/lib/db';
import { handle, ok, requireUser, HttpError } from '@/lib/auth';
import { num } from '@/lib/api-utils';

function toAccount(r: Record<string, unknown>) {
  return {
    id: r.id as string,
    name: r.name as string,
    bankName: r.bank_name as string | null,
    accountNumber: r.account_number as string | null,
    active: r.active as boolean,
    totalDeposited: num(r.total_deposited),
    depositCount: (r.deposit_count as number) ?? 0,
    lastDepositOn: r.last_deposit_on as string | null,
    createdAt: r.created_at as string,
  };
}

export const GET = handle(async (req) => {
  const user = await requireUser(req, ['admin', 'manager']);
  const sql = getSql();
  const rows = (await sql`
    SELECT a.id, a.name, a.bank_name, a.account_number, a.active, a.created_at,
           COALESCE(SUM(d.amount), 0) AS total_deposited,
           COUNT(d.id)::int AS deposit_count,
           MAX(d.deposited_on)::text AS last_deposit_on
      FROM deposit_accounts a
      LEFT JOIN deposits d ON d.deposit_account_id = a.id
     WHERE a.active
     GROUP BY a.id
     ORDER BY a.created_at ASC
  `) as Record<string, unknown>[];
  return ok({ items: rows.map(toAccount) });
});

const createAccountSchema = z.object({
  name: z.string().trim().min(1).max(200),
  bankName: z.string().trim().max(200).nullish(),
  accountNumber: z.string().trim().max(100).nullish(),
});

export const POST = handle(async (req) => {
  await requireUser(req, ['admin']);
  const body = createAccountSchema.parse(await req.json());
  const sql = getSql();
  const id = randomUUID();
  await sql`
    INSERT INTO deposit_accounts (id, name, bank_name, account_number)
    VALUES (${id}, ${body.name}, ${body.bankName ?? null}, ${body.accountNumber ?? null})
  `;
  const rows = (await sql`
    SELECT a.id, a.name, a.bank_name, a.account_number, a.active, a.created_at,
           0 AS total_deposited, 0 AS deposit_count, NULL::text AS last_deposit_on
      FROM deposit_accounts a WHERE a.id = ${id}
  `) as Record<string, unknown>[];
  return ok(toAccount(rows[0]), 201);
});
