import { getSql } from '@/lib/db';
import { handle, ok, requireUser } from '@/lib/auth';
import { num, dateRange } from '@/lib/api-utils';

/* Stock movement report — recent stock_movements across all products,
   filterable by date range (from/to ISO timestamps) and movement type. */
export const GET = handle(async (req) => {
  await requireUser(req, ['admin', 'manager']);
  const sp = req.nextUrl.searchParams;
  const { from, to } = dateRange(sp, 30);
  const type = sp.get('type');
  const limit = Math.min(500, Math.max(1, parseInt(sp.get('limit') || '200', 10) || 200));

  const sql = getSql();
  const conditions: string[] = ['sm.created_at >= $1', 'sm.created_at <= $2'];
  const params: unknown[] = [from, to];
  if (type) {
    params.push(type);
    conditions.push(`sm.movement_type = $${params.length}`);
  }
  params.push(limit);

  const rows = (await sql.query(
    `SELECT sm.id, sm.product_id, p.name AS product_name, p.sku,
            sm.movement_type, sm.quantity_change, sm.unit_cost,
            sm.reference_type, sm.notes, sm.created_at,
            u.name AS created_by_name
       FROM stock_movements sm
       JOIN products p ON p.id = sm.product_id
       LEFT JOIN users u ON u.id = sm.created_by
      WHERE ${conditions.join(' AND ')}
      ORDER BY sm.created_at DESC, sm.id DESC
      LIMIT $${params.length}`,
    params
  )) as Record<string, unknown>[];

  return ok({
    items: rows.map((r) => ({
      id: r.id as string,
      productId: r.product_id as string,
      productName: r.product_name as string,
      sku: r.sku as string | null,
      movementType: r.movement_type as string,
      quantityChange: r.quantity_change as number,
      unitCost: r.unit_cost == null ? null : num(r.unit_cost),
      referenceType: r.reference_type as string | null,
      notes: r.notes as string | null,
      createdByName: r.created_by_name as string | null,
      createdAt: r.created_at as string,
    })),
    from,
    to,
  });
});
