import { getSql } from '@/lib/db';
import { handle, ok, requireUser } from '@/lib/auth';
import { num, dateRange } from '@/lib/api-utils';

export const GET = handle(async (req) => {
  await requireUser(req, ['admin', 'manager']);
  const { from, to } = dateRange(req.nextUrl.searchParams);
  const sql = getSql();

  const rows = (await sql`
    SELECT
      COALESCE(SUM(s.total), 0) AS revenue,
      COUNT(*)::int AS transactions,
      COALESCE(SUM(s.discount), 0) AS discounts,
      COALESCE(SUM(si.quantity * si.unit_cost), 0) AS cogs
    FROM sales s
    LEFT JOIN sale_items si ON si.sale_id = s.id
    WHERE s.status = 'completed' AND s.sold_at >= ${from} AND s.sold_at <= ${to}
  `) as Record<string, unknown>[];

  const revenue = num(rows[0].revenue);
  const cogs = num(rows[0].cogs);
  return ok({
    from,
    to,
    revenue,
    transactions: rows[0].transactions as number,
    discounts: num(rows[0].discounts),
    cogs,
    grossProfit: revenue - cogs,
  });
});
