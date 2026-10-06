'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  PrimaryButton,
  SecondaryButton,
  Field,
  inputClass,
  Sheet,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  SkeletonRows,
  LoadMore,
  ChapterHeader,
  StampBadge,
  SpineCard,
  AttentionPanel,
} from '@/components/ui';

/* ═══════════════════════ Types ═══════════════════════ */

interface PurchaseRow {
  id: string;
  referenceNumber: string;
  invoiceNumber: string | null;
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
  invoiceNumber: string | null;
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
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  active: boolean;
}

interface ProductLite {
  id: string;
  name: string;
  sku: string | null;
  quantity_on_hand: number;
}

interface LowStockItem {
  id: string;
  name: string;
  sku: string | null;
  quantityOnHand: number;
  reorderLevel: number;
  supplierName?: string | null;
}

/* Status → stamp tone + card spine tone (presentation only) */
const STATUS_STAMPS: Record<string, 'slate' | 'brass' | 'olive' | 'danger'> = {
  draft: 'slate',
  ordered: 'brass',
  received: 'olive',
  cancelled: 'danger',
};

const STATUS_SPINES: Record<string, 'slate' | 'brass' | 'olive' | 'wine'> = {
  draft: 'slate',
  ordered: 'brass',
  received: 'olive',
  cancelled: 'wine',
};

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  ordered: 'Ordered',
  received: 'Received',
  cancelled: 'Cancelled',
};

const PIPELINE_STAGES: { value: string; label: string; tone: 'slate' | 'brass' | 'olive' }[] = [
  { value: 'draft', label: 'Draft', tone: 'slate' },
  { value: 'ordered', label: 'Ordered', tone: 'brass' },
  { value: 'received', label: 'Received', tone: 'olive' },
];

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

/* ═══════════════════════ Status pipeline strip ═══════════════════════ */

