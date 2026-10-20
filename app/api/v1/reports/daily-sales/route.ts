import { getSql } from '@/lib/db';
import { handle, ok, requireUser, HttpError } from '@/lib/auth';
import { num } from '@/lib/api-utils';
import { BISHOP_SQL } from '@/lib/low-stock';

/*
 * Daily sales summary for printing (admin/manager only).
 * ?date=YYYY-MM-DD (Africa/Accra day). Groups the day's completed POS sales:
 * first every Bishop Books line with its subtotal, then all other items with
 * their subtotal, plus the day's Cash total, MoMo total and grand total.
 */
export const GET = handle(async (req) => {
  await requireUser(req, ['admin', 'manager']);
  const date = req.nextUrl.searchParams.get('date');
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw HttpError.badRequest('INVALID_DATE', 'Pass ?date=YYYY-MM-DD.');
  }
  const sql = getSql();

  const itemRows = (await sql.query(
    `SELECT p.id AS product_id, p.name AS product_name, si.unit_price,
            SUM(si.quantity)::int AS quantity,
            SUM(si.quantity * si.unit_price) AS line_total,
            (${BISHOP_SQL}) AS is_bishop
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id
       JOIN products p ON p.id = si.product_id
       LEFT JOIN categories c ON c.id = p.category_id
      WHERE s.status = 'completed'
        AND (s.sold_at AT TIME ZONE 'Africa/Accra')::date = $1::date
      GROUP BY p.id, p.name, si.unit_price, is_bishop
      ORDER BY p.name ASC`,
    [date]
  )) as Record<string, unknown>[];

  const payRows = (await sql`
    SELECT payment_method, COALESCE(SUM(total), 0) AS amount, COUNT(*)::int AS n
      FROM sales
     WHERE status = 'completed'
       AND (sold_at AT TIME ZONE 'Africa/Accra')::date = ${date}::date
     GROUP BY payment_method
  `) as Record<string, unknown>[];

  const settings = (await sql`
    SELECT shop_name FROM settings WHERE id = 1
  `) as Record<string, unknown>[];

  const items = itemRows.map((r) => ({
    productId: r.product_id as string,
    name: r.product_name as string,
    quantity: r.quantity as number,
    unitPrice: num(r.unit_price),
    lineTotal: num(r.line_total),
    isBishop: r.is_bishop as boolean,
  }));
  const bishopItems = items.filter((i) => i.isBishop);
  const otherItems = items.filter((i) => !i.isBishop);
  const sum = (arr: typeof items) => Math.round(arr.reduce((s, i) => s + i.lineTotal, 0) * 100) / 100;

  const byMethod = new Map(payRows.map((r) => [r.payment_method as string, num(r.amount)]));
  const grandTotal =
    Math.round([...byMethod.values()].reduce((s, v) => s + v, 0) * 100) / 100;

  return ok({
    date,
    shopName: (settings[0]?.shop_name as string) ?? 'Church Bookshop',
    bishop: { items: bishopItems, subtotal: sum(bishopItems) },
    other: { items: otherItems, subtotal: sum(otherItems) },
    cashTotal: byMethod.get('cash') ?? 0,
    momoTotal: byMethod.get('mobile_money') ?? 0,
    grandTotal,
    transactions: payRows.reduce((s, r) => s + (r.n as number), 0),
  });
});
