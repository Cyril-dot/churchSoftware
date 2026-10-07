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
  pastor_deji: 'Pastor Deji',
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
  const [activePreset, setActivePreset] = useState<PresetId>('month');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [status, setStatus] = useState('');
  const [receiptSearch, setReceiptSearch] = useState('');
  const debouncedReceipt = useDebounce(receiptSearch, 300);

  const applyPreset = useCallback((id: PresetId) => {
    setActivePreset(id);
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
      if (from) params.set('from', new Date(from).toISOString());
      if (to) {
        const end = new Date(to);
        end.setHours(23, 59, 59, 999);
        params.set('to', end.toISOString());
      }
      if (paymentMethod) params.set('paymentMethod', paymentMethod);
      if (status) params.set('status', status);
      if (after) params.set('cursor', after);
      return `/api/v1/sales?${params}`;
    },
    [from, to, paymentMethod, status]
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
        @media print {
          .receipt-no-print { display: none !important; }
          .receipt-print-only { display: block !important; }
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
      </motion.div>

      {/* List */}
      {loading ? (
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
                  <div className="flex items-center gap-3">
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
                <div className="mt-3 flex items-center justify-between border-t border-[var(--border)] pt-3">
                  <span className="text-xs font-semibold text-[var(--ink-muted)]">
                    {s.itemCount} item{s.itemCount === 1 ? '' : 's'} ·{' '}
                    {METHOD_LABELS[s.paymentMethod] ?? s.paymentMethod}
                  </span>
                  <span
                    className={`tnum text-lg font-bold ${s.status === 'voided' ? 'text-[var(--ink-muted)] line-through' : 'text-[var(--ink)]'}`}
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
