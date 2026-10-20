import { getSql } from '@/lib/db';
import { handle, ok, requireUser } from '@/lib/auth';
import { num } from '@/lib/api-utils';
import { LOW_STOCK_SQL, LOW_STOCK_REASON_SQL } from '@/lib/low-stock';

/* Low-stock report — items flagged by the shared rules in lib/low-stock.ts:
   Bishop Books shop <10 or warehouse <100; Bibles total <2; others use the
   per-product reorder level. */
export const GET = handle(async (req) => {
  await requireUser(req, ['admin', 'manager']);
  const sql = getSql();
  const rows = (await sql.query(
    `SELECT p.id, p.name, p.sku, c.name AS category_name, p.product_type,
            p.quantity_shop, p.quantity_warehouse, p.quantity_on_hand,
            p.reorder_level, p.selling_price,
            (${LOW_STOCK_REASON_SQL}) AS low_reason
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.active AND (${LOW_STOCK_SQL})
      ORDER BY p.quantity_on_hand ASC, p.name ASC`
  )) as Record<string, unknown>[];
  return ok({
    items: rows.map((r) => ({
      id: r.id as string,
      name: r.name as string,
      sku: r.sku as string | null,
      categoryName: r.category_name as string | null,
      productType: r.product_type as string,
      quantityShop: r.quantity_shop as number,
      quantityWarehouse: r.quantity_warehouse as number,
      quantityOnHand: r.quantity_on_hand as number,
      reorderLevel: r.reorder_level as number,
      sellingPrice: num(r.selling_price),
      lowReason: (r.low_reason as string | null) ?? null,
    })),
  });
});
