import { getSql } from '@/lib/db';
import { handle, ok, requireUser } from '@/lib/auth';
import { num, dateRange } from '@/lib/api-utils';

export const GET = handle(async (req) => {
  await requireUser(req, ['admin', 'manager']);
  const { from, to } = dateRange(req.nextUrl.searchParams);
  const sql = getSql();

  const rows = (await sql`
    SELECT date_trunc('day', sold_at)::timestamptz AS day,
           COALESCE(SUM(total), 0) AS revenue,
           COUNT(*)::int AS transactions
    FROM sales
    WHERE status = 'completed' AND sold_at >= ${from} AND sold_at <= ${to}
    GROUP BY 1
    ORDER BY 1 ASC
  `) as Record<string, unknown>[];

  return ok({
    from,
    to,
    days: rows.map((r) => ({
      day: (r.day as Date).toISOString().slice(0, 10),
      revenue: num(r.revenue),
      transactions: r.transactions as number,
    })),
  });
});
