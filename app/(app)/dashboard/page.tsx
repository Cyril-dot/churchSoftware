import { redirect } from 'next/navigation';
import { getSessionUserFromCookies } from '@/lib/auth';
import { getSql, isDbConfigured } from '@/lib/db';
import { can } from '@/lib/rbac';
import DashboardClient, { type DashboardData } from './DashboardClient';

export const metadata = { title: 'Home' };

const EMPTY: DashboardData = {
  revenueToday: 0,
  transactionsToday: 0,
  grossProfitToday: null,
  lowStockCount: 0,
  topItem: null,
  daily: [],
  recent: [],
  lowStock: [],
  ownScope: false,
};

async function loadDashboard(userId: string, role: 'admin' | 'manager' | 'cashier'): Promise<DashboardData> {
  if (!isDbConfigured()) return loadDemoDashboard(userId, role);
  const sql = getSql();
  const ownScope = role === 'cashier';
  const showCost = can(role, 'viewCost');
  const showInventory = can(role, 'manageInventory');

  try {
    const scopeFilter = ownScope ? sql`AND s.sold_by = ${userId}` : sql``;

    const todayRows = (await sql`
      SELECT COALESCE(SUM(s.total), 0)::float8 AS revenue, COUNT(s.id)::int AS n
      FROM sales s WHERE s.sold_at >= CURRENT_DATE ${scopeFilter}
    `) as { revenue: number; n: number }[];
    const today = todayRows[0] ?? { revenue: 0, n: 0 };

    let grossProfitToday: number | null = null;
    if (showCost) {
      const pRows = (await sql`
        SELECT COALESCE(SUM(si.quantity * (si.unit_price - si.unit_cost)), 0)::float8 AS profit
        FROM sale_items si JOIN sales s ON s.id = si.sale_id
        WHERE s.sold_at >= CURRENT_DATE ${scopeFilter}
      `) as { profit: number }[];
      grossProfitToday = pRows[0]?.profit ?? 0;
    }

    const dailyRows = (await sql`
      SELECT TO_CHAR(d, 'YYYY-MM-DD') AS day, TO_CHAR(d, 'Dy') AS label,
             COALESCE(SUM(s.total), 0)::float8 AS revenue, COUNT(s.id)::int AS n
      FROM generate_series(CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, INTERVAL '1 day') AS d
      LEFT JOIN sales s ON s.sold_at::date = d::date ${ownScope ? sql`AND s.sold_by = ${userId}` : sql``}
      GROUP BY d ORDER BY d
    `) as { day: string; label: string; revenue: number; n: number }[];

    const recentRows = (await sql`
      SELECT s.id, s.receipt_number AS receipt, s.total::float8 AS total,
             s.payment_method AS method, s.sold_at AS "soldAt", u.name AS "soldBy",
             (SELECT COUNT(*)::int FROM sale_items si WHERE si.sale_id = s.id) AS items
      FROM sales s JOIN users u ON u.id = s.sold_by
      WHERE TRUE ${scopeFilter}
      ORDER BY s.sold_at DESC LIMIT 8
    `) as DashboardData['recent'];

    let lowStock: DashboardData['lowStock'] = [];
    let lowStockCount = 0;
    if (showInventory) {
      lowStock = (await sql`
        SELECT id, name, quantity_on_hand AS qty, reorder_level AS reorder,
               selling_price::float8 AS price
        FROM products
        WHERE active AND quantity_on_hand <= reorder_level
        ORDER BY quantity_on_hand ASC LIMIT 10
      `) as DashboardData['lowStock'];
      lowStockCount = lowStock.length;
    }

    let topItem: DashboardData['topItem'] = null;
    if (showCost) {
      const tRows = (await sql`
        SELECT p.name, SUM(si.quantity)::int AS qty,
               SUM(si.quantity * si.unit_price)::float8 AS revenue
        FROM sale_items si
        JOIN sales s ON s.id = si.sale_id
        JOIN products p ON p.id = si.product_id
        WHERE s.sold_at >= CURRENT_DATE ${scopeFilter}
        GROUP BY p.name ORDER BY qty DESC LIMIT 1
      `) as { name: string; qty: number; revenue: number }[];
      topItem = tRows[0] ?? null;
    }

    return {
      revenueToday: today.revenue,
      transactionsToday: today.n,
      grossProfitToday,
      lowStockCount,
      topItem,
      daily: dailyRows,
      recent: recentRows.map((r) => ({ ...r, soldAt: String(r.soldAt) })),
      lowStock,
      ownScope,
    };
  } catch (err) {
    console.error('Dashboard load failed:', err);
    return EMPTY;
  }
}

function loadDemoDashboard(userId: string, role: 'admin' | 'manager' | 'cashier'): DashboardData {
  const { DEMO_SALES, DEMO_PRODUCTS } = require('@/lib/demo-data');
  const ownScope = role === 'cashier';
  const sales = ownScope ? DEMO_SALES.filter((s: any) => s.sold_by === userId) : DEMO_SALES;
  const today = new Date().toISOString().slice(0, 10);
  const todaySales = sales.filter((s: any) => s.sold_at.slice(0, 10) === today);
  const revenueToday = todaySales.reduce((s: number, x: any) => s + x.total, 0);
  const lowStock = DEMO_PRODUCTS.filter((p: any) => p.active && p.quantity_on_hand <= p.reorder_level)
    .map((p: any) => ({ id: p.id, name: p.name, qty: p.quantity_on_hand, reorder: p.reorder_level }));

  // Last 7 days
  const daily: Array<{ day: string; label: string; revenue: number; n: number }> = [];
  for (let d = 6; d >= 0; d--) {
    const dt = new Date(); dt.setDate(dt.getDate() - d);
    const key = dt.toISOString().slice(0, 10);
    const daySales = sales.filter((s: any) => s.sold_at.slice(0, 10) === key);
    daily.push({
      day: key,
      label: dt.toLocaleDateString('en', { weekday: 'short' }),
      revenue: daySales.reduce((s: number, x: any) => s + x.total, 0),
      n: daySales.length,
    });
  }
  // Top item
  const counts: Record<string, { qty: number; revenue: number }> = {};
  for (const s of sales) for (const i of s.items) {
    counts[i.name] = counts[i.name] || { qty: 0, revenue: 0 };
    counts[i.name].qty += i.quantity;
    counts[i.name].revenue += i.quantity * i.unit_price;
  }
  const topEntry = Object.entries(counts).sort((a, b) => b[1].qty - a[1].qty)[0];
  const topItem = topEntry ? { name: topEntry[0], ...topEntry[1] } : null;

  return {
    revenueToday,
    transactionsToday: todaySales.length,
    grossProfitToday: role === 'cashier' ? null : Math.round(revenueToday * 0.35),
    lowStockCount: lowStock.length,
    topItem,
    daily,
    recent: sales.slice(0, 8).map((s: any) => ({
      id: s.id, receipt: s.receipt_number, total: s.total,
      method: s.payment_method, soldAt: s.sold_at, soldBy: s.cashier_name, items: s.items.length,
    })),
    lowStock: lowStock.slice(0, 6),
    ownScope,
  };
}

export default async function DashboardPage() {
  const user = await getSessionUserFromCookies();
  if (!user) redirect('/login');
  const data = await loadDashboard(user.id, user.role);
  return <DashboardClient user={user} data={data} />;
}
