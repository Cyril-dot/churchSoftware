'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'motion/react';
import { animate } from 'motion/react';
import { can, type Role } from '@/lib/rbac';
import type { SessionUser } from '@/lib/auth';
import { formatMoney, formatMoneyCompact } from '@/lib/money';
import Icon from '@/components/Icon';
import {
  api,
  StampBadge,
  SpineCard,
  AttentionPanel,
  listVariants,
  riseVariants,
} from '@/components/ui';

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

interface TopSeller {
  name: string;
  qty: number;
  revenue: number;
}

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

/* ── Day-scoped enrichment from existing report endpoints ───────── */
function useTodayInsights(enabled: boolean, todayISO: string) {
  const [sellers, setSellers] = useState<TopSeller[] | null>(null);
  const [itemsSold, setItemsSold] = useState<number | null>(null);
  const [unbanked, setUnbanked] = useState<number | null>(null);
  const [pendingPOs, setPendingPOs] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    const from = `${todayISO}T00:00:00`;
    const to = `${todayISO}T23:59:59`;
    (async () => {
      const [top, pay, deps, pos] = await Promise.allSettled([
        api<{ items: { productName: string; quantity: number; revenue: number }[] }>(
          `/api/v1/reports/top-items?from=${from}&to=${to}&limit=6`
        ),
        api<{ methods: { paymentMethod: string; revenue: number }[] }>(
          `/api/v1/reports/by-payment?from=${from}&to=${to}`
        ),
        api<{ items: { amount: number; depositedOn: string }[] }>(`/api/v1/deposits?limit=100`),
        api<{ items: unknown[] }>(`/api/v1/purchases?status=ordered`),
      ]);
      if (!live) return;
      if (top.status === 'fulfilled') {
        const items = top.value.items ?? [];
        setSellers(items.map((i) => ({ name: i.productName, qty: i.quantity, revenue: i.revenue })));
        setItemsSold(items.reduce((s, i) => s + i.quantity, 0));
      }
      if (pay.status === 'fulfilled' && deps.status === 'fulfilled') {
        const cash = (pay.value.methods ?? [])
          .filter((m) => m.paymentMethod === 'cash')
          .reduce((s, m) => s + m.revenue, 0);
        const banked = (deps.value.items ?? [])
          .filter((d) => d.depositedOn === todayISO)
          .reduce((s, d) => s + d.amount, 0);
        setUnbanked(Math.max(0, cash - banked));
      }
      if (pos.status === 'fulfilled') setPendingPOs((pos.value.items ?? []).length);
    })();
    return () => {
      live = false;
    };
  }, [enabled, todayISO]);

  return { sellers, itemsSold, unbanked, pendingPOs };
}

/* ── Sparkline ─────────────────────────────────────────────────── */
function Sparkline({ points, stroke, id }: { points: number[]; stroke: string; id: string }) {
  const w = 160;
  const h = 40;
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const range = max - min || 1;
  const px = (i: number) => (i / Math.max(points.length - 1, 1)) * w;
  const py = (p: number) => h - 4 - ((p - min) / range) * (h - 10);
  const line = points.map((p, i) => `${px(i).toFixed(1)},${py(p).toFixed(1)}`).join(' ');
  const area = `0,${h} ${line} ${w},${h}`;
  const gid = `spark-${id}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-8 w-full" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${gid})`} />
      <polyline
        points={line}
        fill="none"
        stroke={stroke}
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={px(points.length - 1)} cy={py(points[points.length - 1])} r="3.25" fill={stroke} />
    </svg>
  );
}

