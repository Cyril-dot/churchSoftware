'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { animate, motion } from 'motion/react';
import { can, type Role } from '@/lib/rbac';
import type { SessionUser } from '@/lib/auth';
import { formatMoney, formatMoneyCompact } from '@/lib/money';
import Icon from '@/components/Icon';
import { api } from '@/components/ui';

/* ── Types ─────────────────────────────────────────────────────── */
export interface DayPoint {
  day: string;
  label: string;
  revenue: number;
  n: number;
}
export interface RecentSale {
  id: string;
  receipt: string;
  total: number;
  method: string;
  soldAt: string;
  soldBy: string;
  items: number;
}
export interface LowStockItem {
  id: string;
  name: string;
  qty: number;
  reorder: number;
  price: number;
}
export interface DashboardData {
  revenueToday: number;
  transactionsToday: number;
  grossProfitToday: number | null;
  lowStockCount: number;
  topItem: { name: string; qty: number; revenue: number } | null;
  daily: DayPoint[];
  recent: RecentSale[];
  lowStock: LowStockItem[];
  ownScope: boolean;
}

/* ── Motion presets ────────────────────────────────────────────── */
const list = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
};
const rise = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: 'easeOut' as const } },
};

/* ── Count-up number ───────────────────────────────────────────── */
function CountUp({ value, format }: { value: number; format: (n: number) => string }) {
  const [display, setDisplay] = useState(() => format(0));
  useEffect(() => {
    const controls = animate(0, value, {
      duration: 1.1,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setDisplay(format(v)),
    });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return <span className="tnum">{display}</span>;
}

/* ── Stat card ─────────────────────────────────────────────────── */
function StatCard({
  icon,
  label,
  value,
  sub,
  tone,
  href,
}: {
  icon: string;
  label: string;
  value: React.ReactNode;
  sub?: string;
  tone: 'wine' | 'gold' | 'green' | 'red';
  href?: string;
}) {
  const tones = {
    wine: 'bg-[var(--wine-tint)] text-[var(--wine)]',
    gold: 'bg-[var(--warning-bg)] text-[var(--warning)]',
    green: 'bg-[var(--success-bg)] text-[var(--success)]',
    red: 'bg-[var(--danger-bg)] text-[var(--danger)]',
  } as const;
  const inner = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${tones[tone]}`}>
          <Icon name={icon} size={24} />
        </span>
        {href && <Icon name="arrow_outward" size={18} className="text-[var(--ink-muted)]" />}
      </div>
      <p className="font-display mt-4 text-[28px] leading-none text-[var(--ink)]">{value}</p>
      <p className="mt-1.5 text-sm font-semibold text-[var(--ink-muted)]">{label}</p>
      {sub && <p className="mt-0.5 text-xs text-[var(--ink-muted)]">{sub}</p>}
    </>
  );
  const cls =
    'block rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow)] transition-transform duration-200 hover:-translate-y-0.5';
  return href ? (
    <motion.div variants={rise}>
      <Link href={href} className={cls} aria-label={`${label}: view`}>
        {inner}
      </Link>
    </motion.div>
  ) : (
    <motion.div variants={rise} className={cls}>
      {inner}
    </motion.div>
  );
}

/* ── 7-day revenue chart (custom SVG-free bars) ────────────────── */
function RevenueChart({ daily }: { daily: DayPoint[] }) {
  const max = Math.max(...daily.map((d) => d.revenue), 1);
  const total = daily.reduce((s, d) => s + d.revenue, 0);
  return (
    <section aria-label="Revenue last 7 days" className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow)] sm:p-6">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg text-[var(--ink)]">Revenue · last 7 days</h2>
          <p className="text-sm text-[var(--ink-muted)]">
            Total <span className="tnum font-bold text-[var(--ink)]">{formatMoney(total)}</span>
          </p>
        </div>
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--wine-tint)] text-[var(--wine)]">
          <Icon name="bar_chart" size={22} />
        </span>
      </div>
      {daily.length === 0 || total === 0 ? (
        <div className="flex h-48 flex-col items-center justify-center gap-2 text-center">
          <Icon name="bar_chart" size={36} className="text-[var(--border-input)]" />
          <p className="text-sm font-medium text-[var(--ink-muted)]">No sales recorded in the last 7 days.</p>
        </div>
      ) : (
        <div className="flex h-48 items-end gap-1.5 sm:gap-3" role="img" aria-label={`Bar chart of revenue for the last 7 days, total ${formatMoney(total)}`}>
          {daily.map((d, i) => {
            const peak = d.revenue === max && d.revenue > 0;
            return (
              <div key={d.day} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2">
                <span className="tnum text-[11px] font-bold text-[var(--ink-muted)]">
                  {d.revenue > 0 ? formatMoneyCompact(d.revenue) : ''}
                </span>
                <motion.div
                  initial={{ scaleY: 0 }}
                  animate={{ scaleY: 1 }}
                  transition={{ delay: 0.35 + i * 0.06, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                  style={{ height: `${Math.max(3, (d.revenue / max) * 72)}%` }}
                  title={`${d.label}: ${formatMoney(d.revenue)} · ${d.n} sale${d.n === 1 ? '' : 's'}`}
                  className={`w-full max-w-12 origin-bottom rounded-t-lg ${
                    peak ? 'bg-[var(--gold)] shadow-[0_0_12px_rgba(184,146,63,0.5)]' : 'bg-[var(--wine)]/80'
                  }`}
                />
                <span className="text-[11px] font-semibold text-[var(--ink-muted)]">{d.label}</span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/* ── Helpers ───────────────────────────────────────────────────── */
const METHOD_LABELS: Record<string, string> = {
  cash: 'Cash',
  card: 'Card',
  mobile_money: 'MoMo',
  bank_transfer: 'Bank',
  other: 'Other',
};

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(iso).toLocaleDateString('en-GH', { day: 'numeric', month: 'short' });
}

/* ── Recent sales ──────────────────────────────────────────────── */
function RecentSales({ sales, ownScope }: { sales: RecentSale[]; ownScope: boolean }) {
  return (
    <section aria-label="Recent sales" className="flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow)] sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-display text-lg text-[var(--ink)]">
          {ownScope ? 'My recent sales' : 'Recent sales'}
        </h2>
        <Link
          href="/sales"
          className="flex min-h-[44px] items-center gap-1 rounded-lg px-2 text-sm font-bold text-[var(--wine)] hover:bg-[var(--wine-tint)]"
        >
          View all <Icon name="arrow_forward" size={18} />
        </Link>
      </div>
      {sales.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-10 text-center">
          <Icon name="receipt_long" size={36} className="text-[var(--border-input)]" />
          <p className="text-sm font-medium text-[var(--ink-muted)]">No sales yet. Time to open the till!</p>
          <Link
            href="/sell"
            className="mt-2 inline-flex h-11 items-center gap-2 rounded-[var(--radius-sm)] bg-[var(--wine)] px-5 text-sm font-semibold text-white hover:bg-[var(--wine-hover)]"
          >
            <Icon name="point_of_sale" size={20} /> New sale
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {sales.map((s) => (
            <li key={s.id} className="flex items-center gap-3 py-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-alt)] text-[var(--wine)]">
                <Icon name="receipt" size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-[var(--ink)]">{s.receipt}</p>
                <p className="truncate text-xs text-[var(--ink-muted)]">
                  {timeAgo(s.soldAt)} · {s.items} item{s.items === 1 ? '' : 's'}
                  {!ownScope && ` · ${s.soldBy}`}
                </p>
              </div>
              <span className="hidden rounded-full bg-[var(--surface-alt)] px-2.5 py-1 text-[11px] font-bold text-[var(--ink-muted)] sm:inline">
                {METHOD_LABELS[s.method] ?? s.method}
              </span>
              <span className="tnum text-sm font-bold text-[var(--ink)]">{formatMoney(s.total)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ── Low stock ─────────────────────────────────────────────────── */
function LowStock({ items }: { items: LowStockItem[] }) {
  return (
    <section aria-label="Low stock alerts" className="flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow)] sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-display text-lg text-[var(--ink)]">Low stock</h2>
        <Link
          href="/inventory?filter=low"
          className="flex min-h-[44px] items-center gap-1 rounded-lg px-2 text-sm font-bold text-[var(--wine)] hover:bg-[var(--wine-tint)]"
        >
          Manage <Icon name="arrow_forward" size={18} />
        </Link>
      </div>
      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-10 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--success-bg)] text-[var(--success)]">
            <Icon name="check_circle" size={28} filled />
          </span>
          <p className="text-sm font-medium text-[var(--ink-muted)]">Shelves are healthy. Nothing needs reordering.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.slice(0, 6).map((p) => {
            const pct = p.reorder > 0 ? Math.min(100, Math.round((p.qty / p.reorder) * 100)) : 0;
            const critical = p.qty === 0;
            return (
              <li key={p.id} className={`rounded-xl border p-3 ${critical ? 'border-[var(--danger)] bg-[var(--danger-bg)]' : 'border-[var(--border)] bg-[var(--surface-alt)]'}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="min-w-0 truncate text-sm font-bold text-[var(--ink)]">{p.name}</p>
                  <span className={`tnum shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${critical ? 'bg-[var(--danger)] text-white' : 'bg-[var(--warning-bg)] text-[var(--warning)]'}`}>
                    {p.qty} left
                  </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/10" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${p.name} stock level`}>
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ delay: 0.5, duration: 0.6, ease: 'easeOut' }}
                    className={`h-full rounded-full ${critical ? 'bg-[var(--danger)]' : 'bg-[var(--warning)]'}`}
                  />
                </div>
                <p className="tnum mt-1.5 text-xs text-[var(--ink-muted)]">
                  Reorder at {p.reorder} · {formatMoney(p.price)} each
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* ── Deposit accounts summary ──────────────────────────────────── */
function DepositsWidget() {
  const [accounts, setAccounts] = useState<
    { id: string; name: string; totalDeposited: number }[]
  >([]);
  useEffect(() => {
    api<{ items: { id: string; name: string; totalDeposited: number }[] }>(
      '/api/v1/deposit-accounts'
    )
      .then((r) => setAccounts(r.items))
      .catch(() => {});
  }, []);
  if (accounts.length === 0) return null;
  return (
    <motion.section
      variants={rise}
      aria-label="Deposit accounts"
      className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow)] sm:p-6"
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-lg text-[var(--ink)]">Bank deposits</h2>
        <Link href="/deposits" className="text-sm font-bold text-[var(--wine)]">
          View all
        </Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {accounts.map((a) => (
          <Link
            key={a.id}
            href="/deposits"
            className="flex items-center justify-between gap-3 rounded-xl bg-[var(--surface-alt)] px-4 py-3 transition hover:bg-[var(--wine)]/5"
          >
            <span className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--wine)]/10 text-[var(--wine)]">
                <Icon name="account_balance" size={22} />
              </span>
              <span className="font-bold text-[15px]">{a.name}</span>
            </span>
            <span className="tnum font-bold text-[var(--wine)]">{formatMoney(a.totalDeposited)}</span>
          </Link>
        ))}
      </div>
    </motion.section>
  );
}

