'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { animate, motion } from 'motion/react';
import type { SessionUser } from '@/lib/auth';
import Icon from '@/components/Icon';
import { formatMoney, formatMoneyCompact } from '@/lib/money';
import {
  api,
  listVariants,
  riseVariants,
  PageHeader,
  SecondaryButton,
  Badge,
  Field,
  inputClass,
  EmptyState,
  ErrorState,
  SkeletonCards,
  SkeletonRows,
  ChapterHeader,
  StampBadge,
  SpineCard,
  KpiCard,
} from '@/components/ui';

/* ═══════════════════════ Types ═══════════════════════ */

interface Summary {
  from: string;
  to: string;
  revenue: number;
  transactions: number;
  discounts: number;
  cogs: number;
  grossProfit: number;
}

interface DayPoint {
  day: string;
  revenue: number;
  transactions: number;
}

interface MethodPoint {
  paymentMethod: string;
  revenue: number;
  transactions: number;
}

interface TopItem {
  productId: string;
  productName: string;
  quantity: number;
  revenue: number;
  cogs?: number;
}

const METHOD_LABELS: Record<string, string> = {
  cash: 'Cash',
  card: 'Card',
  mobile_money: 'Mobile Money',
  bank_transfer: 'Bank Transfer',
  other: 'Other',
};

const METHOD_ICONS: Record<string, string> = {
  cash: 'payments',
  card: 'credit_card',
  mobile_money: 'smartphone',
  bank_transfer: 'account_balance',
  other: 'wallet',
};

/* Wine / gold / olive palette for the method bars */
const METHOD_TONES: Record<string, string> = {
  cash: 'bg-[var(--gold)]',
  card: 'bg-[var(--wine)]',
  mobile_money: 'bg-[var(--olive)]',
  bank_transfer: 'bg-[var(--brass)]',
  other: 'bg-[var(--ink-muted)]',
};

type Preset = 'today' | 'week' | 'month' | 'custom';

const PRESETS: { value: Preset; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'custom', label: 'Custom' },
];

function rangeFor(preset: Preset, customFrom: string, customTo: string): { from: string; to: string } {
  const now = new Date();
  const startOfDay = (d: Date) => {
    const c = new Date(d);
    c.setHours(0, 0, 0, 0);
    return c;
  };
  const endOfDay = (d: Date) => {
    const c = new Date(d);
    c.setHours(23, 59, 59, 999);
    return c;
  };
  if (preset === 'today') return { from: startOfDay(now).toISOString(), to: endOfDay(now).toISOString() };
  if (preset === 'week') {
    const monday = new Date(now);
    const dow = (monday.getDay() + 6) % 7;
    monday.setDate(monday.getDate() - dow);
    return { from: startOfDay(monday).toISOString(), to: endOfDay(now).toISOString() };
  }
  if (preset === 'month') {
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: startOfDay(first).toISOString(), to: endOfDay(now).toISOString() };
  }
  const from = customFrom ? startOfDay(new Date(customFrom)) : startOfDay(now);
  const to = customTo ? endOfDay(new Date(customTo)) : endOfDay(now);
  return { from: from.toISOString(), to: to.toISOString() };
}

function dayLabel(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-GH', { day: 'numeric', month: 'short' });
}

/* ═══════════════════════ Count-up ═══════════════════════ */