/* ── Delta vs yesterday ────────────────────────────────────────── */
function Delta({ pct }: { pct: number | null }) {
  if (pct == null || !isFinite(pct)) return <span className="text-xs text-[var(--ink-muted)]">— vs yesterday</span>;
  const up = pct >= 0;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-bold ${up ? 'text-[var(--olive)]' : 'text-[var(--danger)]'}`}>
      <Icon name={up ? 'trending_up' : 'trending_down'} size={15} />
      {up ? '+' : ''}{pct.toFixed(0)}% <span className="font-medium text-[var(--ink-muted)]">vs yesterday</span>
    </span>
  );
}

function pctChange(today: number, yesterday: number): number | null {
  if (!yesterday || yesterday <= 0) return today > 0 ? 100 : null;
  return ((today - yesterday) / yesterday) * 100;
}

/* ── KPI card ──────────────────────────────────────────────────── */
function Kpi({
  icon,
  label,
  value,
  delta,
  spark,
  sparkColor,
  tone,
  sub,
}: {
  icon: string;
  label: string;
  value: React.ReactNode;
  delta?: React.ReactNode;
  spark?: number[];
  sparkColor?: string;
  tone: 'wine' | 'gold' | 'olive' | 'slate';
  sub?: string;
}) {
  const toneBg = {
    wine: 'bg-[var(--wine-tint)] text-[var(--wine)]',
    gold: 'bg-[var(--warning-bg)] text-[var(--warning)]',
    olive: 'bg-[var(--olive-bg)] text-[var(--olive)]',
    slate: 'bg-[var(--surface-alt)] text-[var(--ink-muted)]',
  }[tone];
  return (
    <SpineCard tone={tone} className="!p-4">
      <div className="flex items-center gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${toneBg}`}>
          <Icon name={icon} size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[10px] font-bold tracking-[0.14em] text-[var(--ink-muted)] uppercase">{label}</p>
          <p className="font-display tnum mt-0.5 truncate text-[22px] leading-none text-[var(--ink)]">{value}</p>
          <div className="mt-1 truncate">{delta ?? (sub ? <span className="text-xs text-[var(--ink-muted)]">{sub}</span> : null)}</div>
        </div>
        {spark && spark.length > 1 && sparkColor ? (
          <div className="w-20 shrink-0 sm:w-24">
            <Sparkline points={spark} stroke={sparkColor} id={label.replace(/\W+/g, '-').toLowerCase()} />
          </div>
        ) : null}
      </div>
    </SpineCard>
  );
}

