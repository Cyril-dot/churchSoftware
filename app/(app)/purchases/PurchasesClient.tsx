'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  PrimaryButton,
  SecondaryButton,
  Badge,
  Field,
  inputClass,
  Sheet,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  SkeletonRows,
  LoadMore,
} from '@/components/ui';

/* ═══════════════════════ Types ═══════════════════════ */

interface PurchaseRow {
  id: string;
  referenceNumber: string;
  supplierId: string;
  supplierName: string | null;
  status: string;
  orderedAt: string | null;
  receivedAt: string | null;
  cancelledAt: string | null;
  notes: string | null;
  totalCost: number;
  itemCount: number;
}

interface PurchaseDetail {
  id: string;
  referenceNumber: string;
  supplierId: string;
  supplierName: string | null;
  status: string;
  orderedAt: string | null;
  receivedAt: string | null;
  cancelledAt: string | null;
  notes: string | null;
  createdByName: string | null;
  createdAt: string;
  totalCost: number;
  items: {
    id: string;
    productId: string;
    productName: string;
    sku: string | null;
    quantityOrdered: number;
    quantityReceived: number;
    unitCost: number;
  }[];
}

interface Supplier {
  id: string;
  name: string;
}

interface ProductLite {
  id: string;
  name: string;
  sku: string | null;
  quantity_on_hand: number;
}

const STATUS_TONES: Record<string, 'gray' | 'blue' | 'green' | 'red'> = {
  draft: 'gray',
  ordered: 'blue',
  received: 'green',
  cancelled: 'red',
};

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  ordered: 'Ordered',
  received: 'Received',
  cancelled: 'Cancelled',
};

const STATUS_FILTERS = [
  { value: '', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'ordered', label: 'Ordered' },
  { value: 'received', label: 'Received' },
  { value: 'cancelled', label: 'Cancelled' },
];

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GH', { day: 'numeric', month: 'short', year: 'numeric' });
}

/* ═══════════════════════ Line item editor ═══════════════════════ */

interface LineDraft {
  key: number;
  productId: string;
  productName: string;
  qty: string;
  unitCost: string;
}