function CountUp({ value, format }: { value: number; format: (n: number) => string }) {
  const [display, setDisplay] = useState(() => format(0));
  useEffect(() => {
    const controls = animate(0, value, {
      duration: 0.9,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setDisplay(format(v)),
    });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return <span className="tnum">{display}</span>;
}

/* ═══════════════════════ Report library ═══════════════════════ */

type SpineTone = 'wine' | 'gold' | 'olive' | 'slate' | 'brass' | 'terracotta';

interface ReportDef {
  id: string;
  icon: string;
  name: string;
  desc: string;
  tone: SpineTone;
  openable: boolean;
}

interface ChapterDef {
  chapter: string;
  title: string;
  reports: ReportDef[];
}

/* The Sales and Profit reports share one data-backed report view
   (the API exposes sales + profit in the same endpoints). The Inventory
   reports below are backed by /api/v1/reports/stock, /low-stock and
   /movements. Staff and Deposits reports are still "Coming soon". */
const REPORT_LIBRARY: ChapterDef[] = [
  {
    chapter: 'Chapter One',
    title: 'Sales reports',
    reports: [
      {
        id: 'sales-overview',
        icon: 'payments',
        name: 'Sales overview',
        desc: 'Revenue, transactions and payment-method split for any period.',
        tone: 'wine',
        openable: true,
      },
    ],
  },
  {
    chapter: 'Chapter Two',
    title: 'Profit reports',
    reports: [
      {
        id: 'profit-summary',
        icon: 'trending_up',
        name: 'Profit summary',
        desc: 'Gross profit, cost of goods sold and discounts given.',
        tone: 'gold',
        openable: true,
      },
    ],
  },
  {
    chapter: 'Chapter Three',
    title: 'Inventory reports',
    reports: [
      {
        id: 'stock-movement',
        icon: 'inventory_2',
        name: 'Stock movement',
        desc: 'Stock in, stock out and adjustments across locations.',
        tone: 'olive',
        openable: true,
      },
      {
        id: 'low-stock',
        icon: 'warning',
        name: 'Low stock',
        desc: 'Items running low or out of stock, by location.',
        tone: 'olive',
        openable: true,
      },
    ],
  },
  {
    chapter: 'Chapter Four',
    title: 'Staff reports',
    reports: [
      {
        id: 'cashier-performance',
        icon: 'group',
        name: 'Cashier performance',
        desc: 'Sales, transactions and discounts per cashier.',
        tone: 'brass',
        openable: false,
      },
    ],
  },
  {
    chapter: 'Chapter Five',
    title: 'Deposits reports',
    reports: [
      {
        id: 'deposit-summary',
        icon: 'account_balance',
        name: 'Deposit summary',
        desc: 'Bank deposits recorded for each deposit account.',
        tone: 'slate',
        openable: false,
      },
    ],
  },
];

function pctDelta(cur: number, prev: number | undefined): { text: string; up: boolean } | null {
  if (prev == null) return null;
  if (prev === 0) return cur === 0 ? { text: '±0%', up: true } : { text: '+100%', up: true };
  const d = ((cur - prev) / Math.abs(prev)) * 100;
  return { text: `${d >= 0 ? '+' : ''}${d.toFixed(1)}%`, up: d >= 0 };
}

/* ═══════════════════════ Main component ═══════════════════════ */

export default function ReportsClient({ user }: { user: SessionUser }) {
  void user;

  /* Library ↔ report navigation (anti-dead-end: report always offers back) */
  const [view, setView] = useState<'library' | 'report'>('library');
  const [activeReport, setActiveReport] = useState<{ id: string; name: string } | null>(null);

  const [preset, setPreset] = useState<Preset>('today');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [compare, setCompare] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [prevSummary, setPrevSummary] = useState<Summary | null>(null);
  const [days, setDays] = useState<DayPoint[]>([]);
  const [methods, setMethods] = useState<MethodPoint[]>([]);
  const [topItems, setTopItems] = useState<TopItem[]>([]);

  const { from, to } = useMemo(
    () => rangeFor(preset, customFrom, customTo),
    [preset, customFrom, customTo]
  );

  /* Previous period of equal length, ending one millisecond before `from`. */
  const prevRange = useMemo(() => {
    if (!compare) return null;
    const fromMs = new Date(from).getTime();
    const toMs = new Date(to).getTime();
    const len = Math.max(1, toMs - fromMs);
    return {
      from: new Date(fromMs - len).toISOString(),
      to: new Date(fromMs - 1).toISOString(),
    };
  }, [compare, from, to]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams({ from, to });
      const calls: Promise<unknown>[] = [
        api<Summary>(`/api/v1/reports/summary?${q}`),
        api<{ days: DayPoint[] }>(`/api/v1/reports/sales-by-day?${q}`),
        api<{ methods: MethodPoint[] }>(`/api/v1/reports/by-payment?${q}`),
        api<{ items: TopItem[] }>(`/api/v1/reports/top-items?${q}&limit=10`),
      ];
      /* Same contract, same params — only the date window differs. */
      if (prevRange) {
        const pq = new URLSearchParams({ from: prevRange.from, to: prevRange.to });
        calls.push(api<Summary>(`/api/v1/reports/summary?${pq}`));
      }
      const results = await Promise.all(calls);
      const [s, d, m, t] = results as [
        Summary,
        { days: DayPoint[] },
        { methods: MethodPoint[] },
        { items: TopItem[] },
      ];
      setSummary(s);
      setDays(d.days ?? []);
      setMethods(m.methods ?? []);
      setTopItems(t.items ?? []);
      setPrevSummary(prevRange ? (results[4] as Summary) : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load reports.');
    } finally {
      setLoading(false);
    }
  }, [from, to, prevRange]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const maxDay = Math.max(...days.map((d) => d.revenue), 1);
  const totalMethodRevenue = methods.reduce((s, m) => s + m.revenue, 0);

  /* End-of-day cash-up: today's cash performance */
  const cashMethod = methods.find((m) => m.paymentMethod === 'cash');
  const cashUp = useMemo(() => {
    if (!summary) return null;
    return {
      cashRevenue: cashMethod?.revenue ?? 0,
      cashTxns: cashMethod?.transactions ?? 0,
      totalRevenue: summary.revenue,
      totalTxns: summary.transactions,
      discounts: summary.discounts,
    };
  }, [summary, cashMethod]);

  const openReport = (r: ReportDef) => {
    setActiveReport({ id: r.id, name: r.name });
    setView('report');
    window.scrollTo({ top: 0 });
  };

  const backToLibrary = () => {
    setView('library');
    setActiveReport(null);
    window.scrollTo({ top: 0 });
  };

  /* CSV export — built from already-fetched data; no new API calls. */
  const exportCsv = () => {
    if (!summary) return;
    const period = `${new Date(from).toLocaleDateString('en-GH')} – ${new Date(to).toLocaleDateString('en-GH')}`;
    const rows: (string | number)[][] = [
      ['Report', activeReport?.name ?? 'Sales overview'],
      ['Period', period],
      [],
      ['Metric', 'Value'],
      ['Revenue', summary.revenue],
      ['Transactions', summary.transactions],
      ['Gross profit', summary.grossProfit],
      ['Cost of goods sold', summary.cogs],
      ['Discounts given', summary.discounts],
      [],
      ['Day', 'Revenue', 'Transactions'],
      ...days.map((d) => [d.day, d.revenue, d.transactions]),
      [],
      ['Payment method', 'Revenue', 'Transactions'],
      ...methods.map((m) => [METHOD_LABELS[m.paymentMethod] ?? m.paymentMethod, m.revenue, m.transactions]),
      [],
      ['Top items — Item', 'Qty sold', 'Revenue'],
      ...topItems.map((t) => [t.productName, t.quantity, t.revenue]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `report-${from.slice(0, 10)}-to-${to.slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  /* ─────────────── Library home ─────────────── */

  if (view === 'library') {
    return (
      <motion.div variants={listVariants} initial="hidden" animate="show">
        <PageHeader
          title="Reports"
          subtitle="Pick a report to open — sales, profit, stock, staff and deposits"
        />
        {REPORT_LIBRARY.map((ch) => (
          <section key={ch.chapter} aria-label={ch.title} className="mb-7 last:mb-0">
            <ChapterHeader eyebrow={ch.chapter} title={ch.title} />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {ch.reports.map((r) => (
                <SpineCard key={r.id} tone={r.tone} className={!r.openable ? 'opacity-70' : ''}>
                  <div className="flex items-start gap-3.5">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-alt)] text-[var(--wine)]">
                      <Icon name={r.icon} size={24} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-display text-lg leading-tight text-[var(--ink)]">{r.name}</h3>
                        {!r.openable && <StampBadge tone="slate">Coming soon</StampBadge>}
                      </div>
                      <p className="mt-1 text-sm text-[var(--ink-muted)]">{r.desc}</p>
                    </div>
                  </div>
                  {r.openable && (
                    <div className="mt-4 flex justify-end">
                      <SecondaryButton onClick={() => openReport(r)}>
                        Open <Icon name="arrow_forward" size={20} />
                      </SecondaryButton>
                    </div>
                  )}
                </SpineCard>
              ))}
            </div>
          </section>
        ))}
      </motion.div>
    );
  }

  /* ─────────────── Inventory report views ─────────────── */

  if (
    view === 'report' &&
    (activeReport?.id === 'stock-movement' || activeReport?.id === 'low-stock')
  ) {
    return (
      <motion.div variants={listVariants} initial="hidden" animate="show">
        <nav aria-label="Breadcrumb" className="mb-4">
          <button
            type="button"
            onClick={backToLibrary}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-3 text-sm font-bold text-[var(--wine)] transition hover:bg-[var(--wine-tint)]"
          >
            <Icon name="arrow_back" size={20} /> Reports library
          </button>
        </nav>
        <PageHeader
          title={activeReport.name}
          subtitle={
            activeReport.id === 'low-stock'
              ? 'Items flagged by the low-stock rules, with shop and warehouse quantities'
              : 'Current stock by location, plus every stock movement in the period'
          }
        />
        <InventoryReportView reportId={activeReport.id} />
      </motion.div>
    );
  }

  /* ─────────────── Report view ─────────────── */

  const revenueDelta = pctDelta(summary?.revenue ?? 0, prevSummary?.revenue);
  const txnsDelta = pctDelta(summary?.transactions ?? 0, prevSummary?.transactions);
  const profitDelta = pctDelta(summary?.grossProfit ?? 0, prevSummary?.grossProfit);
  const discountsDelta = pctDelta(summary?.discounts ?? 0, prevSummary?.discounts);

  return (
    <motion.div variants={listVariants} initial="hidden" animate="show">
      {/* Breadcrumb back — anti-dead-end */}
      <nav aria-label="Breadcrumb" className="mb-4">
        <button
          type="button"
          onClick={backToLibrary}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-3 text-sm font-bold text-[var(--wine)] transition hover:bg-[var(--wine-tint)]"
        >
          <Icon name="arrow_back" size={20} /> Reports library
        </button>
      </nav>

      <PageHeader
        title={activeReport?.name ?? 'Sales overview'}
        subtitle={compare ? 'Compared with the previous equal-length period' : 'Revenue, profit and best-sellers at a glance'}
      />

      {/* Warm filter bar */}
      <motion.div
        variants={riseVariants}
        className="paper-texture mb-5 rounded-2xl border border-[var(--border)] p-4 shadow-[var(--shadow)]"
      >
        <div className="flex flex-wrap items-center gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => setPreset(p.value)}
              aria-pressed={preset === p.value}
              className={`inline-flex min-h-[44px] items-center rounded-full px-4 text-sm font-semibold transition ${
                preset === p.value
                  ? 'bg-[var(--wine)] text-white'
                  : 'bg-[var(--surface-alt)] text-[var(--ink-muted)] hover:bg-[var(--wine-tint)] hover:text-[var(--wine)]'
              }`}
            >
              {p.label}
            </button>
          ))}
          {/* Compare-to-previous toggle */}
          <button
            type="button"
            role="switch"
            aria-checked={compare}
            onClick={() => setCompare((c) => !c)}
            className={`inline-flex min-h-[44px] items-center gap-2 rounded-full border px-4 text-sm font-semibold transition ${
              compare
                ? 'border-[var(--gold)] bg-[var(--gold)]/15 text-[var(--warning)]'
                : 'border-[var(--border-input)] bg-[var(--surface)] text-[var(--ink-muted)] hover:bg-[var(--surface-alt)]'
            }`}
          >
            <Icon name="compare_arrows" size={20} />
            Compare {compare ? 'on' : 'off'}
          </button>
          {preset === 'custom' && (
            <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <Field label="From" htmlFor="r-from">
                  <input
                    id="r-from"
                    type="date"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    className={inputClass}
                  />
                </Field>
              </div>
              <div className="flex-1">
                <Field label="To" htmlFor="r-to">
                  <input
                    id="r-to"
                    type="date"
                    value={customTo}
                    min={customFrom || undefined}
                    onChange={(e) => setCustomTo(e.target.value)}
                    className={inputClass}
                  />
                </Field>
              </div>
            </div>
          )}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <SecondaryButton onClick={exportCsv} disabled={!summary}>
              <Icon name="download" size={20} /> CSV
            </SecondaryButton>
            <SecondaryButton onClick={fetchAll}>
              <Icon name="refresh" size={20} /> Refresh
            </SecondaryButton>
          </div>
        </div>
      </motion.div>

      {loading ? (
        <>
          <SkeletonCards count={4} />
          <div className="mt-4"><SkeletonRows rows={6} /></div>
        </>
      ) : error ? (
        <ErrorState message={error} onRetry={fetchAll} />
      ) : summary ? (
        <>
          {/* KPI cards with deltas when comparing */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              icon="payments"
              label="Revenue"
              tone="wine"
              value={<CountUp value={summary.revenue} format={formatMoney} />}
              delta={revenueDelta?.text}
              deltaUp={revenueDelta?.up}
            />
            <KpiCard
              icon="receipt_long"
              label="Transactions"
              tone="gold"
              value={<CountUp value={summary.transactions} format={(n) => String(Math.round(n))} />}
              delta={txnsDelta?.text}
              deltaUp={txnsDelta?.up}
            />
            <KpiCard
              icon="trending_up"
              label="Gross profit"
              tone="olive"
              value={<CountUp value={summary.grossProfit} format={formatMoney} />}
              delta={profitDelta?.text}
              deltaUp={profitDelta?.up}
            />
            <KpiCard
              icon="percent"
              label="Discounts given"
              tone="slate"
              value={<CountUp value={summary.discounts} format={formatMoney} />}
              delta={discountsDelta?.text}
              deltaUp={discountsDelta?.up}
            />
          </div>
          <p className="tnum mt-2 text-[13px] text-[var(--ink-muted)]">
            {summary.transactions} transaction{summary.transactions === 1 ? '' : 's'} · COGS{' '}
            {formatMoney(summary.cogs)}
            {compare && prevSummary && (
              <> · previous period revenue {formatMoney(prevSummary.revenue)}</>
            )}
          </p>

          {/* Revenue by day */}
          <motion.section
            variants={riseVariants}
            aria-label="Revenue by day"
            className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow)] sm:p-6"
          >
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-lg text-[var(--ink)]">Revenue by day</h2>
                <p className="text-sm text-[var(--ink-muted)]">
                  Total <span className="tnum font-bold text-[var(--ink)]">{formatMoney(summary.revenue)}</span>
                </p>
              </div>
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--wine-tint)] text-[var(--wine)]">
                <Icon name="bar_chart" size={22} />
              </span>
            </div>
            {days.length === 0 || summary.revenue === 0 ? (
              <EmptyState icon="bar_chart" title="No sales in this period" body="Try a wider date range." />
            ) : (
              <div
                className="flex h-52 items-end gap-1 sm:gap-2"
                role="img"
                aria-label={`Bar chart of revenue by day, total ${formatMoney(summary.revenue)}`}
              >
                {days.map((d, i) => {
                  const peak = d.revenue === maxDay && d.revenue > 0;
                  return (
                    <div key={d.day} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
                      <span className="tnum text-[11px] font-bold text-[var(--ink-muted)]">
                        {d.revenue > 0 ? formatMoneyCompact(d.revenue) : ''}
                      </span>
                      <motion.div
                        initial={{ scaleY: 0 }}
                        animate={{ scaleY: 1 }}
                        transition={{ delay: 0.15 + i * 0.04, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                        style={{ height: `${Math.max(2, (d.revenue / maxDay) * 72)}%` }}
                        title={`${dayLabel(d.day)}: ${formatMoney(d.revenue)} · ${d.transactions} sales`}
                        className={`w-full max-w-14 origin-bottom rounded-t-lg ${
                          peak
                            ? 'bg-[var(--gold)] shadow-[0_0_12px_rgba(184,146,63,0.5)]'
                            : 'bg-[var(--wine)]/80'
                        }`}
                      />
                      <span className="truncate text-[11px] font-semibold text-[var(--ink-muted)]">
                        {dayLabel(d.day)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </motion.section>

          <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
            {/* By payment method */}
            <motion.section
              variants={riseVariants}
              aria-label="Revenue by payment method"
              className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow)] sm:p-6"
            >
              <h2 className="font-display text-lg text-[var(--ink)]">By payment method</h2>
              {methods.length === 0 ? (
                <p className="mt-4 text-sm text-[var(--ink-muted)]">No payments in this period.</p>
              ) : (
                <ul className="mt-4 space-y-4">
                  {methods.map((m, i) => {
                    const pct = totalMethodRevenue > 0 ? (m.revenue / totalMethodRevenue) * 100 : 0;
                    return (
                      <li key={m.paymentMethod}>
                        <div className="flex items-center justify-between gap-3">
                          <span className="flex items-center gap-2.5">
                            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--surface-alt)] text-[var(--wine)]">
                              <Icon name={METHOD_ICONS[m.paymentMethod] ?? 'wallet'} size={18} />
                            </span>
                            <span className="text-sm font-bold">
                              {METHOD_LABELS[m.paymentMethod] ?? m.paymentMethod}
                            </span>
                            <Badge tone="gray">{m.transactions}</Badge>
                          </span>
                          <span className="tnum text-sm font-bold">{formatMoney(m.revenue)}</span>
                        </div>
                        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-[var(--surface-alt)]">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            transition={{ delay: 0.2 + i * 0.08, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                            className={`h-full rounded-full ${METHOD_TONES[m.paymentMethod] ?? 'bg-[var(--ink-muted)]'}`}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </motion.section>

            {/* Cash-up */}
            <SpineCard tone="gold" aria-label="End of day cash-up">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-display text-lg text-[var(--ink)]">Cash-up summary</h2>
                <StampBadge tone={preset === 'today' ? 'olive' : 'slate'}>
                  {preset === 'today' ? 'Today' : 'Selected period'}
                </StampBadge>
              </div>
              {cashUp ? (
                <dl className="mt-4 space-y-3 text-[15px]">
                  <div className="flex items-center justify-between rounded-xl bg-[var(--success-bg)] px-4 py-3">
                    <dt className="flex items-center gap-2 font-bold text-[var(--success)]">
                      <Icon name="payments" size={20} /> Expected cash in drawer
                    </dt>
                    <dd className="tnum text-xl font-bold text-[var(--success)]">
                      {formatMoney(cashUp.cashRevenue)}
                    </dd>
                  </div>
                  <div className="flex justify-between px-1">
                    <dt className="text-[var(--ink-muted)]">Cash transactions</dt>
                    <dd className="tnum font-bold">{cashUp.cashTxns}</dd>
                  </div>
                  <div className="flex justify-between px-1">
                    <dt className="text-[var(--ink-muted)]">All revenue</dt>
                    <dd className="tnum font-bold">{formatMoney(cashUp.totalRevenue)}</dd>
                  </div>
                  <div className="flex justify-between px-1">
                    <dt className="text-[var(--ink-muted)]">Discounts given</dt>
                    <dd className="tnum font-bold">{formatMoney(cashUp.discounts)}</dd>
                  </div>
                  <p className="rounded-lg bg-[var(--surface-alt)] px-4 py-3 text-xs text-[var(--ink-muted)]">
                    Count the physical cash in the drawer and compare it with the expected
                    amount above. Any difference should be recorded as an adjustment with a note.
                  </p>
                </dl>
              ) : (
                <p className="mt-4 text-sm text-[var(--ink-muted)]">No data for this period.</p>
              )}
            </SpineCard>
          </div>

          {/* Top items */}
          <motion.section
            variants={riseVariants}
            aria-label="Top selling items"
            className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow)] sm:p-6"
          >
            <h2 className="font-display text-lg text-[var(--ink)]">Top 10 items</h2>
            {topItems.length === 0 ? (
              <p className="mt-4 text-sm text-[var(--ink-muted)]">No item sales in this period.</p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-[15px]">
                  <thead>
                    <tr className="ledger-row text-[13px] uppercase tracking-wide text-[var(--ink-muted)]">
                      <th scope="col" className="py-3 pr-4 font-semibold">#</th>
                      <th scope="col" className="py-3 pr-4 font-semibold">Item</th>
                      <th scope="col" className="py-3 pr-4 text-right font-semibold">Qty sold</th>
                      <th scope="col" className="py-3 text-right font-semibold">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topItems.map((t, i) => (
                      <tr key={t.productId} className="ledger-row">
                        <td className="py-3 pr-4">
                          <span
                            className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
                              i < 3
                                ? 'bg-[var(--gold)]/20 text-[var(--warning)]'
                                : 'bg-[var(--surface-alt)] text-[var(--ink-muted)]'
                            }`}
                          >
                            {i + 1}
                          </span>
                        </td>
                        <td className="py-3 pr-4 font-semibold">{t.productName}</td>
                        <td className="tnum py-3 pr-4 text-right font-bold">{t.quantity}</td>
                        <td className="tnum py-3 text-right font-bold">{formatMoney(t.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </motion.section>
        </>
      ) : (
        <EmptyState icon="bar_chart" title="No report data" />
      )}
    </motion.div>
  );
}

/* ═══════════════════════ Inventory reports ═══════════════════════ */

interface StockRow {
  id: string;
  name: string;
  sku: string | null;
  categoryName: string | null;
  productType: string;
  quantityShop: number;
  quantityWarehouse: number;
  quantityOnHand: number;
  reorderLevel: number;
  sellingPrice: number;
  isLow: boolean;
  lowReason: string | null;
}

interface MovementRow {
  id: string;
  productName: string;
  sku: string | null;
  movementType: string;
  quantityChange: number;
  unitCost: number | null;
  referenceType: string | null;
  notes: string | null;
  createdByName: string | null;
  createdAt: string;
}

const MOVEMENT_LABELS: Record<string, string> = {
  purchase_receipt: 'Purchase receipt',
  sale: 'Sale',
  adjustment: 'Adjustment',
  return: 'Return',
  damage: 'Damage',
  transfer_out: 'Transfer out',
  transfer_in: 'Transfer in',
  delivery: 'Warehouse delivery',
  credit_sale: 'Credit sale',
};

function StockTable({ rows, showReason }: { rows: StockRow[]; showReason?: boolean }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon="inventory_2"
        title="Nothing to show"
        body={showReason ? 'No items are low on stock right now.' : 'No active items.'}
      />
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-[15px]">
        <thead>
          <tr className="ledger-row text-[13px] uppercase tracking-wide text-[var(--ink-muted)]">
            <th scope="col" className="py-3 pr-4 font-semibold">Item</th>
            <th scope="col" className="py-3 pr-4 font-semibold">Category</th>
            <th scope="col" className="py-3 pr-4 text-right font-semibold">Shop</th>
            <th scope="col" className="py-3 pr-4 text-right font-semibold">Warehouse</th>
            <th scope="col" className="py-3 pr-4 text-right font-semibold">Total</th>
            <th scope="col" className="py-3 font-semibold">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="ledger-row">
              <td className="py-3 pr-4 font-semibold">{r.name}</td>
              <td className="py-3 pr-4 text-[var(--ink-muted)]">{r.categoryName ?? '—'}</td>
              <td className="tnum py-3 pr-4 text-right font-bold">{r.quantityShop}</td>
              <td className="tnum py-3 pr-4 text-right font-bold">{r.quantityWarehouse}</td>
              <td className="tnum py-3 pr-4 text-right font-bold">{r.quantityOnHand}</td>
              <td className="py-3">
                {r.isLow ? (
                  <span className="flex flex-col gap-0.5">
                    <Badge tone="red">Low stock</Badge>
                    {showReason && r.lowReason && (
                      <span className="text-xs text-[var(--danger)]">{r.lowReason}</span>
                    )}
                  </span>
                ) : (
                  <Badge tone="green">In stock</Badge>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InventoryReportView({ reportId }: { reportId: string }) {
  const [stock, setStock] = useState<StockRow[] | null>(null);
  const [movements, setMovements] = useState<MovementRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mvFrom, setMvFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [mvTo, setMvTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [mvType, setMvType] = useState('');

  const fetchStock = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api<{ items: StockRow[] }>(
        reportId === 'low-stock' ? '/api/v1/reports/low-stock' : '/api/v1/reports/stock'
      );
      setStock(data.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load stock report.');
    } finally {
      setLoading(false);
    }
  }, [reportId]);

  const fetchMovements = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        from: new Date(mvFrom).toISOString(),
        to: new Date(new Date(mvTo).setHours(23, 59, 59, 999)).toISOString(),
      });
      if (mvType) params.set('type', mvType);
      const data = await api<{ items: MovementRow[] }>(`/api/v1/reports/movements?${params}`);
      setMovements(data.items);
    } catch {
      setMovements([]);
    }
  }, [mvFrom, mvTo, mvType]);

  useEffect(() => {
    fetchStock();
  }, [fetchStock]);

  useEffect(() => {
    if (reportId === 'stock-movement') fetchMovements();
  }, [reportId, fetchMovements]);

  if (loading) {
    return (
      <>
        <SkeletonCards count={2} />
        <div className="mt-4"><SkeletonRows rows={6} /></div>
      </>
    );
  }
  if (error) return <ErrorState message={error} onRetry={fetchStock} />;

  return (
    <div>
      {reportId === 'low-stock' && (
        <motion.div
          variants={riseVariants}
          className="paper-texture mb-5 rounded-2xl border border-[var(--border)] p-4 shadow-[var(--shadow)] sm:p-5"
        >
          <h2 className="font-display text-base text-[var(--ink)]">Low-stock rules</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[var(--ink-muted)]">
            <li><strong className="text-[var(--ink)]">Bishop Books</strong> — low when shop stock is under 10 <em>or</em> warehouse stock is under 100.</li>
            <li><strong className="text-[var(--ink)]">Bibles</strong> — low when total stock is under 2.</li>
            <li><strong className="text-[var(--ink)]">All other items</strong> — low at or below their reorder level.</li>
          </ul>
        </motion.div>
      )}

      <motion.section
        variants={riseVariants}
        aria-label={reportId === 'low-stock' ? 'Low stock items' : 'Stock by location'}
        className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow)] sm:p-6"
      >
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="font-display text-lg text-[var(--ink)]">
            {reportId === 'low-stock' ? 'Low-stock items' : 'Stock by location'}
          </h2>
          <SecondaryButton onClick={fetchStock}>
            <Icon name="refresh" size={20} /> Refresh
          </SecondaryButton>
        </div>
        <StockTable rows={stock ?? []} showReason />
      </motion.section>

      {reportId === 'stock-movement' && (
        <motion.section
          variants={riseVariants}
          aria-label="Stock movements"
          className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow)] sm:p-6"
        >
          <h2 className="font-display text-lg text-[var(--ink)]">Stock movements</h2>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="From" htmlFor="mv-from">
              <input id="mv-from" type="date" className={inputClass} value={mvFrom}
                onChange={(e) => setMvFrom(e.target.value)} />
            </Field>
            <Field label="To" htmlFor="mv-to">
              <input id="mv-to" type="date" className={inputClass} value={mvTo} min={mvFrom || undefined}
                onChange={(e) => setMvTo(e.target.value)} />
            </Field>
            <Field label="Type" htmlFor="mv-type">
              <select id="mv-type" className={inputClass} value={mvType}
                onChange={(e) => setMvType(e.target.value)}>
                <option value="">All types</option>
                {Object.entries(MOVEMENT_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </Field>
          </div>
          {movements == null ? (
            <div className="mt-4"><SkeletonRows rows={5} /></div>
          ) : movements.length === 0 ? (
            <p className="mt-4 text-sm text-[var(--ink-muted)]">No movements in this period.</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[680px] text-left text-[15px]">
                <thead>
                  <tr className="ledger-row text-[13px] uppercase tracking-wide text-[var(--ink-muted)]">
                    <th scope="col" className="py-3 pr-4 font-semibold">Date</th>
                    <th scope="col" className="py-3 pr-4 font-semibold">Item</th>
                    <th scope="col" className="py-3 pr-4 font-semibold">Type</th>
                    <th scope="col" className="py-3 pr-4 text-right font-semibold">Change</th>
                    <th scope="col" className="py-3 font-semibold">By / notes</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((m) => (
                    <tr key={m.id} className="ledger-row">
                      <td className="py-3 pr-4 whitespace-nowrap text-[var(--ink-muted)]">
                        {new Date(m.createdAt).toLocaleString('en-GH', {
                          day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                        })}
                      </td>
                      <td className="py-3 pr-4 font-semibold">{m.productName}</td>
                      <td className="py-3 pr-4">{MOVEMENT_LABELS[m.movementType] ?? m.movementType}</td>
                      <td className={`tnum py-3 pr-4 text-right font-bold ${m.quantityChange < 0 ? 'text-[var(--danger)]' : 'text-[var(--success)]'}`}>
                        {m.quantityChange > 0 ? `+${m.quantityChange}` : m.quantityChange}
                      </td>
                      <td className="py-3 text-[var(--ink-muted)]">
                        {m.createdByName ?? ''}
                        {m.notes ? <span className="block text-xs">{m.notes}</span> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </motion.section>
      )}
    </div>
  );
}