function PipelineStrip({ current }: { current?: string }) {
  if (current === 'cancelled') {
    return <StampBadge tone="danger">Cancelled</StampBadge>;
  }
  const curIdx = current ? PIPELINE_STAGES.findIndex((s) => s.value === current) : -1;
  return (
    <div
      className="flex items-center gap-1.5 overflow-x-auto pb-1"
      role="list"
      aria-label="Order status pipeline"
    >
      {PIPELINE_STAGES.map((st, i) => {
        const reached = curIdx < 0 || i <= curIdx;
        return (
          <Fragment key={st.value}>
            {i > 0 && (
              <span className="h-px w-5 shrink-0 bg-[var(--border-input)]" aria-hidden="true" />
            )}
            <span role="listitem" className={reached ? undefined : 'opacity-45'}>
              <StampBadge tone={reached ? st.tone : 'slate'}>{st.label}</StampBadge>
            </span>
          </Fragment>
        );
      })}
    </div>
  );
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
            <ul className="paper-texture absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-[var(--border-input)] shadow-xl">
              {results.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => addLine(p)}
                    className="flex min-h-[44px] w-full items-center justify-between gap-2 px-3.5 py-2 text-left text-[15px] hover:bg-[var(--surface-alt)]"
                  >
                    <span className="truncate font-semibold">{p.name}</span>
                    <span className="tnum shrink-0 text-xs text-[var(--ink-muted)]">
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
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[var(--ink-muted)] hover:bg-[var(--danger-bg)] hover:text-[var(--danger)]"
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

  /* Suppliers (Chapter One) */
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  /* Reorder suggestions */
  const [lowStock, setLowStock] = useState<LowStockItem[]>([]);
  const [lowStockLoading, setLowStockLoading] = useState(true);

  /* Create PO */
  const [createOpen, setCreateOpen] = useState(false);
  const [supplierId, setSupplierId] = useState('');
  const [reference, setReference] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
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

  useEffect(() => {
    api<{ items: LowStockItem[]; nextCursor: string | null }>('/api/v1/products?lowStock=true&limit=8')
      .then((d) => setLowStock(d.items ?? []))
      .catch(() => {})
      .finally(() => setLowStockLoading(false));
  }, []);

  /* Open the create sheet when arriving via a "new purchase order" cross-link (?new=1). */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('new') === '1') {
      setCreateOpen(true);
      params.delete('new');
      const qs = params.toString();
      window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
    }
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

  const reorderItems = useMemo(
    () =>
      lowStock.map((it) => ({
        icon: 'inventory_2',
        label: it.name,
        detail: `${it.quantityOnHand} on hand · reorder at ${it.reorderLevel}${
          it.sku ? ` · ${it.sku}` : ''
        }${it.supplierName ? ` · ${it.supplierName}` : ''}`,
        href: '/purchases?new=1',
        tone: 'gold' as const,
      })),
    [lowStock]
  );

  /* ── Create ── */
  const openCreate = () => {
    setSupplierId('');
    setReference('');
    setInvoiceNumber('');
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
          invoiceNumber: invoiceNumber.trim() || undefined,
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
      {/* Page header */}
      <motion.div variants={riseVariants} className="mb-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="chapter-eyebrow">The ledger</p>
            <h1 className="font-display text-[28px] leading-tight text-[var(--ink)] sm:text-[32px]">
              Purchases
            </h1>
            <p className="mt-1 text-sm text-[var(--ink-muted)]">
              Purchase orders to suppliers — draft, order, receive.
            </p>
          </div>
          <PrimaryButton onClick={openCreate}>
            <Icon name="add" size={20} /> New purchase order
          </PrimaryButton>
        </div>
        <div className="chapter-rule" aria-hidden="true" />
      </motion.div>

      {/* ── Chapter One — Suppliers ── */}
      {suppliers.length > 0 && (
        <section aria-label="Suppliers" className="mb-10">
          <ChapterHeader
            eyebrow="Chapter One"
            title="Suppliers"
            number={1}
            action={
              <span className="tnum shrink-0 text-sm font-bold text-[var(--ink-muted)]">
                {suppliers.length} supplier{suppliers.length === 1 ? '' : 's'}
              </span>
            }
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {suppliers.map((s) => (
              <SpineCard key={s.id} tone={s.active ? 'olive' : 'slate'}>
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-display min-w-0 flex-1 text-[17px] leading-snug text-[var(--ink)]">
                    {s.name}
                  </h3>
                  <StampBadge tone={s.active ? 'olive' : 'danger'}>
                    {s.active ? 'Active' : 'Inactive'}
                  </StampBadge>
                </div>
                <div className="mt-3 flex flex-col gap-1.5 text-[13px] text-[var(--ink-muted)]">
                  {s.contactPerson && (
                    <p className="flex items-center gap-2">
                      <Icon name="person" size={16} className="shrink-0" />
                      <span className="truncate">{s.contactPerson}</span>
                    </p>
                  )}
                  {s.phone && (
                    <p className="flex items-center gap-2">
                      <Icon name="phone" size={16} className="shrink-0" />
                      <span className="tnum truncate">{s.phone}</span>
                    </p>
                  )}
                  {s.email && (
                    <p className="flex items-center gap-2">
                      <Icon name="mail" size={16} className="shrink-0" />
                      <span className="truncate">{s.email}</span>
                    </p>
                  )}
                  {s.address && (
                    <p className="flex items-start gap-2">
                      <Icon name="location_on" size={16} className="mt-0.5 shrink-0" />
                      <span className="line-clamp-2">{s.address}</span>
                    </p>
                  )}
                  {!s.contactPerson && !s.phone && !s.email && !s.address && (
                    <p className="italic">No contact details on file.</p>
                  )}
                </div>
              </SpineCard>
            ))}
          </div>
        </section>
      )}

      {/* ── Chapter Two — Purchase orders ── */}
      <section aria-label="Purchase orders" className="mb-10">
        <ChapterHeader
          eyebrow="Chapter Two"
          title="Purchase orders"
          number={2}
          action={
            <PrimaryButton onClick={openCreate}>
              <Icon name="add" size={20} /> New purchase order
            </PrimaryButton>
          }
        />

        {/* Status pipeline */}
        <motion.div variants={riseVariants} className="mb-5">
          <PipelineStrip />
        </motion.div>

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
                  : 'border border-[var(--border)] bg-[var(--surface)] text-[var(--ink-muted)] hover:bg-[var(--surface-alt)]'
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
                  className={`spine-card spine-${STATUS_SPINES[o.status] ?? 'wine'} min-h-[44px] p-4 text-left transition hover:-translate-y-0.5 hover:shadow-lg`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-mono text-[15px] font-bold text-[var(--ink)]">
                        {o.referenceNumber || 'PO'}
                      </p>
                      {o.invoiceNumber && (
                        <p className="mt-0.5 truncate font-mono text-xs text-[var(--ink-muted)]">
                          Inv: {o.invoiceNumber}
                        </p>
                      )}
                      <p className="mt-0.5 truncate text-xs text-[var(--ink-muted)]">
                        {o.supplierName ?? 'Unknown supplier'} · {fmtDate(o.orderedAt)}
                      </p>
                    </div>
                    <StampBadge tone={STATUS_STAMPS[o.status] ?? 'slate'}>
                      {STATUS_LABELS[o.status] ?? o.status}
                    </StampBadge>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-[var(--border)] pt-3">
                    <span className="text-xs font-semibold text-[var(--ink-muted)]">
                      {o.itemCount} line{o.itemCount === 1 ? '' : 's'}
                    </span>
                    <span className="tnum text-lg font-bold text-[var(--ink)]">
                      {formatMoney(o.totalCost)}
                    </span>
                  </div>
                </motion.button>
              ))}
            </div>
            {cursor && <LoadMore onLoad={() => fetchOrders(cursor)} loading={loadingMore} />}
          </>
        )}
      </section>

      {/* ── Reorder suggestions ── */}
      <section aria-label="Reorder suggestions">
        <ChapterHeader
          eyebrow="Needs attention"
          title="Reorder suggestions"
          action={
            <a
              href="/inventory?filter=low"
              className="inline-flex min-h-[44px] items-center text-sm font-bold text-[var(--wine)] underline underline-offset-4"
            >
              View all low stock
            </a>
          }
        />
        {lowStockLoading ? (
          <SkeletonRows rows={3} />
        ) : (
          <AttentionPanel items={reorderItems} />
        )}
      </section>

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
          <Field label="Supplier invoice number" htmlFor="po-invoice" hint="Optional">
            <input
              id="po-invoice"
              className={inputClass}
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              placeholder="e.g. INV-123"
            />
          </Field>
          <LineEditor lines={lines} setLines={setLines} />
          {lines.length > 0 && (
            <div className="paper-texture rounded-xl border border-[var(--border)] px-4 py-3">
              <div className="flex justify-between text-sm">
                <span className="text-[var(--ink-muted)]">Total units</span>
                <span className="tnum font-bold">{totalQty}</span>
              </div>
              <div className="receipt-dash mt-2 flex justify-between pt-2">
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
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-mono text-lg font-bold text-[var(--ink)]">
                  {detail.referenceNumber || 'Purchase order'}
                </p>
                {detail.invoiceNumber && (
                  <p className="mt-1 font-mono text-sm text-[var(--ink-muted)]">
                    Supplier invoice: {detail.invoiceNumber}
                  </p>
                )}
                <p className="mt-0.5 text-sm text-[var(--ink-muted)]">
                  {detail.supplierName} · {fmtDate(detail.orderedAt)}
                </p>
              </div>
            </div>

            <PipelineStrip current={detail.status} />

            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4">
              <p className="chapter-eyebrow pb-1 pt-3">Line items</p>
              {detail.items.map((it) => (
                <div
                  key={it.id}
                  className="ledger-row flex items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-bold text-[var(--ink)]">
                      {it.productName}
                    </p>
                    <p className="tnum mt-0.5 text-xs text-[var(--ink-muted)]">
                      {it.quantityOrdered} × {formatMoney(it.unitCost)}
                    </p>
                  </div>
                  <p className="tnum shrink-0 text-[15px] font-bold text-[var(--ink)]">
                    {formatMoney(it.quantityOrdered * it.unitCost)}
                  </p>
                </div>
              ))}
            </div>

            <div className="paper-texture flex items-center justify-between rounded-xl border border-[var(--border)] px-4 py-3">
              <span className="font-semibold text-[var(--ink-muted)]">Total cost</span>
              <span className="tnum text-xl font-bold text-[var(--ink)]">
                {formatMoney(detail.totalCost)}
              </span>
            </div>

            {detail.notes && (
              <p className="rounded-xl bg-[var(--info-bg)] px-4 py-3 text-sm text-[var(--info)]">
                {detail.notes}
              </p>
            )}

            {detail.status === 'ordered' && (
              <p className="flex items-start gap-2.5 rounded-xl border border-[var(--olive)]/30 bg-[var(--olive-bg)] px-4 py-3 text-[13px] leading-relaxed text-[var(--ink)]">
                <Icon name="warehouse" size={20} className="mt-0.5 shrink-0 text-[var(--olive)]" />
                <span>
                  Received stock lands in the <strong>warehouse</strong>. Move it to the shop shelf
                  with a transfer in{' '}
                  <a
                    href="/inventory"
                    className="font-bold text-[var(--wine)] underline underline-offset-2"
                  >
                    Inventory
                  </a>
                  .
                </span>
              </p>
            )}

            <p className="text-xs text-[var(--ink-muted)]">
              Created by {detail.createdByName ?? 'unknown'} ·{' '}
              {new Date(detail.createdAt).toLocaleDateString('en-GH', { day: 'numeric', month: 'short', year: 'numeric' })}
              {detail.receivedAt && ` · Received ${fmtDate(detail.receivedAt)}`}
              {detail.cancelledAt && ` · Cancelled ${fmtDate(detail.cancelledAt)}`}
            </p>

            {detail.status === 'ordered' && (
              <div className="flex flex-col gap-2">
                <PrimaryButton
                  onClick={() => setReceiveConfirm(true)}
                  className="min-h-[52px] text-base"
                >
                  <Icon name="warehouse" size={22} /> Receive into warehouse
                </PrimaryButton>
                <SecondaryButton onClick={() => setCancelConfirm(true)}>
                  <Icon name="cancel" size={20} /> Cancel order
                </SecondaryButton>
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
        title="Receive goods into the warehouse?"
        body={
          <>
            All line items will be received into the <strong>warehouse</strong> and item costs
            updated to the weighted average. Total:{' '}
            <strong className="tnum">{formatMoney(detail?.totalCost ?? 0)}</strong>.
          </>
        }
        confirmLabel="Receive into warehouse"
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
