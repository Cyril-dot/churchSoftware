'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import type { SessionUser } from '@/lib/auth';
import Icon from '@/components/Icon';
import ReceiptLogo from '@/components/ReceiptLogo';
import { formatMoney } from '@/lib/money';
import { servedByLine } from '@/lib/cashier';
import {
  api,
  useDebounce,
  listVariants,
  riseVariants,
  PageHeader,
  PrimaryButton,
  SecondaryButton,
  DangerButton,
  Badge,
  Field,
  inputClass,
  Modal,
  EmptyState,
  ErrorState,
  SkeletonRows,
  LoadMore,
} from '@/components/ui';

/* ═══════════════════════ Types ═══════════════════════ */

interface SaleRow {
  id: string;
  receiptNumber: string;
  paymentMethod: string;
  subtotal: number | null;
  discount: number;
  total: number;
  amountTendered: number | null;
  change: number | null;
  paymentReference: string | null;
  status: string;
  soldBy: string;
  soldByName: string;
  soldAt: string;
  itemCount: number;
}

interface DeliveryLite {
  id: string;
  invoiceNumber: string;
  customerName: string;
  status: string;
  total: number;
  itemCount: number;
  createdAt: string;
}

interface DailySalesItem {
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

interface DailySales {
  date: string;
  shopName: string;
  bishop: { items: DailySalesItem[]; subtotal: number };
  other: { items: DailySalesItem[]; subtotal: number };
  cashTotal: number;
  momoTotal: number;
  grandTotal: number;
  transactions: number;
}

interface ReceiptItem {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  unitCost: number | null;
  lineTotal: number;
  priceTier: string;
}

interface Receipt {
  sale: {
    id: string;
    receiptNumber: string;
    paymentMethod: string;
    subtotal: number | null;
    discount: number;
    total: number;
    amountTendered: number | null;
    change: number | null;
    paymentReference: string | null;
    note: string | null;
    status: string;
    soldBy: string;
    soldByName: string;
    soldAt: string;
    voidedAt: string | null;
    voidedByName: string | null;
    voidReason: string | null;
  };
  items: ReceiptItem[];
}

const PAYMENT_METHODS = [
  { value: '', label: 'All methods' },
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'mobile_money', label: 'Mobile Money' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
];

const STATUSES = [
  { value: '', label: 'All statuses' },
  { value: 'completed', label: 'Completed' },
  { value: 'voided', label: 'Voided' },
];

const METHOD_LABELS: Record<string, string> = {
  cash: 'Cash',
  card: 'Card',
  mobile_money: 'Mobile Money',
  bank_transfer: 'Bank Transfer',
  other: 'Other',
};

/* Price-list tier labels for receipt line stamps. */
const TIER_LABELS: Record<string, string> = {
  bishop: 'Bishop',
  sons_of_prophet: 'Sons of Prophet',
  pastor_deji: 'Outreach',
};

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-GH', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/* ── Date-range presets (local timezone) ── */

type PresetId = 'today' | 'week' | 'month' | 'year' | 'all' | 'custom';

const PRESETS: { id: Exclude<PresetId, 'custom'>; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This week' },
  { id: 'month', label: 'This month' },
  { id: 'year', label: 'This year' },
  { id: 'all', label: 'All time' },
];

function isoDateLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function startOfWeekMondayLocal(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const daysSinceMonday = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - daysSinceMonday);
  return d;
}

function presetRange(id: Exclude<PresetId, 'custom'>): { from: string; to: string } {
  const now = new Date();
  if (id === 'all') return { from: '', to: '' };
  const start =
    id === 'today'
      ? now
      : id === 'week'
        ? startOfWeekMondayLocal()
        : id === 'month'
          ? new Date(now.getFullYear(), now.getMonth(), 1)
          : new Date(now.getFullYear(), 0, 1);
  return { from: isoDateLocal(start), to: isoDateLocal(now) };
}

function StatusBadge({ s }: { s: string }) {
  return s === 'voided' ? (
    <Badge tone="red">Voided</Badge>
  ) : (
    <Badge tone="green">Completed</Badge>
  );
}

/* ═══════════════════════ Main component ═══════════════════════ */

