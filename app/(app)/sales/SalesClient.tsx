'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import type { SessionUser } from '@/lib/auth';
import Icon from '@/components/Icon';
import { formatMoney } from '@/lib/money';
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

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [status, setStatus] = useState('');
  const [receiptSearch, setReceiptSearch] = useState('');
  const debouncedReceipt = useDebounce(receiptSearch, 300);

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
    setFrom('');
    setTo('');
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
              onChange={(e) => setFrom(e.target.value)}
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
              onChange={(e) => setTo(e.target.value)}
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
        <div className="mt-3 flex flex-wrap items-center gap-2">
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
                    <div>
                      <p className="font-bold text-[var(--ink)]">{s.receiptNumber}</p>
                      <p className="text-xs text-[var(--ink-muted)]">
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
            {/* Receipt paper */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-alt)] p-5">
              <div className="text-center">
                <p className="font-display text-xl text-[var(--ink)]">{detail.sale.receiptNumber}</p>
                <p className="mt-1 text-sm text-[var(--ink-muted)]">
                  {fmtDateTime(detail.sale.soldAt)} · {detail.sale.soldByName}
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
            </div>
            {canVoid && detail.sale.status !== 'voided' && (
              <div className="mt-5 flex justify-end">
                <DangerButton onClick={() => setVoidOpen(true)}>
                  <Icon name="block" size={20} /> Void sale
                </DangerButton>
              </div>
            )}
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
    </motion.div>
  );
}