function LineEditor({
  lines,
  setLines,
}: {
  lines: LineDraft[];
  setLines: (fn: (prev: LineDraft[]) => LineDraft[]) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProductLite[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const debounced = useDebounce(query, 300);
  const boxRef = useRef<HTMLDivElement>(null);
  const keyRef = useRef(1);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open ]);

  useEffect(() => {
    if (!debounced.trim() || debounced.trim().length < 2) {
      setResults([]);
      return;
    }
    const ctrl = new AbortController();
    setSearching(true);
    fetch(`/api/v1/products?search=${encodeURIComponent(debounced.trim())}&limit=10`, {
      signal: ctrl.signal,
    })
      .then(async (r) => {
        if (!r.ok) throw new Error();
        const body = await r.json();
        setResults(body?.data?.items ?? []);
        setOpen(true);
      })
      .catch(() => {})
      .finally(() => setSearching(false));
    return () => ctrl.abort();
  }, [debounced]);

  const addLine = (p: ProductLite) => {
    setLines((prev) =>
      prev.some((l) => l.productId === p.id)
        ? prev
        : [...prev, { key: keyRef.current++, productId: p.id, productName: p.name, qty: '1', unitCost: '' }]
    );
    setQuery('');
    setResults([]);
    setOpen(false);
  };

  return (
    <div>
      <Field label="Line items" htmlFor="po-line-search">
        <div ref={boxRef} className="relative">
          <input
            id="po-line-search"
            className={inputClass}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
            }}
            placeholder="Type to search items…"
            autoComplete="off"
          />
          {searching && (
            <span className="absolute top-1/2 right-3 -translate-y-1/2 text-[var(--ink-muted)]">
              <Icon name="sync" size={20} className="animate-spin" />
            </span>
          )}
          {open && results.length > 0 && (
            <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-[var(--border-input)] bg-white shadow-xl">
              {results.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => addLine(p)}
                    className="flex min-h-[44px] w-full items-center justify-between gap-2 px-3.5 py-2 text-left text-[15px] hover:bg-[var(--surface-alt)]"
                  >
                    <span className="truncate font-semibold">{p.name}</span>
                    <span className="shrink-0 text-xs text-[var(--ink-muted)]">
                      {p.sku ?? ''} · stock {p.quantity_on_hand}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Field>

      {lines.length > 0 && (
        <ul className="mt-3 space-y-2">
          {lines.map((l) => {
            const qty = parseInt(l.qty, 10) || 0;
            const cost = parseFloat(l.unitCost) || 0;
            return (
              <li
                key={l.key}
                className="rounded-xl border border-[var(--border)] bg-[var(--surface-alt)] p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 truncate text-sm font-bold">{l.productName}</p>
                  <button
                    type="button"
                    aria-label={`Remove ${l.productName}`}
                    onClick={() => setLines((prev) => prev.filter((x) => x.key !== l.key))}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--ink-muted)] hover:bg-[var(--danger-bg)] hover:text-[var(--danger)]"
                  >
                    <Icon name="delete" size={18} />
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-3 items-end gap-2">
                  <Field label="Qty" htmlFor={`qty-${l.key}`}>
                    <input
                      id={`qty-${l.key}`}
                      className={`${inputClass} tnum`}
                      inputMode="numeric"
                      value={l.qty}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((x) => (x.key === l.key ? { ...x, qty: e.target.value.replace(/\D/g, '') } : x))
                        )
                      }
                    />
                  </Field>
                  <Field label="Unit cost" htmlFor={`cost-${l.key}`}>
                    <input
                      id={`cost-${l.key}`}
                      className={`${inputClass} tnum`}
                      inputMode="decimal"
                      value={l.unitCost}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((x) => (x.key === l.key ? { ...x, unitCost: e.target.value } : x))
                        )
                      }
                      placeholder="0.00"
                    />
                  </Field>
                  <p className="tnum pb-3 text-right text-sm font-bold">
                    {formatMoney(qty * cost)}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ═══════════════════════ Main component ═══════════════════════ */

export default function PurchasesClient({ user }: { user: SessionUser }) {
  void user;

  const [statusFilter, setStatusFilter] = useState('');
  const [orders, setOrders] = useState<PurchaseRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* Create PO */
  const [createOpen, setCreateOpen] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierId, setSupplierId] = useState('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [createBusy, setCreateBusy] = useState(false);

  /* Detail */
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<PurchaseDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [receiveConfirm, setReceiveConfirm] = useState(false);
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);

  /* ── Fetch list ── */
  const buildUrl = useCallback(
    (after?: string | null) => {
      const params = new URLSearchParams({ limit: '40' });
      if (statusFilter) params.set('status', statusFilter);
      if (after) params.set('cursor', after);
      return `/api/v1/purchases?${params}`;
    },
    [statusFilter]
  );

  const fetchOrders = useCallback(
    async (after?: string | null) => {
      if (after) setLoadingMore(true);
      else {
        setLoading(true);
        setError(null);
      }
      try {
        const data = await api<{ items: PurchaseRow[]; nextCursor: string | null }>(
          buildUrl(after ?? undefined)
        );
        setOrders((prev) => (after ? [...prev, ...data.items] : data.items));
        setCursor(data.nextCursor);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load purchase orders.');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [buildUrl]
  );

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  useEffect(() => {
    api<{ items: Supplier[] }>('/api/v1/suppliers?limit=200')
      .then((d) => setSuppliers((d.items ?? []).filter((s) => s)))
      .catch(() => {});
  }, []);

  const totals = useMemo(
    () =>
      lines.reduce(
        (s, l) => s + (parseInt(l.qty, 10) || 0) * (parseFloat(l.unitCost) || 0),
        0
      ),
    [lines]
  );
  const totalQty = useMemo(
    () => lines.reduce((s, l) => s + (parseInt(l.qty, 10) || 0), 0),
    [lines]
  );

  /* ── Create ── */
  const openCreate = () => {
    setSupplierId('');
    setReference('');
    setNotes('');
    setLines([]);
    setCreateOpen(true);
  };

  const submitCreate = async () => {
    if (!supplierId) {
      toast.error('Choose a supplier.');
      return;
    }
    const valid = lines.filter(
      (l) => (parseInt(l.qty, 10) || 0) > 0 && (parseFloat(l.unitCost) || 0) >= 0 && l.unitCost !== ''
    );
    if (valid.length === 0) {
      toast.error('Add at least one line item with quantity and unit cost.');
      return;
    }
    setCreateBusy(true);
    try {
      await api('/api/v1/purchases', {
        method: 'POST',
        body: JSON.stringify({
          supplierId,
          referenceNumber: reference.trim() || undefined,
          notes: notes.trim() || undefined,
          items: valid.map((l) => ({
            productId: l.productId,
            quantityOrdered: parseInt(l.qty, 10),
            unitCost: parseFloat(l.unitCost),
          })),
        }),
      });
      toast.success('Purchase order created.');
      setCreateOpen(false);
      fetchOrders();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create purchase order.');
    } finally {
      setCreateBusy(false);
    }
  };

  /* ── Detail ── */
  const openDetail = async (o: PurchaseRow) => {
    setDetailOpen(true);
    setDetailLoading(true);
    setDetail(null);
    try {
      const data = await api<PurchaseDetail>(`/api/v1/purchases/${o.id}`);
      setDetail(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load purchase order.');
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  };

  const refreshDetail = async (id: string) => {
    try {
      const data = await api<PurchaseDetail>(`/api/v1/purchases/${id}`);
      setDetail(data);
    } catch {
      /* keep stale */
    }
  };

  const doReceive = async () => {
    if (!detail) return;
    setActionBusy(true);
    try {
      await api(`/api/v1/purchases/${detail.id}/receive`, { method: 'POST' });
      toast.success('Goods received — stock and costs updated.');
      setReceiveConfirm(false);
      await refreshDetail(detail.id);
      fetchOrders();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Receive failed.');
    } finally {
      setActionBusy(false);
    }
  };

  const doCancel = async () => {
    if (!detail) return;
    setActionBusy(true);
    try {
      await api(`/api/v1/purchases/${detail.id}/cancel`, { method: 'POST' });
      toast.success('Purchase order cancelled.');
      setCancelConfirm(false);
      await refreshDetail(detail.id);
      fetchOrders();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Cancel failed.');
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <motion.div variants={listVariants} initial="hidden" animate="show">
      <PageHeader
        title="Purchases"
        subtitle="Purchase orders to suppliers"
        actions={
          <PrimaryButton onClick={openCreate}>
            <Icon name="add" size={20} /> New purchase order
          </PrimaryButton>
        }
      />

      {/* Status filter */}
      <motion.div variants={riseVariants} className="mb-5 flex flex-wrap gap-2">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s.value}
            type="button"
            onClick={() => setStatusFilter(s.value)}
            aria-pressed={statusFilter === s.value}
            className={`inline-flex min-h-[44px] items-center rounded-full px-4 text-sm font-semibold transition ${
              statusFilter === s.value
                ? 'bg-[var(--wine)] text-white'
                : 'bg-[var(--surface)] text-[var(--ink-muted)] border border-[var(--border)] hover:bg-[var(--surface-alt)]'
            }`}
          >
            {s.label}
          </button>
        ))}
      </motion.div>

      {/* List */}
      {loading ? (
        <SkeletonRows rows={6} />
      ) : error ? (
        <ErrorState message={error} onRetry={() => fetchOrders()} />
      ) : orders.length === 0 ? (
        <EmptyState
          icon="shopping_bag"
          title="No purchase orders"
          body={
            statusFilter
              ? 'Nothing with this status. Try a different filter.'
              : 'Create your first purchase order to restock from a supplier.'
          }
          action={
            <PrimaryButton onClick={openCreate}>
              <Icon name="add" size={20} /> New purchase order
            </PrimaryButton>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {orders.map((o, i) => (
              <motion.button
                key={o.id}
                type="button"
                variants={riseVariants}
                custom={i}
                onClick={() => openDetail(o)}
                className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-left shadow-[var(--shadow)] transition hover:-translate-y-0.5 hover:shadow-lg"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--wine-tint)] text-[var(--wine)]">
                      <Icon name="shopping_bag" size={22} />
                    </span>
                    <div>
                      <p className="font-bold text-[var(--ink)]">
                        {o.referenceNumber || 'PO'}
                      </p>
                      <p className="truncate text-xs text-[var(--ink-muted)]">
                        {o.supplierName ?? 'Unknown supplier'} · {fmtDate(o.orderedAt)}
                      </p>
                    </div>
                  </div>
                  <Badge tone={STATUS_TONES[o.status] ?? 'gray'}>
                    {STATUS_LABELS[o.status] ?? o.status}
                  </Badge>
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-[var(--border)] pt-3">
                  <span className="text-xs font-semibold text-[var(--ink-muted)]">
                    {o.itemCount} line{o.itemCount === 1 ? '' : 's'}
                  </span>
                  <span className="tnum text-lg font-bold">{formatMoney(o.totalCost)}</span>
                </div>
              </motion.button>
            ))}
          </div>
          {cursor && <LoadMore onLoad={() => fetchOrders(cursor)} loading={loadingMore} />}
        </>
      )}

      {/* ── Create PO sheet ── */}
      <Sheet open={createOpen} onClose={() => setCreateOpen(false)} title="New purchase order">
        <div className="flex flex-col gap-4">
          <Field label="Supplier" htmlFor="po-supplier">
            <select
              id="po-supplier"
              className={inputClass}
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
            >
              <option value="">Choose supplier…</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Reference number" htmlFor="po-ref">
            <input
              id="po-ref"
              className={inputClass}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="e.g. PO-2026-014"
            />
          </Field>
          <LineEditor lines={lines} setLines={setLines} />
          {lines.length > 0 && (
            <div className="rounded-xl bg-[var(--surface-alt)] px-4 py-3">
              <div className="flex justify-between text-sm">
                <span className="text-[var(--ink-muted)]">Total units</span>
                <span className="tnum font-bold">{totalQty}</span>
              </div>
              <div className="mt-1 flex justify-between">
                <span className="text-[var(--ink-muted)]">Total cost</span>
                <span className="tnum text-lg font-bold">{formatMoney(totals)}</span>
              </div>
            </div>
          )}
          <Field label="Notes" htmlFor="po-notes">
            <textarea
              id="po-notes"
              className={`${inputClass} min-h-[72px] py-3`}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Delivery instructions…"
              maxLength={2000}
            />
          </Field>
          <div className="mt-1 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <SecondaryButton onClick={() => setCreateOpen(false)} disabled={createBusy}>
              Cancel
            </SecondaryButton>
            <PrimaryButton onClick={submitCreate} disabled={createBusy}>
              {createBusy ? 'Creating…' : 'Create order'}
            </PrimaryButton>
          </div>
        </div>
      </Sheet>

      {/* ── Detail sheet ── */}
      <Sheet open={detailOpen} onClose={() => setDetailOpen(false)} title="Purchase order">
        {detailLoading ? (
          <SkeletonRows rows={5} />
        ) : detail ? (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-display text-xl text-[var(--ink)]">
                  {detail.referenceNumber || 'Purchase order'}
                </p>
                <p className="text-sm text-[var(--ink-muted)]">
                  {detail.supplierName} · {fmtDate(detail.orderedAt)}
                </p>
              </div>
              <Badge tone={STATUS_TONES[detail.status] ?? 'gray'}>
                {STATUS_LABELS[detail.status] ?? detail.status}
              </Badge>
            </div>

            <div className="rounded-xl border border-[var(--border)]">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[12px] uppercase tracking-wide text-[var(--ink-muted)]">
                    <th scope="col" className="px-4 py-2.5 font-semibold">Item</th>
                    <th scope="col" className="px-4 py-2.5 text-right font-semibold">Qty</th>
                    <th scope="col" className="px-4 py-2.5 text-right font-semibold">Unit cost</th>
                    <th scope="col" className="px-4 py-2.5 text-right font-semibold">Line total</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.items.map((it) => (
                    <tr key={it.id} className="border-b border-[var(--border)] last:border-0">
                      <td className="px-4 py-2.5 font-semibold">{it.productName}</td>
                      <td className="tnum px-4 py-2.5 text-right">{it.quantityOrdered}</td>
                      <td className="tnum px-4 py-2.5 text-right">{formatMoney(it.unitCost)}</td>
                      <td className="tnum px-4 py-2.5 text-right font-bold">
                        {formatMoney(it.quantityOrdered * it.unitCost)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-between rounded-xl bg-[var(--surface-alt)] px-4 py-3">
              <span className="font-semibold text-[var(--ink-muted)]">Total cost</span>
              <span className="tnum text-xl font-bold">{formatMoney(detail.totalCost)}</span>
            </div>

            {detail.notes && (
              <p className="rounded-xl bg-[var(--info-bg)] px-4 py-3 text-sm text-[var(--info)]">
                {detail.notes}
              </p>
            )}

            <p className="text-xs text-[var(--ink-muted)]">
              Created by {detail.createdByName ?? 'unknown'} ·{' '}
              {new Date(detail.createdAt).toLocaleDateString('en-GH', { day: 'numeric', month: 'short', year: 'numeric' })}
              {detail.receivedAt && ` · Received ${fmtDate(detail.receivedAt)}`}
              {detail.cancelledAt && ` · Cancelled ${fmtDate(detail.cancelledAt)}`}
            </p>

            {detail.status === 'ordered' && (
              <div className="flex flex-col gap-2 sm:flex-row">
                <SecondaryButton onClick={() => setCancelConfirm(true)} className="flex-1">
                  <Icon name="cancel" size={20} /> Cancel order
                </SecondaryButton>
                <PrimaryButton onClick={() => setReceiveConfirm(true)} className="flex-1">
                  <Icon name="check_circle" size={20} /> Receive goods
                </PrimaryButton>
              </div>
            )}
          </div>
        ) : null}
      </Sheet>

      {/* ── Receive / cancel confirms ── */}
      <ConfirmDialog
        open={receiveConfirm}
        onClose={() => setReceiveConfirm(false)}
        onConfirm={doReceive}
        title="Receive goods?"
        body={
          <>
            All line items will be added to stock and item costs updated to the
            weighted average. Total: <strong className="tnum">{formatMoney(detail?.totalCost ?? 0)}</strong>.
          </>
        }
        confirmLabel="Receive goods"
        busy={actionBusy}
      />
      <ConfirmDialog
        open={cancelConfirm}
        onClose={() => setCancelConfirm(false)}
        onConfirm={doCancel}
        title="Cancel this order?"
        body="The purchase order will be marked cancelled. No stock changes will be made."
        confirmLabel="Cancel order"
        danger
        busy={actionBusy}
      />
    </motion.div>
  );
}
