import { getSql } from '@/lib/db';
import { handle, ok, requireUser } from '@/lib/auth';
import { num, dateRange } from '@/lib/api-utils';

export const GET = handle(async (req) => {
  await requireUser(req, ['admin', 'manager']);
  const sp = req.nextUrl.searchParams;
  const { from, to } = dateRange(sp);
  const raw = Number(sp.get('limit'));
  const limit = Number.isFinite(raw) ? Math.min(Math.max(Math.floor(raw), 1), 100) : 20;
  const sql = getSql();

  const rows = (await sql`
    SELECT si.product_id, p.name AS product_name,
           COALESCE(SUM(si.quantity), 0)::int AS quantity,
           COALESCE(SUM(si.quantity * si.unit_price), 0) AS revenue,
           COALESCE(SUM(si.quantity * si.unit_cost), 0) AS cogs
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    JOIN products p ON p.id = si.product_id
    WHERE s.status = 'completed' AND s.sold_at >= ${from} AND s.sold_at <= ${to}
    GROUP BY si.product_id, p.name
    ORDER BY quantity DESC
    LIMIT ${limit}
  `) as Record<string, unknown>[];

  return ok({
    from,
    to,
    items: rows.map((r) => ({
      productId: r.product_id as string,
      productName: r.product_name as string,
      quantity: r.quantity as number,
      revenue: num(r.revenue),
      cogs: num(r.cogs),
      grossProfit: num(r.revenue) - num(r.cogs),
    })),
  });
});
