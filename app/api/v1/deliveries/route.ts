import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getSql } from '@/lib/db';
import { handle, ok, requireUser, HttpError } from '@/lib/auth';
import { num } from '@/lib/api-utils';

function toOrder(r: Record<string, unknown>) {
  return {
    id: r.id as string,
    invoiceNumber: r.invoice_number as string,
    customerName: r.customer_name as string,
    contactName: r.contact_name as string | null,
    phone: r.phone as string | null,
    address: r.address as string | null,
    status: r.status as string,
    total: num(r.total),
    notes: r.notes as string | null,
    itemCount: Number(r.item_count ?? 0),
    createdBy: r.created_by as string,
    createdByName: r.created_by_name as string | null,
    createdAt: r.created_at as string,
    deliveredAt: r.delivered_at as string | null,
    deliveredByName: r.delivered_by_name as string | null,
  };
}

const ORDER_COLS = `
  SELECT o.id, o.invoice_number, o.customer_name, o.contact_name, o.phone, o.address,
         o.status, o.total, o.notes, o.created_by, u.name AS created_by_name,
         o.created_at, o.delivered_at, d.name AS delivered_by_name,
         (SELECT COUNT(*)::int FROM delivery_order_items WHERE order_id = o.id) AS item_count
    FROM delivery_orders o
    JOIN users u ON u.id = o.created_by
    LEFT JOIN users d ON d.id = o.delivered_by
`;

/* List warehouse delivery orders. Date filter via from/to (ISO timestamps). */
export const GET = handle(async (req) => {
  await requireUser(req, ['admin', 'manager']);
  const sp = req.nextUrl.searchParams;
  const limit = Math.min(200, Math.max(1, parseInt(sp.get('limit') || '100', 10) || 100));
  const from = sp.get('from');
  const to = sp.get('to');
  const status = sp.get('status');

  const sql = getSql();
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (from) {
    params.push(from);
    conditions.push(`o.created_at >= $${params.length}`);
  }
  if (to) {
    params.push(to);
    conditions.push(`o.created_at <= $${params.length}`);
  }
  if (status) {
    if (!['pending', 'delivered'].includes(status)) {
      throw HttpError.badRequest('INVALID_STATUS', 'Unknown delivery status.');
    }
    params.push(status);
    conditions.push(`o.status = $${params.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit);

  const rows = (await sql.query(
    `${ORDER_COLS} ${where} ORDER BY o.created_at DESC, o.id DESC LIMIT $${params.length}`,
    params
  )) as Record<string, unknown>[];
  return ok({ items: rows.map(toOrder), nextCursor: null });
});

const createOrderSchema = z.object({
  customerName: z.string().trim().min(1).max(300),
  contactName: z.string().trim().max(300).nullish(),
  phone: z.string().trim().max(50).nullish(),
  address: z.string().trim().max(1000).nullish(),
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
 * Create a delivery order. Stock is deducted from the WAREHOUSE at creation
 * (products.quantity_warehouse has a CHECK >= 0, so the transaction below can
 * never drive it negative — it aborts instead) and a 'delivery' stock
 * movement is recorded per line.
 */
export const POST = handle(async (req) => {
  const user = await requireUser(req, ['admin', 'manager']);
  const body = createOrderSchema.parse(await req.json());
  const sql = getSql();

  // Aggregate duplicate lines per product
  const byProduct = new Map<string, { quantity: number; unitPrice: number }>();
  for (const it of body.items) {
    const cur = byProduct.get(it.productId);
    if (cur) cur.quantity += it.quantity;
    else byProduct.set(it.productId, { quantity: it.quantity, unitPrice: it.unitPrice });
  }
  const productIds = [...byProduct.keys()];

  const products = (await sql`
    SELECT id, name, quantity_warehouse, cost_price FROM products
    WHERE id = ANY(${productIds}::uuid[]) AND active
  `) as { id: string; name: string; quantity_warehouse: number; cost_price: unknown }[];
  if (products.length !== productIds.length) {
    throw HttpError.badRequest('INVALID_PRODUCT', 'One or more products do not exist.');
  }
  const pmap = new Map(products.map((p) => [p.id, p]));
  for (const [pid, line] of byProduct) {
    const p = pmap.get(pid)!;
    if (p.quantity_warehouse < line.quantity) {
      throw HttpError.badRequest(
        'INSUFFICIENT_STOCK',
        `Only ${p.quantity_warehouse} of “${p.name}” in the warehouse.`
      );
    }
  }

  const total = [...byProduct.values()].reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const id = randomUUID();
  const refRows = (await sql`SELECT 'INV-' || lpad(nextval('delivery_seq')::text, 6, '0') AS ref`) as {
    ref: string;
  }[];
  const invoiceNumber = refRows[0].ref;

  await sql.transaction([
    sql`
      INSERT INTO delivery_orders (id, invoice_number, customer_name, contact_name, phone, address, status, total, notes, created_by)
      VALUES (${id}, ${invoiceNumber}, ${body.customerName}, ${body.contactName ?? null},
              ${body.phone ?? null}, ${body.address ?? null}, 'pending', ${total},
              ${body.notes ?? null}, ${user.id})
    `,
    ...[...byProduct.entries()].map(([pid, line]) =>
      sql`
        INSERT INTO delivery_order_items (id, order_id, product_id, quantity, unit_price, unit_cost)
        VALUES (${randomUUID()}, ${id}, ${pid}, ${line.quantity}, ${line.unitPrice}, ${num(pmap.get(pid)!.cost_price)})
      `
    ),
    ...[...byProduct.entries()].map(([pid, line]) =>
      sql`
        UPDATE products
           SET quantity_warehouse = quantity_warehouse - ${line.quantity},
               quantity_on_hand = quantity_on_hand - ${line.quantity},
               updated_at = NOW()
         WHERE id = ${pid}
      `
    ),
    ...[...byProduct.entries()].map(([pid, line]) =>
      sql`
        INSERT INTO stock_movements (id, product_id, movement_type, quantity_change, unit_cost,
                                     reference_type, reference_id, notes, created_by)
        VALUES (${randomUUID()}, ${pid}, 'delivery', ${-line.quantity}, ${num(pmap.get(pid)!.cost_price)},
                'delivery_order', ${id}, ${'Warehouse delivery ' + invoiceNumber}, ${user.id})
      `
    ),
  ]);

  const rows = (await sql.query(`${ORDER_COLS} WHERE o.id = $1`, [id])) as Record<string, unknown>[];
  return ok(toOrder(rows[0]), 201);
});
