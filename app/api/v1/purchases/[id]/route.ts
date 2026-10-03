import { getSql } from '@/lib/db';
import { handle, ok, requireUser, HttpError } from '@/lib/auth';
import { num } from '@/lib/api-utils';

export const GET = handle(async (req, ctx) => {
  await requireUser(req, ['admin', 'manager']);
  const { id } = await ctx.params;
  const sql = getSql();

  const rows = (await sql`
    SELECT p.id, p.reference_number, p.supplier_id, s.name AS supplier_name,
           p.status, p.ordered_at, p.received_at, p.cancelled_at, p.notes,
           p.created_by, u.name AS created_by_name, p.created_at
    FROM purchases p
    LEFT JOIN suppliers s ON s.id = p.supplier_id
    LEFT JOIN users u ON u.id = p.created_by
    WHERE p.id = ${id}
  `) as Record<string, unknown>[];
  const purchase = rows[0];
  if (!purchase) throw HttpError.notFound('That purchase order no longer exists.');

  const items = (await sql`
    SELECT pi.id, pi.product_id, pr.name AS product_name, pr.sku,
           pi.quantity_ordered, pi.quantity_received, pi.unit_cost
    FROM purchase_items pi
    JOIN products pr ON pr.id = pi.product_id
    WHERE pi.purchase_id = ${id}
    ORDER BY pr.name ASC
  `) as Record<string, unknown>[];

  const totalCost = items.reduce(
    (sum, i) => sum + Number(i.quantity_ordered) * Number(i.unit_cost),
    0
  );

  return ok({
    id: purchase.id as string,
    referenceNumber: purchase.reference_number as string,
    supplierId: purchase.supplier_id as string,
    supplierName: purchase.supplier_name as string | null,
    status: purchase.status as string,
    orderedAt: purchase.ordered_at as string | null,
    receivedAt: purchase.received_at as string | null,
    cancelledAt: purchase.cancelled_at as string | null,
    notes: purchase.notes as string | null,
    createdBy: purchase.created_by as string,
    createdByName: purchase.created_by_name as string | null,
    createdAt: purchase.created_at as string,
    totalCost,
    items: items.map((i) => ({
      id: i.id as string,
      productId: i.product_id as string,
      productName: i.product_name as string,
      sku: i.sku as string | null,
      quantityOrdered: i.quantity_ordered as number,
      quantityReceived: i.quantity_received as number,
      unitCost: num(i.unit_cost),
      lineTotal: Number(i.quantity_ordered) * Number(i.unit_cost),
    })),
  });
});