export default function SalesClient({ user }: { user: SessionUser }) {
  const canVoid = user.role === 'admin' || user.role === 'manager';
  const ownScope = user.role === 'cashier';

  const [from, setFrom] = useState(() => presetRange('month').from);
  const [to, setTo] = useState(() => presetRange('month').to);
  const [fromTime, setFromTime] = useState('');
  const [toTime, setToTime] = useState('');
  const [source, setSource] = useState<'pos' | 'warehouse'>('pos');
  const [activePreset, setActivePreset] = useState<PresetId>('month');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [status, setStatus] = useState('');
  const [receiptSearch, setReceiptSearch] = useState('');
  const debouncedReceipt = useDebounce(receiptSearch, 300);

  const applyPreset = useCallback((id: PresetId) => {
    setActivePreset(id);
    setFromTime('');
    setToTime('');
    if (id === 'custom') return;
    const r = presetRange(id);
    setFrom(r.from);
    setTo(r.to);
  }, []);

  const handleFromChange = (v: string) => {
    setFrom(v);
    setActivePreset('custom');
  };

  const handleToChange = (v: string) => {
    setTo(v);
    setActivePreset('custom');
  };

  const [sales, setSales] = useState<SaleRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* Warehouse deliveries view */
  const [deliveries, setDeliveries] = useState<DeliveryLite[]>([]);
  const [deliveriesLoading, setDeliveriesLoading] = useState(false);

  /* Daily sales print (admin/manager only) */
  const canDailyPrint = user.role === 'admin' || user.role === 'manager';
  const [dailyDate, setDailyDate] = useState(todayISO());
  const [dailyData, setDailyData] = useState<DailySales | null>(null);
  const [dailyBusy, setDailyBusy] = useState(false);

  /* Receipt detail */
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<Receipt | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [voidBusy, setVoidBusy] = useState(false);

  /* ── Fetch ── */
  const buildUrl = useCallback(
    (after?: string | null) => {
      const params = new URLSearchParams({ limit: '40' });
      if (from) {
        const start = fromTime ? new Date(`${from}T${fromTime}:00`) : new Date(from);
        params.set('from', start.toISOString());
      }
      if (to) {
        const end = toTime ? new Date(`${to}T${toTime}:00`) : new Date(to);
        if (toTime) end.setSeconds(59, 999);
        else end.setHours(23, 59, 59, 999);
        params.set('to', end.toISOString());
      }
      if (paymentMethod) params.set('paymentMethod', paymentMethod);
      if (status) params.set('status', status);
      if (after) params.set('cursor', after);
      return `/api/v1/sales?${params}`;
    },
    [from, to, fromTime, toTime, paymentMethod, status]
  );

  const fetchSales = useCallback(
    async (after?: string | null) => {
      if (after) setLoadingMore(true);
      else {
        setLoading(true);
        setError(null);
      }
      try {
        const data = await api<{ items: SaleRow[]; nextCursor: string | null }>(
          buildUrl(after ?? undefined)
        );
        setSales((prev) => (after ? [...prev, ...data.items] : data.items));
        setCursor(data.nextCursor);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load sales.');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [buildUrl]
  );

  useEffect(() => {
    fetchSales();
  }, [fetchSales]);

  const filtered = useMemo(() => {
    const q = debouncedReceipt.trim().toLowerCase();
    if (!q) return sales;
    return sales.filter((s) => s.receiptNumber.toLowerCase().includes(q));
  }, [sales, debouncedReceipt]);

  const clearFilters = () => {
    applyPreset('month');
    setPaymentMethod('');
    setStatus('');
    setReceiptSearch('');
  };

  /* ── Warehouse deliveries (source = warehouse) ── */
  const fetchDeliveries = useCallback(async () => {
    setDeliveriesLoading(true);
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (from) params.set('from', new Date(from).toISOString());
      if (to) {
        const end = new Date(to);
        end.setHours(23, 59, 59, 999);
        params.set('to', end.toISOString());
      }
      const data = await api<{ items: DeliveryLite[] }>(`/api/v1/deliveries?${params}`);
      setDeliveries(data.items);
    } catch {
      setDeliveries([]);
    } finally {
      setDeliveriesLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    if (source === 'warehouse') fetchDeliveries();
  }, [source, fetchDeliveries]);

  /* ── Daily sales print ── */
  const printDaily = async () => {
    setDailyBusy(true);
    try {
      const data = await api<DailySales>(`/api/v1/reports/daily-sales?date=${dailyDate}`);
      setDailyData(data);
      setDetail(null);
      setTimeout(() => window.print(), 400);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load the daily summary.');
    } finally {
      setDailyBusy(false);
    }
  };

  /* ── Receipt detail ── */
  const openDetail = async (s: SaleRow) => {
    setDetailOpen(true);
    setDetailLoading(true);
    setDetail(null);
    try {
      const data = await api<Receipt>(`/api/v1/sales/${s.id}`);
      setDetail(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load receipt.');
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  };

  const submitVoid = async () => {
    if (!detail || !voidReason.trim()) {
      toast.error('Please give a reason for voiding.');
      return;
    }
    setVoidBusy(true);
    try {
      const updated = await api<Receipt>(`/api/v1/sales/${detail.sale.id}/void`, {
        method: 'POST',
        body: JSON.stringify({ reason: voidReason.trim() }),
      });
      setDetail(updated);
      setVoidOpen(false);
      setVoidReason('');
      toast.success(`Receipt ${updated.sale.receiptNumber} voided.`);
      fetchSales();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Void failed.');
    } finally {
      setVoidBusy(false);
    }
  };

  return (
    <motion.div variants={listVariants} initial="hidden" animate="show">
      {/* Print styles — receipt only */}
      <style>{`
        @page { size: 80mm auto; margin: 3mm; }
        @media print {
          .receipt-no-print { display: none !important; }
          .receipt-print-only { display: block !important; }
          .daily-print-only { display: block !important; }
          body { background: #fff !important; }
          [data-sonner-toaster] { display: none !important; }
        }
      `}</style>

      <div className="receipt-no-print">
      <PageHeader
        title={ownScope ? 'My sales' : 'Sales'}
        subtitle={
          ownScope
            ? 'Every sale you have rung up'
            : 'Full sales history with receipt lookup'
        }
      />

      {/* Filters */}
      <motion.div
        variants={riseVariants}
        className="mb-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow)]"
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="relative lg:col-span-2">
            <Icon
              name="search"
              size={20}
              className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-[var(--ink-muted)]"
            />
            <input
              type="search"
              value={receiptSearch}
              onChange={(e) => setReceiptSearch(e.target.value)}
              placeholder="Search receipt number…"
              aria-label="Search by receipt number"
              className={`${inputClass} pl-11`}
            />
          </div>
          <Field label="From" htmlFor="f-from">
            <input
              id="f-from"
              type="date"
              max={todayISO()}
              value={from}
              onChange={(e) => handleFromChange(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="To" htmlFor="f-to">
            <input
              id="f-to"
              type="date"
              max={todayISO()}
              min={from || undefined}
              value={to}
              onChange={(e) => handleToChange(e.target.value)}
              className={inputClass}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3 sm:col-span-2 lg:col-span-1 lg:grid-cols-1">
            <Field label="Payment" htmlFor="f-method">
              <select
                id="f-method"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className={inputClass}
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </div>
        {/* Time-of-day filter */}
        <div className="mt-3 grid grid-cols-2 gap-3 sm:max-w-md">
          <Field label="From time" htmlFor="f-from-time">
            <input
              id="f-from-time"
              type="time"
              value={fromTime}
              onChange={(e) => { setFromTime(e.target.value); setActivePreset('custom'); }}
              className={inputClass}
            />
          </Field>
          <Field label="To time" htmlFor="f-to-time">
            <input
              id="f-to-time"
              type="time"
              value={toTime}
              onChange={(e) => { setToTime(e.target.value); setActivePreset('custom'); }}
              className={inputClass}
            />
          </Field>
        </div>
        <p className="mt-1.5 text-xs text-[var(--ink-muted)]">
          Optional — narrow the list to a time of day (e.g. morning sales only).
        </p>
        {/* Date-range preset chips */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold tracking-wide text-[var(--ink-muted)] uppercase">
            Range
          </span>
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => applyPreset(p.id)}
              aria-pressed={activePreset === p.id}
              className={`inline-flex min-h-[44px] items-center rounded-full px-4 text-sm font-semibold transition ${
                activePreset === p.id
                  ? 'bg-[var(--wine)] text-white'
                  : 'bg-[var(--surface-alt)] text-[var(--ink-muted)] hover:bg-[var(--wine-tint)] hover:text-[var(--wine)]'
              }`}
            >
              {p.label}
            </button>
          ))}
          {activePreset === 'custom' && (
            <span
              aria-current="true"
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-[var(--gold)] px-4 text-sm font-semibold text-[var(--gold)]"
            >
              <Icon name="edit_calendar" size={18} /> Custom
            </span>
          )}
        </div>
        {/* Status chips */}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold tracking-wide text-[var(--ink-muted)] uppercase">
            Status
          </span>
          {STATUSES.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => setStatus(s.value)}
              aria-pressed={status === s.value}
              className={`inline-flex min-h-[44px] items-center rounded-full px-4 text-sm font-semibold transition ${
                status === s.value
                  ? 'bg-[var(--wine)] text-white'
                  : 'bg-[var(--surface-alt)] text-[var(--ink-muted)] hover:bg-[var(--wine-tint)] hover:text-[var(--wine)]'
              }`}
            >
              {s.label}
            </button>
          ))}
          <button
            type="button"
            onClick={clearFilters}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-[var(--ink-muted)] hover:bg-[var(--surface-alt)]"
          >
            <Icon name="restart_alt" size={18} /> Clear
          </button>
        </div>
        {/* Source: POS sales vs warehouse delivery orders */}
        {!ownScope && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold tracking-wide text-[var(--ink-muted)] uppercase">
              Source
            </span>
            {(
              [
                { value: 'pos', label: 'Shop (POS)' },
                { value: 'warehouse', label: 'Warehouse deliveries' },
              ] as const
            ).map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => setSource(s.value)}
                aria-pressed={source === s.value}
                className={`inline-flex min-h-[44px] items-center rounded-full px-4 text-sm font-semibold transition ${
                  source === s.value
                    ? 'bg-[var(--wine)] text-white'
                    : 'bg-[var(--surface-alt)] text-[var(--ink-muted)] hover:bg-[var(--wine-tint)] hover:text-[var(--wine)]'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
      </motion.div>

      {/* Daily sales print — admin/manager only */}
      {canDailyPrint && source === 'pos' && (
        <motion.div
          variants={riseVariants}
          className="paper-texture mb-5 flex flex-col gap-3 rounded-2xl border border-[var(--border)] p-4 shadow-[var(--shadow)] sm:flex-row sm:items-end"
        >
          <div className="flex-1">
            <h2 className="font-display text-base text-[var(--ink)]">Daily sales print</h2>
            <p className="text-sm text-[var(--ink-muted)]">
              Printable summary of one day — Bishop Books first, then everything else, with
              Cash and MoMo totals.
            </p>
          </div>
          <div className="flex items-end gap-2">
            <Field label="Date" htmlFor="ds-date">
              <input
                id="ds-date"
                type="date"
                max={todayISO()}
                value={dailyDate}
                onChange={(e) => setDailyDate(e.target.value)}
                className={inputClass}
              />
            </Field>
            <PrimaryButton onClick={printDaily} disabled={dailyBusy || !dailyDate}>
              <Icon name="print" size={20} /> {dailyBusy ? 'Loading…' : 'Print summary'}
            </PrimaryButton>
          </div>
        </motion.div>
      )}

      {/* List */}
      {source === 'warehouse' ? (
        deliveriesLoading ? (
          <SkeletonRows rows={6} />
        ) : deliveries.length === 0 ? (
          <EmptyState
            icon="local_shipping"
            title="No warehouse deliveries in this range"
            body="Delivery orders are warehouse sales. Create them from the Deliveries page."
            action={
              <SecondaryButton onClick={() => { window.location.href = '/deliveries'; }}>
                <Icon name="local_shipping" size={20} /> Open Deliveries
              </SecondaryButton>
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {deliveries.map((d) => (
              <a
                key={d.id}
                href="/deliveries"
                className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow)] transition hover:-translate-y-0.5 hover:shadow-lg"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-bold text-[var(--ink)]">{d.customerName}</p>
                    <p className="truncate text-xs text-[var(--ink-muted)]">
                      {d.invoiceNumber} · {fmtDateTime(d.createdAt)}
                    </p>
                  </div>
                  {d.status === 'delivered' ? (
                    <Badge tone="green">Delivered</Badge>
                  ) : (
                    <Badge tone="gold">Pending</Badge>
                  )}
                </div>
                <div className="mt-3 flex items-center justify-between gap-2 border-t border-[var(--border)] pt-3">
                  <span className="text-xs font-semibold text-[var(--ink-muted)]">
                    Warehouse · {d.itemCount} line{d.itemCount === 1 ? '' : 's'}
                  </span>
                  <span className="tnum text-lg font-bold text-[var(--ink)]">{formatMoney(d.total)}</span>
                </div>
              </a>
            ))}
          </div>
        )
      ) : loading ? (
        <SkeletonRows rows={8} />
      ) : error ? (
        <ErrorState message={error} onRetry={() => fetchSales()} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="receipt_long"
          title="No sales found"
          body={
            from || to || paymentMethod || status || receiptSearch
              ? 'Nothing matches these filters. Try widening the date range or clearing the filters.'
              : 'No sales recorded yet. Head to Sell to ring up the first one.'
          }
          action={
            from || to || paymentMethod || status || receiptSearch ? (
              <SecondaryButton onClick={clearFilters}>
                <Icon name="restart_alt" size={20} /> Clear filters
              </SecondaryButton>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((s, i) => (
              <motion.button
                key={s.id}
                type="button"
                variants={riseVariants}
                custom={i}
                onClick={() => openDetail(s)}
                className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-left shadow-[var(--shadow)] transition hover:-translate-y-0.5 hover:shadow-lg"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className={`flex h-11 w-11 items-center justify-center rounded-xl ${
                        s.status === 'voided'
                          ? 'bg-[var(--danger-bg)] text-[var(--danger)]'
                          : 'bg-[var(--wine-tint)] text-[var(--wine)]'
                      }`}
                    >
                      <Icon name="receipt" size={22} />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-bold text-[var(--ink)]">{s.receiptNumber}</p>
                      <p className="truncate text-xs text-[var(--ink-muted)]">
                        {fmtDateTime(s.soldAt)}
                        {!ownScope && ` · ${s.soldByName}`}
                      </p>
                    </div>
                  </div>
                  <StatusBadge s={s.status} />
                </div>
                <div className="mt-3 flex items-center justify-between gap-2 border-t border-[var(--border)] pt-3">
                  <span className="min-w-0 truncate text-xs font-semibold text-[var(--ink-muted)]">
                    {s.itemCount} item{s.itemCount === 1 ? '' : 's'} ·{' '}
                    {METHOD_LABELS[s.paymentMethod] ?? s.paymentMethod}
                  </span>
                  <span
                    className={`tnum shrink-0 text-lg font-bold ${s.status === 'voided' ? 'text-[var(--ink-muted)] line-through' : 'text-[var(--ink)]'}`}
                  >
                    {formatMoney(s.total)}
                  </span>
                </div>
              </motion.button>
            ))}
          </div>
          {cursor && <LoadMore onLoad={() => fetchSales(cursor)} loading={loadingMore} />}
        </>
      )}

      {/* ── Receipt detail modal ── */}
      <Modal open={detailOpen} onClose={() => setDetailOpen(false)} title="Receipt" wide>
        {detailLoading ? (
          <SkeletonRows rows={5} />
        ) : detail ? (
          <div>
            {/* Receipt paper — true receipt width, like the printed slip */}
            <div className="rounded-xl border border-[var(--border)] bg-[#FFFDF7] p-5 shadow-inner">
              <div className="mx-auto w-full max-w-[300px]">
              <div className="text-center">
                <ReceiptLogo />
                <p className="font-display mt-2 text-xl text-[var(--ink)]">{detail.sale.receiptNumber}</p>
                <p className="mt-1 text-sm text-[var(--ink-muted)]">
                  {fmtDateTime(detail.sale.soldAt)}
                </p>
                <p className="mt-1 font-bold text-[15px] break-words text-[var(--ink)]">
                  {servedByLine(detail.sale.soldByName, detail.sale.soldBy)}
                </p>
                <div className="mt-2 flex justify-center">
                  <StatusBadge s={detail.sale.status} />
                </div>
              </div>
              <div className="my-4 border-t border-dashed border-[var(--border-input)]" />
              <ul className="space-y-2.5">
                {detail.items.map((it) => (
                  <li key={it.id} className="flex items-baseline justify-between gap-3 text-[15px]">
                    <span className="min-w-0">
                      <span className="font-semibold text-[var(--ink)]">{it.productName}</span>
                      <span className="text-[var(--ink-muted)]"> × {it.quantity}</span>
                    </span>
                    <span className="tnum shrink-0 font-semibold">{formatMoney(it.lineTotal)}</span>
                  </li>
                ))}
              </ul>
              <div className="my-4 border-t border-dashed border-[var(--border-input)]" />
              <dl className="space-y-1.5 text-[15px]">
                {detail.sale.subtotal != null && (
                  <div className="flex justify-between">
                    <dt className="text-[var(--ink-muted)]">Subtotal</dt>
                    <dd className="tnum font-semibold">{formatMoney(detail.sale.subtotal)}</dd>
                  </div>
                )}
                {detail.sale.discount > 0 && (
                  <div className="flex justify-between">
                    <dt className="text-[var(--ink-muted)]">Discount</dt>
                    <dd className="tnum font-semibold text-[var(--success)]">
                      −{formatMoney(detail.sale.discount)}
                    </dd>
                  </div>
                )}
                <div className="flex justify-between text-lg">
                  <dt className="font-bold">Total</dt>
                  <dd className="tnum font-bold">{formatMoney(detail.sale.total)}</dd>
                </div>
                <div className="flex justify-between text-sm">
                  <dt className="text-[var(--ink-muted)]">Paid via</dt>
                  <dd className="font-semibold">
                    {METHOD_LABELS[detail.sale.paymentMethod] ?? detail.sale.paymentMethod}
                  </dd>
                </div>
                {detail.sale.amountTendered != null && (
                  <>
                    <div className="flex justify-between text-sm">
                      <dt className="text-[var(--ink-muted)]">Tendered</dt>
                      <dd className="tnum font-semibold">{formatMoney(detail.sale.amountTendered)}</dd>
                    </div>
                    <div className="flex justify-between text-sm">
                      <dt className="text-[var(--ink-muted)]">Change</dt>
                      <dd className="tnum font-semibold">{formatMoney(detail.sale.change ?? 0)}</dd>
                    </div>
                  </>
                )}
                {detail.sale.paymentReference && (
                  <div className="flex justify-between text-sm">
                    <dt className="text-[var(--ink-muted)]">Reference</dt>
                    <dd className="font-semibold">{detail.sale.paymentReference}</dd>
                  </div>
                )}
              </dl>
              {detail.sale.status === 'voided' && (
                <div className="mt-4 rounded-lg bg-[var(--danger-bg)] px-4 py-3 text-sm">
                  <p className="font-bold text-[var(--danger)]">Voided</p>
                  {detail.sale.voidReason && (
                    <p className="mt-0.5 text-[var(--danger)]">Reason: {detail.sale.voidReason}</p>
                  )}
                  <p className="mt-0.5 text-xs text-[var(--danger)]/80">
                    by {detail.sale.voidedByName ?? 'unknown'}
                    {detail.sale.voidedAt ? ` · ${fmtDateTime(detail.sale.voidedAt)}` : ''}
                  </p>
                </div>
              )}
              </div>{/* /receipt-width wrapper */}
            </div>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <SecondaryButton onClick={() => window.print()}>
                <Icon name="print" size={20} /> Print receipt
              </SecondaryButton>
              {canVoid && detail.sale.status !== 'voided' && (
                <DangerButton onClick={() => setVoidOpen(true)}>
                  <Icon name="block" size={20} /> Void sale
                </DangerButton>
              )}
            </div>
          </div>
        ) : null}
      </Modal>

      {/* ── Void confirm ── */}
      <Modal open={voidOpen} onClose={() => setVoidOpen(false)} title="Void this sale?">
        <p className="text-[15px] text-[var(--ink-muted)]">
          Receipt <strong className="text-[var(--ink)]">{detail?.sale.receiptNumber}</strong> for{' '}
          <strong className="tnum text-[var(--ink)]">{formatMoney(detail?.sale.total ?? 0)}</strong>{' '}
          will be voided and its items returned to stock. This cannot be undone.
        </p>
        <div className="mt-4">
          <Field label="Reason for voiding" htmlFor="v-reason">
            <textarea
              id="v-reason"
              className={`${inputClass} min-h-[88px] py-3`}
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              placeholder="e.g. Customer changed their mind, double charge…"
              maxLength={1000}
            />
          </Field>
        </div>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <SecondaryButton onClick={() => setVoidOpen(false)} disabled={voidBusy}>
            Keep sale
          </SecondaryButton>
          <DangerButton onClick={submitVoid} disabled={voidBusy}>
            {voidBusy ? 'Voiding…' : 'Void sale'}
          </DangerButton>
        </div>
      </Modal>
      </div>{/* /receipt-no-print */}

      {/* Print-only receipt — reprint any past sale */}
      {detail && (
        <div className="receipt-print-only hidden bg-white text-black p-6 max-w-[80mm] mx-auto" aria-hidden="true">
          <SalesReceiptPrint receipt={detail} />
        </div>
      )}

      {/* Print-only daily sales summary */}
      {dailyData && (
        <>
          <style>{`@page { size: A4; margin: 12mm; }`}</style>
          <div className="daily-print-only hidden bg-white text-black p-6" aria-hidden="true">
            <DailySalesPrint data={dailyData} />
          </div>
        </>
      )}
    </motion.div>
  );
}

/* ═══════════════════════ Print-only receipt ═══════════════════════ */

function SalesReceiptPrint({ receipt }: { receipt: Receipt }) {
  const { sale, items } = receipt;
  const soldAt = new Date(sale.soldAt);
  return (
    <div className="mx-auto w-full max-w-[300px] text-black text-sm">
      <div className="text-center mb-3">
        <ReceiptLogo />
        <p className="mt-2 font-bold">{sale.receiptNumber}</p>
        <p className="text-xs opacity-70">
          {soldAt.toLocaleDateString('en-GH', { day: 'numeric', month: 'short', year: 'numeric' })}{' '}
          {soldAt.toLocaleTimeString('en-GH', { hour: '2-digit', minute: '2-digit' })}
        </p>
        <p className="mt-1 font-bold text-[15px] break-words">
          {servedByLine(sale.soldByName, sale.soldBy)}
        </p>
        {sale.status === 'voided' && (
          <p className="mt-1 font-bold uppercase tracking-wide">— VOIDED —</p>
        )}
      </div>
      <div className="border-t border-dashed border-black/40 my-2" />
      <ul className="space-y-1.5">
        {items.map((it) => (
          <li key={it.id} className="flex justify-between gap-2">
            <span className="flex-1">
              {it.productName}
              <span className="opacity-70"> × {it.quantity}</span>
              {it.priceTier && it.priceTier !== 'standard' && (
                <span className="ml-1 rounded border border-black/50 px-1 text-[10px] font-bold uppercase">
                  {TIER_LABELS[it.priceTier] ?? it.priceTier}
                </span>
              )}
            </span>
            <span className="font-semibold">{formatMoney(it.lineTotal)}</span>
          </li>
        ))}
      </ul>
      <div className="border-t border-dashed border-black/40 my-2" />
      <dl className="space-y-1">
        {sale.subtotal != null && (
          <div className="flex justify-between"><dt className="opacity-70">Subtotal</dt><dd>{formatMoney(sale.subtotal)}</dd></div>
        )}
        {sale.discount > 0 && (
          <div className="flex justify-between"><dt className="opacity-70">Discount</dt><dd>−{formatMoney(sale.discount)}</dd></div>
        )}
        <div className="flex justify-between text-base font-bold"><dt>Total</dt><dd>{formatMoney(sale.total)}</dd></div>
        <div className="flex justify-between"><dt className="opacity-70">Paid via</dt><dd className="font-semibold">{METHOD_LABELS[sale.paymentMethod] ?? sale.paymentMethod}</dd></div>
        {sale.amountTendered != null && (
          <>
            <div className="flex justify-between"><dt className="opacity-70">Tendered</dt><dd>{formatMoney(sale.amountTendered)}</dd></div>
            <div className="flex justify-between"><dt className="opacity-70">Change</dt><dd>{formatMoney(sale.change ?? 0)}</dd></div>
          </>
        )}
        {sale.paymentReference && (
          <div className="flex justify-between"><dt className="opacity-70">Reference</dt><dd className="break-all text-right">{sale.paymentReference}</dd></div>
        )}
      </dl>
      <div className="border-t border-dashed border-black/40 my-2" />
      <p className="text-center italic">Thank you and God bless you.</p>
    </div>
  );
}

/* ═══════════════════════ Print-only daily sales summary ═══════════════════════ */

function DailySalesPrint({ data }: { data: DailySales }) {
  const section = (
    title: string,
    group: { items: DailySalesItem[]; subtotal: number }
  ) => (
    <div style={{ marginTop: 18 }}>
      <p style={{ fontSize: 14, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 }}>
        {title}
      </p>
      {group.items.length === 0 ? (
        <p style={{ fontSize: 12, fontStyle: 'italic', marginTop: 6 }}>None sold this day.</p>
      ) : (
        <table style={{ width: '100%', fontSize: 12.5, borderCollapse: 'collapse', marginTop: 6 }}>
          <thead>
            <tr style={{ borderTop: '2px solid #000', borderBottom: '1px solid #000' }}>
              <th style={{ textAlign: 'left', padding: '5px 4px' }}>Item</th>
              <th style={{ textAlign: 'right', padding: '5px 4px' }}>Qty</th>
              <th style={{ textAlign: 'right', padding: '5px 4px' }}>Unit price</th>
              <th style={{ textAlign: 'right', padding: '5px 4px' }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {group.items.map((i, idx) => (
              <tr key={idx} style={{ borderBottom: '1px solid #ddd' }}>
                <td style={{ padding: '5px 4px' }}>{i.name}</td>
                <td style={{ textAlign: 'right', padding: '5px 4px' }}>{i.quantity}</td>
                <td style={{ textAlign: 'right', padding: '5px 4px' }}>{formatMoney(i.unitPrice)}</td>
                <td style={{ textAlign: 'right', padding: '5px 4px', fontWeight: 600 }}>
                  {formatMoney(i.lineTotal)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: '1.5px solid #000' }}>
              <td colSpan={3} style={{ textAlign: 'right', padding: '6px 4px', fontWeight: 700 }}>
                Subtotal — {title}
              </td>
              <td style={{ textAlign: 'right', padding: '6px 4px', fontWeight: 800 }}>
                {formatMoney(group.subtotal)}
              </td>
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  );

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', color: '#000' }}>
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: 20, fontWeight: 800 }}>{data.shopName}</p>
        <p style={{ fontSize: 13, letterSpacing: 2, textTransform: 'uppercase', marginTop: 2 }}>
          Daily Sales Summary
        </p>
        <p style={{ fontSize: 12.5, marginTop: 4 }}>
          {new Date(data.date + 'T12:00:00').toLocaleDateString('en-GH', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}{' '}
          · {data.transactions} transaction{data.transactions === 1 ? '' : 's'}
        </p>
      </div>

      {section('Bishop Books', data.bishop)}
      {section('Other Items', data.other)}

      <div
        style={{
          marginTop: 22,
          borderTop: '2.5px solid #000',
          paddingTop: 10,
          fontSize: 13.5,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
          <span>Total MoMo</span>
          <strong>{formatMoney(data.momoTotal)}</strong>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
          <span>Total Cash</span>
          <strong>{formatMoney(data.cashTotal)}</strong>
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '8px 0 0',
            marginTop: 6,
            borderTop: '1px dashed #000',
            fontSize: 16,
            fontWeight: 800,
          }}
        >
          <span>GRAND TOTAL</span>
          <span>{formatMoney(data.grandTotal)}</span>
        </div>
      </div>
    </div>
  );
}
