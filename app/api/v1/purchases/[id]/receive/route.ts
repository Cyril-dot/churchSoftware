import { randomUUID } from 'node:crypto';
import { getSql } from '@/lib/db';
import { handle, ok, requireUser } from '@/lib/auth';
import { num } from '@/lib/api-utils';

type Sql = ReturnType<typeof getSql>;

/*
 * After goods are received, automatically deduct the purchase total from the
 * balance it was paid from:
 *   cash → a cashouts entry (money out of the till)
 *   momo → a momo_entries withdrawal
 * The note references the purchase / supplier invoice number so the deduction
 * is easy to trace. Guarded twice against double-deduction: receive_purchase()
 * raises when the purchase is not receivable (so a second receive never gets
 * here), and payment_deducted_at is only set once.
 */
async function deductPurchasePayment(sql: Sql, purchaseId: string, userId: string) {
  const rows = (await sql`
    SELECT p.reference_number, p.invoice_number, p.payment_method, p.payment_deducted_at,
           COALESCE((SELECT SUM(quantity_ordered * unit_cost) FROM purchase_items
                      WHERE purchase_id = p.id), 0) AS total
      FROM purchases p WHERE p.id = ${purchaseId}
  `) as Record<string, unknown>[];
  const p = rows[0];
  if (!p || p.payment_deducted_at) return { deducted: false, method: null as string | null, amount: 0 };

  const total = num(p.total);
  const method = (p.payment_method as string) ?? 'cash';
  if (total <= 0) {
    await sql`UPDATE purchases SET payment_deducted_at = NOW() WHERE id = ${purchaseId}`;
    return { deducted: false, method, amount: 0 };
  }

  const label = `Purchase ${p.reference_number as string}${
    p.invoice_number ? ` (Invoice ${p.invoice_number as string})` : ''
  }`;

  if (method === 'momo') {
    const latest = (await sql`
      SELECT balance_after FROM momo_entries ORDER BY created_at DESC, id DESC LIMIT 1
    `) as { balance_after: unknown }[];
    const prev = latest.length ? num(latest[0].balance_after) : 0;
    let next = Math.round((prev - total) * 100) / 100;
    let notes = `Payment for ${label} — auto-deducted on receive.`;
    if (next < 0) {
      notes += ` MoMo balance was only ${prev.toFixed(2)}; shortfall of ${Math.abs(next).toFixed(2)} not covered.`;
      next = 0;
    }
    await sql`
      INSERT INTO momo_entries (id, entry_type, amount, balance_after, reference, notes, created_by)
      VALUES (${randomUUID()}, 'withdrawal', ${total}, ${next},
              ${p.reference_number as string}, ${notes}, ${userId})
    `;
  } else {
    const refRows = (await sql`SELECT 'C-' || lpad(nextval('cashout_seq')::text, 6, '0') AS ref`) as {
      ref: string;
    }[];
    await sql`
      INSERT INTO cashouts (id, reference_number, amount, cashed_at, cashed_by, notes)
      VALUES (${randomUUID()}, ${refRows[0].ref}, ${total}, NOW(), ${userId},
              ${`Payment for ${label} — auto-deducted on receive.`})
    `;
  }

  await sql`UPDATE purchases SET payment_deducted_at = NOW() WHERE id = ${purchaseId}`;
  return { deducted: true, method, amount: total };
}

export const POST = handle(async (req, ctx) => {
  const user = await requireUser(req, ['admin', 'manager']);
  const { id } = await ctx.params;
  const sql = getSql();
  await sql`SELECT receive_purchase(${id}, ${user.id})`;

  let payment: { deducted: boolean; method: string | null; amount: number } = {
    deducted: false,
    method: null,
    amount: 0,
  };
  try {
    payment = await deductPurchasePayment(sql, id, user.id);
  } catch (err) {
    // Goods are received; never fail the request because the ledger
    // deduction hit a problem — surface it in the response instead.
    console.error('Purchase payment auto-deduction failed:', err);
  }
  return ok({ id, received: true, paymentDeducted: payment.deducted, paymentMethod: payment.method, paymentAmount: payment.amount });
});
