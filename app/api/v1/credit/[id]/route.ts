import { getSql } from '@/lib/db';
import { handle, ok, requireUser, HttpError } from '@/lib/auth';
import { num } from '@/lib/api-utils';
import { creditStatus } from '@/lib/credit';

/* Credit arrangement detail — header, items taken and payment history. */
export const GET = handle(async (req, ctx) => {
  await requireUser(req, ['admin', 'manager']);
  const { id } = await ctx.params;
  const sql = getSql();

  const rows = (await sql`
    SELECT cs.id, cs.reference_number, cs.church_name, cs.contact_name, cs.phone,
           cs.location, cs.taken_on::text AS taken_on, cs.due_date::text AS due_date,
           cs.total, cs.notes, cs.created_by, u.name AS created_by_name, cs.created_at
      FROM credit_sales cs
      JOIN users u ON u.id = cs.created_by
     WHERE cs.id = ${id}
  `) as Record<string, unknown>[];
  const head = rows[0];
  if (!head) throw HttpError.notFound('That credit record no longer exists.');

  const items = (await sql`
    SELECT i.id, i.product_id, p.name AS product_name, p.sku, i.quantity, i.unit_price
      FROM credit_sale_items i
      JOIN products p ON p.id = i.product_id
     WHERE i.credit_sale_id = ${id}
     ORDER BY p.name ASC
  `) as Record<string, unknown>[];

  const payments = (await sql`
    SELECT cp.id, cp.amount, cp.paid_on::text AS paid_on, cp.payment_method, cp.notes,
           cp.received_by, u.name AS received_by_name, cp.created_at
      FROM credit_payments cp
      JOIN users u ON u.id = cp.received_by
     WHERE cp.credit_sale_id = ${id}
     ORDER BY cp.paid_on ASC, cp.created_at ASC
  `) as Record<string, unknown>[];

  const total = num(head.total);
  const paid = payments.reduce((s, p) => s + num(p.amount), 0);
  const dueDate = (head.due_date as string | null) ?? null;
  const { balance, status, overdue } = creditStatus(total, paid, dueDate);

  return ok({
    id: head.id as string,
    referenceNumber: head.reference_number as string,
    churchName: head.church_name as string,
    contactName: head.contact_name as string,
    phone: head.phone as string | null,
    location: head.location as string | null,
    takenOn: head.taken_on as string,
    dueDate,
    total,
    paid,
    balance,
    status,
    overdue,
    notes: head.notes as string | null,
    createdBy: head.created_by as string,
    createdByName: head.created_by_name as string | null,
    createdAt: head.created_at as string,
    items: items.map((i) => ({
      id: i.id as string,
      productId: i.product_id as string,
      productName: i.product_name as string,
      sku: i.sku as string | null,
      quantity: i.quantity as number,
      unitPrice: num(i.unit_price),
      lineTotal: num(i.unit_price) * (i.quantity as number),
    })),
    payments: payments.map((p) => ({
      id: p.id as string,
      amount: num(p.amount),
      paidOn: p.paid_on as string,
      paymentMethod: p.payment_method as string | null,
      notes: p.notes as string | null,
      receivedBy: p.received_by as string,
      receivedByName: p.received_by_name as string | null,
      createdAt: p.created_at as string,
    })),
  });
});