/* ── 7-day revenue chart ───────────────────────────────────────── */
function RevenueChart({ daily }: { daily: DayPoint[] }) {
  const max = Math.max(...daily.map((d) => d.revenue), 1);
  const total = daily.reduce((s, d) => s + d.revenue, 0);
  const todayIdx = daily.length - 1;
  const gridlines = [0.25, 0.5, 0.75, 1];
  return (
    <SpineCard tone="wine" className="flex h-full flex-col !p-6">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold tracking-[0.14em] text-[var(--ink-muted)] uppercase">Revenue · last 7 days</p>
          <p className="font-display tnum mt-1 text-3xl text-[var(--ink)]">{formatMoney(total)}</p>
        </div>
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--wine-tint)] text-[var(--wine)]">
          <Icon name="bar_chart" size={24} />
        </span>
      </div>
      {daily.length === 0 || total === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-14 text-center">
          <Icon name="bar_chart" size={40} className="text-[var(--border-input)]" />
          <p className="text-sm font-medium text-[var(--ink-muted)]">No sales recorded in the last 7 days.</p>
        </div>
      ) : (
        <div className="relative mt-2 flex-1">
          <div className="absolute inset-0 flex flex-col justify-between pb-7" aria-hidden="true">
            {gridlines.map((g) => (
              <div key={g} className="border-t border-dashed border-[var(--border)]" />
            ))}
          </div>
          <div className="relative flex h-56 items-end gap-2 sm:gap-3 xl:h-64" role="img" aria-label={`Bar chart of revenue for the last 7 days, total ${formatMoney(total)}`}>
            {daily.map((d, i) => {
              const isToday = i === todayIdx;
              return (
                <div key={d.day} className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2">
                  <span className="tnum text-[11px] font-bold text-[var(--ink-muted)] opacity-0 transition group-hover:opacity-100">
                    {d.revenue > 0 ? formatMoneyCompact(d.revenue) : ''}
                  </span>
                  <motion.div
                    initial={{ scaleY: 0 }}
                    animate={{ scaleY: 1 }}
                    transition={{ delay: 0.3 + i * 0.06, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                    style={{ height: `${Math.max(4, (d.revenue / max) * 78)}%` }}
                    title={`${d.label}: ${formatMoney(d.revenue)} · ${d.n} sale${d.n === 1 ? '' : 's'}`}
                    className={`w-full max-w-14 origin-bottom rounded-t-xl transition ${
                      isToday && d.revenue > 0
                        ? 'bg-gradient-to-t from-[var(--gold)] to-[#E3C878] shadow-[0_0_18px_rgba(184,146,63,0.5)]'
                        : 'bg-gradient-to-t from-[var(--wine)] to-[var(--wine-hover)] group-hover:brightness-110'
                    }`}
                  />
                  <span className={`h-5 text-[11px] font-bold ${isToday ? 'text-[var(--wine)]' : 'text-[var(--ink-muted)]'}`}>
                    {d.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <p className="mt-3 flex items-center gap-2 text-xs text-[var(--ink-muted)]">
        <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[var(--gold)]" aria-hidden="true" />
        Gold bar marks today · hover any bar for detail
      </p>
    </SpineCard>
  );
}

/* ── Top sellers today ─────────────────────────────────────────── */
function TopSellers({ sellers, fallback, ownScope }: { sellers: TopSeller[] | null; fallback: DashboardData['topItem']; ownScope: boolean }) {
  const list = sellers ?? (fallback ? [{ name: fallback.name, qty: fallback.qty, revenue: fallback.revenue }] : []);
  const maxQty = Math.max(...list.map((s) => s.qty), 1);
  return (
    <SpineCard tone="gold" className="flex h-full flex-col !p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-[11px] font-bold tracking-[0.14em] text-[var(--ink-muted)] uppercase">
          {ownScope ? 'My top sellers' : 'Top sellers · today'}
        </p>
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--warning-bg)] text-[var(--warning)]">
          <Icon name="emoji_events" size={22} />
        </span>
      </div>
      {list.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-10 text-center">
          <Icon name="emoji_events" size={36} className="text-[var(--border-input)]" />
          <p className="text-sm font-medium text-[var(--ink-muted)]">No sales yet today.</p>
        </div>
      ) : (
        <ol className="flex flex-1 flex-col justify-center gap-3">
          {list.slice(0, 5).map((s, i) => (
            <li key={`${s.name}-${i}`} className="min-w-0">
              <div className="flex items-baseline justify-between gap-2">
                <span className="flex min-w-0 items-baseline gap-2">
                  <span className="font-display shrink-0 text-lg text-[var(--gold)]">{String(i + 1).padStart(2, '0')}</span>
                  <span className="truncate text-sm font-bold text-[var(--ink)]">{s.name}</span>
                </span>
                <span className="tnum shrink-0 text-sm font-bold text-[var(--ink)]">{formatMoney(s.revenue)}</span>
              </div>
              <div className="mt-1.5 ml-8 h-1.5 overflow-hidden rounded-full bg-[var(--surface-alt)]">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${(s.qty / maxQty) * 100}%` }}
                  transition={{ delay: 0.4 + i * 0.08, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                  className="h-full rounded-full bg-gradient-to-r from-[var(--gold)] to-[#E3C878]"
                />
              </div>
              <p className="tnum ml-8 mt-1 text-[11px] text-[var(--ink-muted)]">{s.qty} sold</p>
            </li>
          ))}
        </ol>
      )}
    </SpineCard>
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

/* ── Recent transactions ───────────────────────────────────────── */
function RecentSales({ sales, ownScope }: { sales: RecentSale[]; ownScope: boolean }) {
  return (
    <SpineCard tone="slate" className="flex h-full flex-col !p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[11px] font-bold tracking-[0.14em] text-[var(--ink-muted)] uppercase">
          {ownScope ? 'My recent sales' : 'Recent transactions'}
        </p>
        <Link
          href="/sales"
          className="flex min-h-[40px] items-center gap-1 rounded-lg px-2 text-sm font-bold text-[var(--wine)] hover:bg-[var(--wine-tint)]"
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
        <ul className="flex-1 divide-y divide-[var(--border)]">
          {sales.slice(0, 6).map((s) => (
            <li key={s.id} className="flex items-center gap-3 py-2.5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-alt)] text-[var(--wine)]">
                <Icon name="receipt" size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-[var(--ink)]">{s.receipt}</p>
                <p className="truncate text-xs text-[var(--ink-muted)]">
                  {timeAgo(s.soldAt)} · {s.items} item{s.items === 1 ? '' : 's'}
                  {!ownScope && ` · ${s.soldBy}`}
                </p>
              </div>
              <span className="hidden shrink-0 xl:inline">
                <StampBadge tone="slate">{METHOD_LABELS[s.method] ?? s.method}</StampBadge>
              </span>
              <span className="tnum shrink-0 text-sm font-bold text-[var(--ink)]">{formatMoney(s.total)}</span>
            </li>
          ))}
        </ul>
      )}
    </SpineCard>
  );
}

/* ── Quick actions ─────────────────────────────────────────────── */
const QUICK_ACTION_TONES: Record<string, string> = {
  wine: 'bg-[var(--wine-tint)] text-[var(--wine)]',
  gold: 'bg-[var(--warning-bg)] text-[var(--warning)]',
  olive: 'bg-[var(--olive-bg)] text-[var(--olive)]',
  brass: 'bg-[#F3EAD3] text-[var(--brass)]',
  slate: 'bg-[var(--surface-alt)] text-[var(--ink-muted)]',
};

function QuickActions({ role }: { role: Role }) {
  const actions = [
    { href: '/sell', icon: 'point_of_sale', label: 'New sale', hint: 'Open the till', show: can(role, 'sell'), tone: 'wine' },
    { href: '/inventory', icon: 'add_box', label: 'Add item', hint: 'New stock record', show: can(role, 'manageInventory'), tone: 'gold' },
    { href: '/purchases', icon: 'shopping_bag', label: 'Receive stock', hint: 'Book deliveries in', show: can(role, 'managePurchases'), tone: 'olive' },
    { href: '/deposits', icon: 'account_balance', label: 'Record deposit', hint: 'Bank the cash', show: can(role, 'manageDeposits'), tone: 'brass' },
    { href: '/reports', icon: 'bar_chart', label: 'Reports', hint: 'Trade summaries', show: can(role, 'viewReports'), tone: 'slate' },
  ].filter((a) => a.show);
  if (actions.length === 0) return null;
  return (
    <SpineCard tone="olive" className="flex h-full flex-col !p-5">
      <p className="mb-4 text-[11px] font-bold tracking-[0.14em] text-[var(--ink-muted)] uppercase">Quick actions</p>
      <div className="grid flex-1 grid-cols-2 content-start gap-2.5">
        {actions.map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="group flex min-h-[88px] flex-col justify-between gap-1 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3.5 transition hover:-translate-y-0.5 hover:border-[var(--wine)]/40 hover:shadow-[var(--shadow)] active:scale-[0.98]"
          >
            <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${QUICK_ACTION_TONES[a.tone]} transition group-hover:scale-110`}>
              <Icon name={a.icon} size={22} />
            </span>
            <span>
              <span className="block text-sm font-bold text-[var(--ink)]">{a.label}</span>
              <span className="block text-[11px] text-[var(--ink-muted)]">{a.hint}</span>
            </span>
          </Link>
        ))}
      </div>
    </SpineCard>
  );
}

/* ── Admin: bottom line ────────────────────────────────────────── */
function AdminProfitStrip({ data }: { data: DashboardData }) {
  const profit = data.grossProfitToday ?? 0;
  const cogs = Math.max(0, data.revenueToday - profit);
  const margin = data.revenueToday > 0 ? (profit / data.revenueToday) * 100 : 0;
  return (
    <SpineCard tone="brass" className="h-full !p-6">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-bold tracking-[0.14em] text-[var(--ink-muted)] uppercase">The bottom line · today</p>
        <StampBadge tone="brass">Admin only</StampBadge>
      </div>
      <div className="mt-5 grid grid-cols-3 gap-4">
        {[
          { label: 'Gross profit', value: profit, fmt: formatMoney, color: 'text-[var(--ink)]' },
          { label: 'Cost of goods', value: cogs, fmt: formatMoney, color: 'text-[var(--ink)]' },
          { label: 'Profit margin', value: margin, fmt: (n: number) => `${n.toFixed(1)}%`, color: 'text-[var(--brass)]' },
        ].map((m) => (
          <div key={m.label} className="min-w-0 border-l-2 border-[var(--brass)]/30 pl-4">
            <p className={`tnum font-display text-2xl break-words xl:text-[28px] ${m.color}`}>
              <CountUp value={m.value} format={m.fmt} />
            </p>
            <p className="mt-1 text-xs font-semibold text-[var(--ink-muted)]">{m.label}</p>
          </div>
        ))}
      </div>
      <div className="mt-5 h-2 overflow-hidden rounded-full bg-[var(--surface-alt)]">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(100, Math.max(0, margin))}%` }}
          transition={{ delay: 0.5, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          className="h-full rounded-full bg-gradient-to-r from-[var(--brass)] to-[#E3C878]"
        />
      </div>
    </SpineCard>
  );
}

/* ── Deposit accounts ──────────────────────────────────────────── */
function DepositsWidget() {
  const [accounts, setAccounts] = useState<{ id: string; name: string; totalDeposited: number }[]>([]);
  useEffect(() => {
    api<{ items: { id: string; name: string; totalDeposited: number }[] }>('/api/v1/deposit-accounts')
      .then((r) => setAccounts(r.items))
      .catch(() => {});
  }, []);
  if (accounts.length === 0) return null;
  return (
    <SpineCard tone="brass" className="flex h-full flex-col !p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-[11px] font-bold tracking-[0.14em] text-[var(--ink-muted)] uppercase">Bank deposits</p>
        <Link
          href="/deposits"
          className="flex min-h-[40px] items-center gap-1 rounded-lg px-2 text-sm font-bold text-[var(--wine)] hover:bg-[var(--wine-tint)]"
        >
          View all <Icon name="arrow_forward" size={18} />
        </Link>
      </div>
      <div className="flex flex-1 flex-col justify-center gap-2.5">
        {accounts.map((a) => (
          <Link
            key={a.id}
            href="/deposits"
            className="flex min-h-[60px] items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 transition hover:border-[var(--brass)]/50 hover:shadow-[var(--shadow)]"
          >
            <span className="flex min-w-0 items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#F3EAD3] text-[var(--brass)]">
                <Icon name="account_balance" size={22} />
              </span>
              <span className="truncate text-sm font-bold text-[var(--ink)]">{a.name}</span>
            </span>
            <span className="tnum shrink-0 font-bold text-[var(--brass)]">{formatMoney(a.totalDeposited)}</span>
          </Link>
        ))}
      </div>
    </SpineCard>
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

  const todayISO = new Date().toISOString().slice(0, 10);
  const { sellers, itemsSold, unbanked, pendingPOs } = useTodayInsights(!data.ownScope, todayISO);

  const avgSale = data.transactionsToday > 0 ? data.revenueToday / data.transactionsToday : 0;
  const daily = data.daily ?? [];
  const todayPt = daily[daily.length - 1];
  const ydayPt = daily[daily.length - 2];
  const revSpark = daily.map((d) => d.revenue);
  const txnSpark = daily.map((d) => d.n);
  const avgSpark = daily.map((d) => (d.n > 0 ? d.revenue / d.n : 0));

  const attentionItems: { icon: string; label: string; detail?: string; href: string; tone: 'wine' | 'gold' | 'olive' | 'slate' | 'danger' | 'brass' }[] = [];
  if (showInventory && data.lowStockCount > 0) {
    attentionItems.push({
      icon: 'inventory_2',
      label: `${data.lowStockCount} low-stock item${data.lowStockCount === 1 ? '' : 's'}`,
      detail: data.lowStock.slice(0, 2).map((i) => i.name).join(' · ') || 'Needs reordering',
      href: '/inventory?filter=low',
      tone: 'danger',
    });
  }
  if (can(role, 'manageDeposits') && unbanked != null && unbanked > 0.5) {
    attentionItems.push({
      icon: 'savings',
      label: `${formatMoney(unbanked)} unbanked cash`,
      detail: "Today's cash sales not yet deposited",
      href: '/deposits',
      tone: 'gold',
    });
  }
  if (can(role, 'managePurchases') && pendingPOs != null && pendingPOs > 0) {
    attentionItems.push({
      icon: 'shopping_bag',
      label: `${pendingPOs} pending purchase order${pendingPOs === 1 ? '' : 's'}`,
      detail: 'Ordered, awaiting receipt',
      href: '/purchases',
      tone: 'brass',
    });
  }
  const showAttention =
    showInventory || can(role, 'manageDeposits') || can(role, 'managePurchases');

  return (
    <motion.div variants={listVariants} initial="hidden" animate="show" className="space-y-5">
      {/* ── Header ── */}
      <motion.div variants={riseVariants} className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-[26px] leading-tight text-[var(--ink)] sm:text-3xl">
            {greeting}, {user.name.split(' ')[0]}
          </h2>
          <p className="mt-0.5 text-sm text-[var(--ink-muted)]">
            {new Date().toLocaleDateString('en-GH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            <span className="mx-2 text-[var(--border)]">|</span>
            {data.ownScope ? 'Showing your sales' : 'Showing all sales'}
          </p>
        </div>
        {can(role, 'sell') && (
          <Link
            href="/sell"
            className="inline-flex h-12 items-center gap-2 rounded-2xl bg-[var(--wine)] px-6 text-[15px] font-bold text-white shadow-[0_6px_20px_rgba(107,35,56,0.35)] transition hover:-translate-y-0.5 hover:bg-[var(--wine-hover)] active:scale-[0.98]"
          >
            <Icon name="point_of_sale" size={20} />
            New sale
          </Link>
        )}
      </motion.div>

      {/* ── KPI band ── */}
      <motion.div variants={listVariants} className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <motion.div variants={riseVariants} className="min-w-0">
          <Kpi
            icon="payments"
            label={data.ownScope ? 'My revenue today' : "Today's revenue"}
            value={<CountUp value={data.revenueToday} format={formatMoney} />}
            delta={<Delta pct={todayPt && ydayPt ? pctChange(todayPt.revenue, ydayPt.revenue) : null} />}
            spark={revSpark}
            sparkColor="#6B2338"
            tone="wine"
          />
        </motion.div>
        <motion.div variants={riseVariants} className="min-w-0">
          <Kpi
            icon="receipt_long"
            label="Transactions"
            value={<CountUp value={data.transactionsToday} format={(n) => Math.round(n).toString()} />}
            delta={<Delta pct={todayPt && ydayPt ? pctChange(todayPt.n, ydayPt.n) : null} />}
            spark={txnSpark}
            sparkColor="#B8923F"
            tone="gold"
          />
        </motion.div>
        <motion.div variants={riseVariants} className="min-w-0">
          <Kpi
            icon="insights"
            label="Average sale"
            value={<CountUp value={avgSale} format={formatMoney} />}
            delta={
              <Delta
                pct={
                  todayPt && ydayPt && ydayPt.n > 0 && todayPt.n > 0
                    ? pctChange(todayPt.revenue / todayPt.n, ydayPt.revenue / ydayPt.n)
                    : null
                }
              />
            }
            spark={avgSpark}
            sparkColor="#6B7F3E"
            tone="olive"
          />
        </motion.div>
        <motion.div variants={riseVariants} className="min-w-0">
          <Kpi
            icon="shopping_basket"
            label="Items sold"
            value={
              itemsSold == null ? (
                <span className="text-[var(--ink-muted)]">—</span>
              ) : (
                <CountUp value={itemsSold} format={(n) => Math.round(n).toString()} />
              )
            }
            sub={data.topItem ? `Top: ${data.topItem.name}` : 'Across all sales today'}
            tone="slate"
          />
        </motion.div>
      </motion.div>

      {/* ── Bento grid ── */}
      <div className="grid grid-cols-12 gap-3 sm:gap-4">
        <motion.div variants={riseVariants} className="col-span-12 min-w-0 xl:col-span-8">
          <RevenueChart daily={daily} />
        </motion.div>
        {showAttention && (
          <motion.div variants={riseVariants} className="col-span-12 min-w-0 xl:col-span-4">
            <SpineCard tone="slate" className="flex h-full flex-col !p-5">
              <p className="mb-4 text-[11px] font-bold tracking-[0.14em] text-[var(--ink-muted)] uppercase">
                Needs attention
              </p>
              <div className="flex-1">
                <AttentionPanel items={attentionItems} />
              </div>
            </SpineCard>
          </motion.div>
        )}

        <motion.div variants={riseVariants} className="col-span-12 min-w-0 md:col-span-6 xl:col-span-4">
          <TopSellers sellers={sellers} fallback={data.topItem} ownScope={data.ownScope} />
        </motion.div>
        <motion.div variants={riseVariants} className="col-span-12 min-w-0 md:col-span-6 xl:col-span-4">
          <RecentSales sales={data.recent} ownScope={data.ownScope} />
        </motion.div>
        <motion.div variants={riseVariants} className="col-span-12 min-w-0 md:col-span-6 xl:col-span-4">
          <QuickActions role={role} />
        </motion.div>

        {showCost && (
          <motion.div variants={riseVariants} className="col-span-12 min-w-0 xl:col-span-8">
            <AdminProfitStrip data={data} />
          </motion.div>
        )}
        {can(role, 'manageDeposits') && (
          <motion.div variants={riseVariants} className={`col-span-12 min-w-0 ${showCost ? 'xl:col-span-4' : 'xl:col-span-12'}`}>
            <DepositsWidget />
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
