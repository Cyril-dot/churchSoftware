import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getSql } from '@/lib/db';
import { handle, ok, requireUser, HttpError } from '@/lib/auth';
import { num } from '@/lib/api-utils';
import { creditStatus } from '@/lib/credit';

function toCredit(r: Record<string, unknown>) {
  const total = num(r.total);
  const paid = num(r.paid ?? 0);
  const dueDate = (r.due_date as string | null) ?? null;
  const { balance, status, overdue } = creditStatus(total, paid, dueDate);
  return {
    id: r.id as string,
    referenceNumber: r.reference_number as string,
    churchName: r.church_name as string,
    contactName: r.contact_name as string,
    phone: r.phone as string | null,
    location: r.location as string | null,
    takenOn: r.taken_on as string,
    dueDate,
    total,
    paid,
    balance,
    status,
    overdue,
    notes: r.notes as string | null,
    itemCount: Number(r.item_count ?? 0),
    createdBy: r.created_by as string,
    createdByName: r.created_by_name as string | null,
    createdAt: r.created_at as string,
  };
}

const CREDIT_COLS = `
  SELECT cs.id, cs.reference_number, cs.church_name, cs.contact_name, cs.phone,
         cs.location, cs.taken_on::text AS taken_on, cs.due_date::text AS due_date,
         cs.total, cs.notes, cs.created_by, u.name AS created_by_name, cs.created_at,
         COALESCE((SELECT SUM(amount) FROM credit_payments WHERE credit_sale_id = cs.id), 0) AS paid,
         (SELECT COUNT(*)::int FROM credit_sale_items WHERE credit_sale_id = cs.id) AS item_count
    FROM credit_sales cs
    JOIN users u ON u.id = cs.created_by
`;

/* List credit arrangements with balances. ?status=owing|part_paid|settled|overdue */
export const GET = handle(async (req) => {
  await requireUser(req, ['admin', 'manager']);
  const sp = req.nextUrl.searchParams;
  const limit = Math.min(200, Math.max(1, parseInt(sp.get('limit') || '100', 10) || 100));
  const status = sp.get('status');

  const sql = getSql();
  const rows = (await sql.query(
    `${CREDIT_COLS} ORDER BY cs.created_at DESC, cs.id DESC LIMIT $1`,
    [limit]
  )) as Record<string, unknown>[];
  let items = rows.map(toCredit);
  if (status === 'overdue') items = items.filter((i) => i.overdue);
  else if (status) items = items.filter((i) => i.status === status);

  const outstanding = items
    .filter((i) => i.balance > 0)
    .reduce((s, i) => s + i.balance, 0);
  return ok({
    items,
    summary: {
      outstandingCount: items.filter((i) => i.balance > 0).length,
      outstandingTotal: Math.round(outstanding * 100) / 100,
      overdueCount: items.filter((i) => i.overdue).length,
    },
    nextCursor: null,
  });
});

const createCreditSchema = z.object({
  churchName: z.string().trim().min(1).max(300),
  contactName: z.string().trim().min(1).max(300),
  phone: z.string().trim().max(50).nullish(),
  location: z.string().trim().max(200).nullish(),
  takenOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.').nullish(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.').nullish(),
  notes: z.string().trim().max(2000).nullish(),
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: z.number().int().min(1).max(100_000),
        unitPrice: z.number().min(0),
      })
    )
    .min(1)
    .max(500),
});

/*
 * Record a credit sale. Items are deducted from SHOP stock (like a normal
 * sale) at creation; the products CHECK (quantity_shop >= 0) guarantees the
 * transaction can never drive stock negative.
 */
export const POST = handle(async (req) => {
  const user = await requireUser(req, ['admin', 'manager']);
  const body = createCreditSchema.parse(await req.json());
  const sql = getSql();

  const byProduct = new Map<string, { quantity: number; unitPrice: number }>();
  for (const it of body.items) {
    const cur = byProduct.get(it.productId);
    if (cur) cur.quantity += it.quantity;
    else byProduct.set(it.productId, { quantity: it.quantity, unitPrice: it.unitPrice });
  }
  const productIds = [...byProduct.keys()];

  const products = (await sql`
    SELECT id, name, quantity_shop, cost_price FROM products
    WHERE id = ANY(${productIds}::uuid[]) AND active
  `) as { id: string; name: string; quantity_shop: number; cost_price: unknown }[];
  if (products.length !== productIds.length) {
    throw HttpError.badRequest('INVALID_PRODUCT', 'One or more products do not exist.');
  }
  const pmap = new Map(products.map((p) => [p.id, p]));
  for (const [pid, line] of byProduct) {
    const p = pmap.get(pid)!;
    if (p.quantity_shop < line.quantity) {
      throw HttpError.badRequest(
        'INSUFFICIENT_STOCK',
        `Only ${p.quantity_shop} of “${p.name}” in the shop.`
      );
    }
  }

  const total = [...byProduct.values()].reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const id = randomUUID();
  const refRows = (await sql`SELECT 'CR-' || lpad(nextval('credit_seq')::text, 6, '0') AS ref`) as {
    ref: string;
  }[];
  const reference = refRows[0].ref;

  await sql.transaction([
    sql`
      INSERT INTO credit_sales (id, reference_number, church_name, contact_name, phone, location,
                                taken_on, due_date, total, notes, created_by)
      VALUES (${id}, ${reference}, ${body.churchName}, ${body.contactName}, ${body.phone ?? null},
              ${body.location ?? null}, COALESCE(${body.takenOn}::date, CURRENT_DATE),
              ${body.dueDate ?? null}::date, ${total}, ${body.notes ?? null}, ${user.id})
    `,
    ...[...byProduct.entries()].map(([pid, line]) =>
      sql`
        INSERT INTO credit_sale_items (id, credit_sale_id, product_id, quantity, unit_price, unit_cost)
        VALUES (${randomUUID()}, ${id}, ${pid}, ${line.quantity}, ${line.unitPrice}, ${num(pmap.get(pid)!.cost_price)})
      `
    ),
    ...[...byProduct.entries()].map(([pid, line]) =>
      sql`
        UPDATE products
           SET quantity_shop = quantity_shop - ${line.quantity},
               quantity_on_hand = quantity_on_hand - ${line.quantity},
               updated_at = NOW()
         WHERE id = ${pid}
      `
    ),
    ...[...byProduct.entries()].map(([pid, line]) =>
      sql`
        INSERT INTO stock_movements (id, product_id, movement_type, quantity_change, unit_cost,
                                     reference_type, reference_id, notes, created_by)
        VALUES (${randomUUID()}, ${pid}, 'credit_sale', ${-line.quantity}, ${num(pmap.get(pid)!.cost_price)},
                'credit_sale', ${id}, ${'Credit sale ' + reference + ' — ' + body.churchName}, ${user.id})
      `
    ),
  ]);

  const rows = (await sql.query(`${CREDIT_COLS} WHERE cs.id = $1`, [id])) as Record<string, unknown>[];
  return ok(toCredit(rows[0]), 201);
});
