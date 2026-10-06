'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { animate, motion } from 'motion/react';
import { can, type Role } from '@/lib/rbac';
import type { SessionUser } from '@/lib/auth';
import { formatMoney, formatMoneyCompact } from '@/lib/money';
import Icon from '@/components/Icon';
import {
  api,
  ChapterHeader,
  StampBadge,
  SpineCard,
  KpiCard,
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

/* ── Day-scoped enrichment from existing report endpoints ─────────
   Presentation-only: consumes existing API routes client-side.
   All failures fall back to the server-rendered DashboardData. */
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

/* ── 7-day revenue chart ───────────────────────────────────────── */
function RevenueChart({ daily }: { daily: DayPoint[] }) {
  const max = Math.max(...daily.map((d) => d.revenue), 1);
  const total = daily.reduce((s, d) => s + d.revenue, 0);
  const todayIdx = daily.length - 1;
  return (
    <SpineCard tone="wine" className="h-full">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-lg text-[var(--ink)]">Revenue · last 7 days</h3>
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
            const isToday = i === todayIdx;
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
                    isToday && d.revenue > 0
                      ? 'bg-[var(--gold)] shadow-[0_0_14px_rgba(184,146,63,0.55)]'
                      : 'bg-[var(--wine)]/80'
                  }`}
                />
                <span className={`text-[11px] font-semibold ${isToday ? 'text-[var(--wine)]' : 'text-[var(--ink-muted)]'}`}>
                  {d.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
      <p className="mt-4 flex items-center gap-2 text-xs text-[var(--ink-muted)]">
        <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[var(--gold)]" aria-hidden="true" />
        Gold bar marks today
      </p>
    </SpineCard>
  );
}

/* ── Top sellers today ─────────────────────────────────────────── */
function TopSellers({ sellers, fallback, ownScope }: { sellers: TopSeller[] | null; fallback: DashboardData['topItem']; ownScope: boolean }) {
  const list = sellers ?? (fallback ? [{ name: fallback.name, qty: fallback.qty, revenue: fallback.revenue }] : []);
  return (
    <SpineCard tone="gold" className="flex h-full flex-col">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="font-display text-lg text-[var(--ink)]">
          {ownScope ? 'My top sellers' : 'Top sellers · today'}
        </h3>
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--warning-bg)] text-[var(--warning)]">
          <Icon name="emoji_events" size={22} />
        </span>
      </div>
      {list.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-10 text-center">
          <Icon name="emoji_events" size={36} className="text-[var(--border-input)]" />
          <p className="text-sm font-medium text-[var(--ink-muted)]">No sales yet today.</p>
        </div>
      ) : (
        <ol className="flex flex-1 flex-col gap-2">
          {list.map((s, i) => (
            <li
              key={`${s.name}-${i}`}
              className="flex min-h-[56px] items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
            >
              <span className="font-display w-9 shrink-0 text-center text-2xl text-[var(--gold)]" aria-hidden="true">
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-bold text-[var(--ink)]">{s.name}</span>
                <span className="tnum block text-[13px] text-[var(--ink-muted)]">
                  {s.qty} sold · {formatMoney(s.revenue)}
                </span>
              </span>
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

/* ── Recent transactions (ledger feed) ─────────────────────────── */
function RecentSales({ sales, ownScope }: { sales: RecentSale[]; ownScope: boolean }) {
  return (
    <SpineCard tone="slate" className="flex h-full flex-col">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="font-display text-lg text-[var(--ink)]">
          {ownScope ? 'My recent sales' : 'Recent transactions'}
        </h3>
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
        <ul className="paper-texture flex-1 rounded-xl border border-[var(--border)] px-3">
          {sales.map((s) => (
            <li key={s.id} className="ledger-row flex items-center gap-3 py-3">
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
              <span className="hidden shrink-0 sm:inline">
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

/* ── Quick actions (big thumb-friendly tiles) ──────────────────── */
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
    <SpineCard tone="olive" className="h-full">
      <h3 className="font-display mb-4 text-lg text-[var(--ink)]">Quick actions</h3>
      <div className="grid grid-cols-2 gap-3">
        {actions.map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="flex min-h-[96px] flex-col items-start justify-between gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 transition hover:-translate-y-0.5 hover:border-[var(--wine)]/40 hover:shadow-[var(--shadow)] active:scale-[0.98]"
          >
            <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${QUICK_ACTION_TONES[a.tone]}`}>
              <Icon name={a.icon} size={24} />
            </span>
            <span>
              <span className="block text-[15px] font-bold text-[var(--ink)]">{a.label}</span>
              <span className="block text-xs text-[var(--ink-muted)]">{a.hint}</span>
            </span>
          </Link>
        ))}
      </div>
    </SpineCard>
  );
}

/* ── Admin strip: profit margin & COGS (brass) ─────────────────── */
function AdminProfitStrip({ data }: { data: DashboardData }) {
  const profit = data.grossProfitToday ?? 0;
  const cogs = Math.max(0, data.revenueToday - profit);
  const margin = data.revenueToday > 0 ? (profit / data.revenueToday) * 100 : 0;
  return (
    <SpineCard tone="brass">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-lg text-[var(--ink)]">The bottom line</h3>
        <StampBadge tone="brass">Admin only</StampBadge>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3">
        <div>
          <p className="tnum font-display text-xl text-[var(--ink)] sm:text-2xl">
            <CountUp value={profit} format={formatMoney} />
          </p>
          <p className="mt-1 text-xs font-semibold text-[var(--ink-muted)]">Gross profit today</p>
        </div>
        <div>
          <p className="tnum font-display text-xl text-[var(--ink)] sm:text-2xl">
            <CountUp value={cogs} format={formatMoney} />
          </p>
          <p className="mt-1 text-xs font-semibold text-[var(--ink-muted)]">Cost of goods</p>
        </div>
        <div>
          <p className="tnum font-display text-xl text-[var(--brass)] sm:text-2xl">
            <CountUp value={margin} format={(n) => `${n.toFixed(1)}%`} />
          </p>
          <p className="mt-1 text-xs font-semibold text-[var(--ink-muted)]">Profit margin</p>
        </div>
      </div>
    </SpineCard>
  );
}

