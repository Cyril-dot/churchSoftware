// Shared low-stock rules (client-specific, agreed with the bookshop):
//
//   • Bishop Books — low when SHOP qty < 10 OR WAREHOUSE qty < 100.
//   • Bibles       — low when total on-hand qty < 2.
//   • Everything else — falls back to the per-product reorder_level
//     (low when quantity_on_hand <= reorder_level).
//
// This module is the single source of truth: the products API, the dashboard
// and the reports use the SQL fragments below; demo mode and client code use
// the TypeScript predicate. Keep the two in sync.

export interface StockLevels {
  productType: string | null | undefined;
  categoryName: string | null | undefined;
  quantityShop: number;
  quantityWarehouse: number;
  quantityOnHand: number;
  reorderLevel: number;
}

export function isBishopBook(p: Pick<StockLevels, 'productType' | 'categoryName'>): boolean {
  const t = (p.productType ?? '').toLowerCase();
  return t === 'bishop_books' || t === 'bishop' || (p.categoryName ?? '') === 'Bishop Books';
}

export function isBible(p: Pick<StockLevels, 'productType' | 'categoryName'>): boolean {
  const t = (p.productType ?? '').toLowerCase();
  return t === 'bibles' || t === 'bible' || (p.categoryName ?? '') === 'Bibles';
}

/**
 * Returns a human-readable reason when the item is low on stock
 * (e.g. "Bishop Books low in shop (<10)"), or null when stock is fine.
 */
export function lowStockReason(p: StockLevels): string | null {
  if (isBishopBook(p)) {
    const reasons: string[] = [];
    if (p.quantityShop < 10) reasons.push('Bishop Books low in shop (<10)');
    if (p.quantityWarehouse < 100) reasons.push('Bishop Books low in warehouse (<100)');
    return reasons.length ? reasons.join(' · ') : null;
  }
  if (isBible(p)) {
    return p.quantityOnHand < 2 ? 'Bibles low (<2 total)' : null;
  }
  return p.quantityOnHand <= p.reorderLevel ? `At or below reorder level (${p.reorderLevel})` : null;
}

export function isLowStock(p: StockLevels): boolean {
  return lowStockReason(p) != null;
}

/* ── SQL equivalents ────────────────────────────────────────────────────
   Assumes the products table is aliased `p` and its category joined as `c`
   (LEFT JOIN categories c ON c.id = p.category_id). */

export const BISHOP_SQL = `(p.product_type IN ('bishop_books', 'bishop') OR c.name = 'Bishop Books')`;
export const BIBLE_SQL = `(p.product_type IN ('bibles', 'bible') OR c.name = 'Bibles')`;

/** Boolean SQL expression: TRUE when the product is low on stock. */
export const LOW_STOCK_SQL = `(
  (${BISHOP_SQL} AND (p.quantity_shop < 10 OR p.quantity_warehouse < 100))
  OR (${BIBLE_SQL} AND p.quantity_on_hand < 2)
  OR (NOT ${BISHOP_SQL} AND NOT ${BIBLE_SQL} AND p.quantity_on_hand <= p.reorder_level)
)`;

/** SQL expression producing the same reason label as lowStockReason(). */
export const LOW_STOCK_REASON_SQL = `CASE
  WHEN ${BISHOP_SQL} AND p.quantity_shop < 10 AND p.quantity_warehouse < 100
    THEN 'Bishop Books low in shop (<10) · Bishop Books low in warehouse (<100)'
  WHEN ${BISHOP_SQL} AND p.quantity_shop < 10
    THEN 'Bishop Books low in shop (<10)'
  WHEN ${BISHOP_SQL} AND p.quantity_warehouse < 100
    THEN 'Bishop Books low in warehouse (<100)'
  WHEN ${BIBLE_SQL} AND p.quantity_on_hand < 2
    THEN 'Bibles low (<2 total)'
  WHEN p.quantity_on_hand <= p.reorder_level
    THEN 'At or below reorder level (' || p.reorder_level || ')'
  ELSE NULL
END`;