/* ── Dashboard ─────────────────────────────────────────────────── */
export default function DashboardClient({
  user,
  data,
}: {
  user: SessionUser;
  data: DashboardData;
}) {
  const role = user.role as Role;
  const showCost = can(role, 'viewCost');
  const showInventory = can(role, 'manageInventory');
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <motion.div variants={list} initial="hidden" animate="show" className="space-y-6">
      {/* Greeting */}
      <motion.div variants={rise} className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl text-[var(--ink)] sm:text-3xl">
            {greeting}, {user.name.split(' ')[0]}
          </h2>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">
            {new Date().toLocaleDateString('en-GH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            {data.ownScope ? ' · showing your sales' : ' · showing all sales'}
          </p>
        </div>
        {can(role, 'sell') && (
          <Link
            href="/sell"
            className="inline-flex h-12 items-center gap-2 rounded-[var(--radius-sm)] bg-[var(--wine)] px-5 text-[15px] font-semibold text-white shadow-[0_4px_16px_rgba(107,35,56,0.3)] transition hover:bg-[var(--wine-hover)]"
          >
            <Icon name="point_of_sale" size={20} />
            New sale
          </Link>
        )}
      </motion.div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard
          icon="payments"
          label={data.ownScope ? 'My revenue today' : "Today's revenue"}
          value={<CountUp value={data.revenueToday} format={formatMoney} />}
          sub={`${data.transactionsToday} transaction${data.transactionsToday === 1 ? '' : 's'}`}
          tone="wine"
          href="/reports"
        />
        <StatCard
          icon="receipt_long"
          label="Transactions today"
          value={<CountUp value={data.transactionsToday} format={(n) => Math.round(n).toString()} />}
          sub={data.ownScope ? 'Your sales' : 'All cashiers'}
          tone="gold"
          href="/sales"
        />
        {showCost && (
          <StatCard
            icon="trending_up"
            label="Gross profit today"
            value={<CountUp value={data.grossProfitToday ?? 0} format={formatMoney} />}
            sub="Revenue minus cost"
            tone="green"
            href="/reports"
          />
        )}
        {showInventory ? (
          <StatCard
            icon="inventory_2"
            label="Low stock items"
            value={<CountUp value={data.lowStockCount} format={(n) => Math.round(n).toString()} />}
            sub={data.lowStockCount > 0 ? 'Need reordering' : 'All healthy'}
            tone={data.lowStockCount > 0 ? 'red' : 'green'}
            href="/inventory?filter=low"
          />
        ) : (
          data.topItem && (
            <StatCard
              icon="star"
              label="Top seller today"
              value={<span className="block truncate text-xl">{data.topItem.name}</span>}
              sub={`${data.topItem.qty} sold · ${formatMoney(data.topItem.revenue)}`}
              tone="gold"
            />
          )
        )}
      </div>

      {/* Chart */}
      <motion.div variants={rise}>
        <RevenueChart daily={data.daily} />
      </motion.div>

      {/* Recent sales + low stock */}
      <div className={`grid gap-4 sm:gap-6 ${showInventory ? 'lg:grid-cols-2' : ''}`}>
        <motion.div variants={rise} className="min-w-0">
          <RecentSales sales={data.recent} ownScope={data.ownScope} />
        </motion.div>
        {showInventory && (
          <motion.div variants={rise} className="min-w-0">
            <LowStock items={data.lowStock} />
          </motion.div>
        )}
      </div>

      {/* Deposit accounts */}
      {can(role, 'manageDeposits') && <DepositsWidget />}

      {/* Quick actions */}
      <motion.nav variants={rise} aria-label="Quick actions" className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        {[
          { href: '/sell', icon: 'point_of_sale', label: 'New sale', show: can(role, 'sell') },
          { href: '/inventory', icon: 'inventory_2', label: 'Manage items', show: can(role, 'manageInventory') },
          { href: '/purchases', icon: 'shopping_bag', label: 'Purchases', show: can(role, 'managePurchases') },
          { href: '/deposits', icon: 'account_balance', label: 'Record deposit', show: can(role, 'manageDeposits') },
          { href: '/reports', icon: 'bar_chart', label: 'Reports', show: can(role, 'viewReports') },
        ]
          .filter((a) => a.show)
          .map((a) => (
            <Link
              key={a.href}
              href={a.href}
              className="flex min-h-[64px] items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 shadow-[var(--shadow)] transition hover:-translate-y-0.5 hover:border-[var(--gold)]"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--wine-tint)] text-[var(--wine)]">
                <Icon name={a.icon} size={22} />
              </span>
              <span className="text-[15px] font-bold text-[var(--ink)]">{a.label}</span>
            </Link>
          ))}
      </motion.nav>
    </motion.div>
  );
}
