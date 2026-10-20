import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getSql } from '@/lib/db';
import { handle, ok, requireUser, HttpError } from '@/lib/auth';
import { num } from '@/lib/api-utils';
import { creditStatus } from '@/lib/credit';

const paymentSchema = z.object({
  amount: z.number().positive(),
  paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.').nullish(),
  paymentMethod: z.enum(['cash', 'card', 'mobile_money', 'bank_transfer', 'other']).nullish(),
  notes: z.string().trim().max(1000).nullish(),
});

/* Record a part (or final) payment against a credit arrangement. */
export const POST = handle(async (req, ctx) => {
  const user = await requireUser(req, ['admin', 'manager']);
  const { id } = await ctx.params;
  const body = paymentSchema.parse(await req.json());
  const sql = getSql();

  const rows = (await sql`
    SELECT cs.total, cs.due_date::text AS due_date,
           COALESCE((SELECT SUM(amount) FROM credit_payments WHERE credit_sale_id = cs.id), 0) AS paid
      FROM credit_sales cs WHERE cs.id = ${id}
  `) as Record<string, unknown>[];
  const head = rows[0];
  if (!head) throw HttpError.notFound('That credit record no longer exists.');

  const total = num(head.total);
  const paid = num(head.paid);
  const { balance } = creditStatus(total, paid, null);
  if (balance <= 0) {
    throw HttpError.conflict('ALREADY_SETTLED', 'This credit is already fully settled.');
  }
  if (body.amount > balance) {
    throw HttpError.badRequest(
      'OVERPAYMENT',
      `Payment exceeds the outstanding balance of ${balance.toFixed(2)}.`
    );
  }

  const pid = randomUUID();
  await sql`
    INSERT INTO credit_payments (id, credit_sale_id, amount, paid_on, payment_method, notes, received_by)
    VALUES (${pid}, ${id}, ${body.amount}, COALESCE(${body.paidOn ?? null}::date, CURRENT_DATE),
            ${body.paymentMethod ?? null}, ${body.notes ?? null}, ${user.id})
  `;

  const newPaid = Math.round((paid + body.amount) * 100) / 100;
  const state = creditStatus(total, newPaid, (head.due_date as string | null) ?? null);
  return ok(
    {
      id: pid,
      amount: body.amount,
      paidOn: body.paidOn ?? new Date().toISOString().slice(0, 10),
      paid: newPaid,
      balance: state.balance,
      status: state.status,
      overdue: state.overdue,
    },
    201
  );
});
