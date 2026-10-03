import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getSql } from '@/lib/db';
import { handle, ok, requireUser, HttpError } from '@/lib/auth';
import { num, parsePagination, pageEnvelope, cursorCondition, type CursorRow } from '@/lib/api-utils';

function toPurchase(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    referenceNumber: row.reference_number as string,
    supplierId: row.supplier_id as string,
    supplierName: row.supplier_name as string | null,
    status: row.status as string,
    orderedAt: row.ordered_at as string | null,
    receivedAt: row.received_at as string | null,
    cancelledAt: row.cancelled_at as string | null,
    notes: row.notes as string | null,
    createdBy: row.created_by as string,
    createdByName: row.created_by_name as string | null,
    itemCount: Number(row.item_count ?? 0),
    totalCost: num(row.total_cost ?? 0),
    createdAt: row.created_at as string,
  };
}

export const GET = handle(async (req) => {
  await requireUser(req, ['admin', 'manager']);
  const sp = req.nextUrl.searchParams;
  const { limit, cursorTs, cursorId } = parsePagination(sp);
  const status = sp.get('status');
  const supplierId = sp.get('supplierId');

  const sql = getSql();
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (status) {
    if (!['draft', 'ordered', 'received', 'cancelled'].includes(status)) {
      throw HttpError.badRequest('INVALID_STATUS', 'Unknown purchase status.');
    }
    params.push(status);
    conditions.push(`p.status = $${params.length}`);
  }
  if (supplierId) {
    params.push(supplierId);
    conditions.push(`p.supplier_id = $${params.length}`);
  }
  cursorCondition(conditions, params, cursorTs, cursorId, 'p.created_at');
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit + 1);

  const rows = (await sql.query(
    `SELECT p.id, p.reference_number, p.supplier_id, s.name AS supplier_name,
            p.status, p.ordered_at, p.received_at, p.cancelled_at, p.notes,
            p.created_by, u.name AS created_by_name, p.created_at,
            COUNT(pi.id)::int AS item_count,
            COALESCE(SUM(pi.quantity_ordered * pi.unit_cost), 0) AS total_cost
     FROM purchases p
     LEFT JOIN suppliers s ON s.id = p.supplier_id
     LEFT JOIN users u ON u.id = p.created_by
     LEFT JOIN purchase_items pi ON pi.purchase_id = p.id
     ${where}
     GROUP BY p.id, s.name, u.name
     ORDER BY p.created_at DESC, p.id DESC
     LIMIT $${params.length}`,
    params
  )) as Record<string, unknown>[];

  const page = pageEnvelope(rows as unknown as CursorRow[], limit);
  return ok({ items: page.items.map((r) => toPurchase(r as Record<string, unknown>)), nextCursor: page.nextCursor });
});

const createPurchaseSchema = z.object({
  supplierId: z.string().uuid(),
  referenceNumber: z.string().trim().max(100).nullish(),
  notes: z.string().trim().max(2000).nullish(),
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantityOrdered: z.number().int().min(1),
        unitCost: z.number().min(0),
      })
    )
    .min(1)
    .max(500),
});

export const POST = handle(async (req) => {
  const user = await requireUser(req, ['admin', 'manager']);
  const body = createPurchaseSchema.parse(await req.json());
  const sql = getSql();

  const supplier = (await sql`SELECT id FROM suppliers WHERE id = ${body.supplierId} AND active`) as {
    id: string;
  }[];
  if (!supplier[0]) throw HttpError.badRequest('INVALID_SUPPLIER', 'That supplier does not exist.');

  const productIds = [...new Set(body.items.map((i) => i.productId))];
  const products = (await sql`
    SELECT id FROM products WHERE id = ANY(${productIds}::uuid[]) AND active
  `) as { id: string }[];
  if (products.length !== productIds.length) {
    throw HttpError.badRequest('INVALID_PRODUCT', 'One or more products do not exist.');
  }

  const id = randomUUID();
  const referenceNumber =
    body.referenceNumber || `PO-${Date.now().toString(36).toUpperCase()}`;

  /* Non-interactive transaction: purchase header + all lines atomically. */
  await sql.transaction([
    sql`
      INSERT INTO purchases (id, reference_number, supplier_id, status, notes, created_by)
      VALUES (${id}, ${referenceNumber}, ${body.supplierId}, 'draft', ${body.notes ?? null}, ${user.id})
    `,
    ...body.items.map(
      (item: { productId: string; quantityOrdered: number; unitCost: number }) => sql`
        INSERT INTO purchase_items (id, purchase_id, product_id, quantity_ordered, unit_cost)
        VALUES (${randomUUID()}, ${id}, ${item.productId}, ${item.quantityOrdered}, ${item.unitCost})
      `,
    ),
  ]);

  const rows = (await sql`
    SELECT p.id, p.reference_number, p.supplier_id, s.name AS supplier_name,
           p.status, p.ordered_at, p.received_at, p.cancelled_at, p.notes,
           p.created_by, u.name AS created_by_name, p.created_at,
           COUNT(pi.id)::int AS item_count,
           COALESCE(SUM(pi.quantity_ordered * pi.unit_cost), 0) AS total_cost
    FROM purchases p
    LEFT JOIN suppliers s ON s.id = p.supplier_id
    LEFT JOIN users u ON u.id = p.created_by
    LEFT JOIN purchase_items pi ON pi.purchase_id = p.id
    WHERE p.id = ${id}
    GROUP BY p.id, s.name, u.name
  `) as Record<string, unknown>[];
  return ok(toPurchase(rows[0]), 201);
});
