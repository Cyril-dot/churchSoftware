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
  StatCard,
  EmptyState,
  ErrorState,
  SkeletonCards,
  SkeletonRows,
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

const METHOD_TONES: Record<string, string> = {
  cash: 'bg-[var(--gold)]',
  card: 'bg-[var(--wine)]',
  mobile_money: 'bg-[var(--success)]',
  bank_transfer: 'bg-[var(--info)]',
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

/* ═══════════════════════ Main component ═══════════════════════ */

export default function ReportsClient({ user }: { user: SessionUser }) {
  void user;

  const [preset, setPreset] = useState<Preset>('today');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [days, setDays] = useState<DayPoint[]>([]);
  const [methods, setMethods] = useState<MethodPoint[]>([]);
  const [topItems, setTopItems] = useState<TopItem[]>([]);

  const { from, to } = useMemo(
    () => rangeFor(preset, customFrom, customTo),
    [preset, customFrom, customTo]
  );

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams({ from, to });
      const [s, d, m, t] = await Promise.all([
        api<Summary>(`/api/v1/reports/summary?${q}`),
        api<{ days: DayPoint[] }>(`/api/v1/reports/sales-by-day?${q}`),
        api<{ methods: MethodPoint[] }>(`/api/v1/reports/by-payment?${q}`),
        api<{ items: TopItem[] }>(`/api/v1/reports/top-items?${q}&limit=10`),
      ]);
      setSummary(s);
      setDays(d.days ?? []);
      setMethods(m.methods ?? []);
      setTopItems(t.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load reports.');
    } finally {
      setLoading(false);
    }
  }, [from, to]);

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

  return (
    <motion.div variants={listVariants} initial="hidden" animate="show">
      <PageHeader
        title="Reports"
        subtitle="Revenue, profit and best-sellers at a glance"
      />

      {/* Date range */}
      <motion.div
        variants={riseVariants}
        className="mb-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow)]"
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
          <SecondaryButton onClick={fetchAll} className="ml-auto">
            <Icon name="refresh" size={20} /> Refresh
          </SecondaryButton>
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
          {/* Stat cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              icon="payments"
              label="Revenue"
              tone="wine"
              value={<CountUp value={summary.revenue} format={formatMoney} />}
              sub={`${summary.transactions} transaction${summary.transactions === 1 ? '' : 's'}`}
            />
            <StatCard
              icon="receipt_long"
              label="Transactions"
              tone="gold"
              value={<CountUp value={summary.transactions} format={(n) => String(Math.round(n))} />}
              sub="Completed sales"
            />
            <StatCard
              icon="trending_up"
              label="Gross profit"
              tone="green"
              value={<CountUp value={summary.grossProfit} format={formatMoney} />}
              sub={`COGS ${formatMoney(summary.cogs)}`}
            />
            <StatCard
              icon="percent"
              label="Discounts given"
              tone="red"
              value={<CountUp value={summary.discounts} format={formatMoney} />}
              sub="Total discount value"
            />
          </div>

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
            <motion.section
              variants={riseVariants}
              aria-label="End of day cash-up"
              className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow)] sm:p-6"
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-display text-lg text-[var(--ink)]">Cash-up summary</h2>
                <Badge tone={preset === 'today' ? 'green' : 'gray'}>
                  {preset === 'today' ? 'Today' : 'Selected period'}
                </Badge>
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
            </motion.section>
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
                    <tr className="border-b border-[var(--border)] text-[13px] uppercase tracking-wide text-[var(--ink-muted)]">
                      <th scope="col" className="py-3 pr-4 font-semibold">#</th>
                      <th scope="col" className="py-3 pr-4 font-semibold">Item</th>
                      <th scope="col" className="py-3 pr-4 text-right font-semibold">Qty sold</th>
                      <th scope="col" className="py-3 text-right font-semibold">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topItems.map((t, i) => (
                      <tr key={t.productId} className="border-b border-[var(--border)] last:border-0">
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