/* ── Deposit accounts summary (brass) ──────────────────────────── */
function DepositsWidget() {
  const [accounts, setAccounts] = useState<{ id: string; name: string; totalDeposited: number }[]>([]);
  useEffect(() => {
    api<{ items: { id: string; name: string; totalDeposited: number }[] }>('/api/v1/deposit-accounts')
      .then((r) => setAccounts(r.items))
      .catch(() => {});
  }, []);
  if (accounts.length === 0) return null;
  return (
    <SpineCard tone="brass">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-display text-lg text-[var(--ink)]">Bank deposits</h3>
        <Link
          href="/deposits"
          className="flex min-h-[44px] items-center gap-1 rounded-lg px-2 text-sm font-bold text-[var(--wine)] hover:bg-[var(--wine-tint)]"
        >
          View all <Icon name="arrow_forward" size={18} />
        </Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {accounts.map((a) => (
          <Link
            key={a.id}
            href="/deposits"
            className="flex min-h-[64px] items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 transition hover:border-[var(--brass)]/50 hover:shadow-[var(--shadow)]"
          >
            <span className="flex items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#F3EAD3] text-[var(--brass)]">
                <Icon name="account_balance" size={22} />
              </span>
              <span className="text-[15px] font-bold text-[var(--ink)]">{a.name}</span>
            </span>
            <span className="tnum font-bold text-[var(--brass)]">{formatMoney(a.totalDeposited)}</span>
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

  /* Attention items — cross-links to the fixing pages */
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
    <motion.div variants={listVariants} initial="hidden" animate="show" className="space-y-8">
      {/* Greeting */}
      <motion.div variants={riseVariants} className="flex flex-wrap items-end justify-between gap-3">
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

      {/* Chapter One — Today's trade */}
      <section aria-label="Today's trade">
        <ChapterHeader eyebrow="Chapter One" number={1} title="Today's trade" />
        <motion.div variants={listVariants} className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          <KpiCard
            icon="payments"
            label={data.ownScope ? 'My revenue today' : "Today's revenue"}
            value={<CountUp value={data.revenueToday} format={formatMoney} />}
            tone="wine"
          />
          <KpiCard
            icon="receipt_long"
            label="Transactions"
            value={<CountUp value={data.transactionsToday} format={(n) => Math.round(n).toString()} />}
            tone="gold"
          />
          <KpiCard
            icon="insights"
            label="Average sale"
            value={<CountUp value={avgSale} format={formatMoney} />}
            tone="olive"
          />
          <KpiCard
            icon="shopping_basket"
            label="Items sold"
            value={
              itemsSold == null ? (
                <span className="text-[var(--ink-muted)]">—</span>
              ) : (
                <CountUp value={itemsSold} format={(n) => Math.round(n).toString()} />
              )
            }
            tone="slate"
          />
        </motion.div>
      </section>

      {/* Chapter Two — The week in view */}
      <section aria-label="The week in view">
        <ChapterHeader eyebrow="Chapter Two" number={2} title="The week in view" />
        <div className={`grid gap-4 sm:gap-6 ${showAttention ? 'lg:grid-cols-5' : ''}`}>
          <motion.div variants={riseVariants} className={`min-w-0 ${showAttention ? 'lg:col-span-3' : ''}`}>
            <RevenueChart daily={data.daily} />
          </motion.div>
          {showAttention && (
            <motion.div variants={riseVariants} className="min-w-0 lg:col-span-2">
              <h3 className="font-display mb-4 text-lg text-[var(--ink)]">Needs attention</h3>
              <AttentionPanel items={attentionItems} />
            </motion.div>
          )}
        </div>
      </section>

      {/* Chapter Three — Floor & counter */}
      <section aria-label="Floor and counter">
        <ChapterHeader eyebrow="Chapter Three" number={3} title="Floor & counter" />
        <div className="grid gap-4 sm:gap-6 lg:grid-cols-3">
          <motion.div variants={riseVariants} className="min-w-0">
            <TopSellers sellers={sellers} fallback={data.topItem} ownScope={data.ownScope} />
          </motion.div>
          <motion.div variants={riseVariants} className="min-w-0">
            <RecentSales sales={data.recent} ownScope={data.ownScope} />
          </motion.div>
          <motion.div variants={riseVariants} className="min-w-0">
            <QuickActions role={role} />
          </motion.div>
        </div>
      </section>

      {/* Chapter Four — The bottom line (admin only) */}
      {showCost && (
        <section aria-label="The bottom line">
          <ChapterHeader eyebrow="Chapter Four" number={4} title="The bottom line" />
          <motion.div variants={riseVariants}>
            <AdminProfitStrip data={data} />
          </motion.div>
        </section>
      )}

      {/* Deposit accounts */}
      {can(role, 'manageDeposits') && (
        <motion.div variants={riseVariants}>
          <DepositsWidget />
        </motion.div>
      )}
    </motion.div>
  );
}
