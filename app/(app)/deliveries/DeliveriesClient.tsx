'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import type { SessionUser } from '@/lib/auth';
import Icon from '@/components/Icon';
import { formatMoney } from '@/lib/money';
import {
  api,
  listVariants,
  riseVariants,
  PageHeader,
  PrimaryButton,
  SecondaryButton,
  Badge,
  Field,
  inputClass,
  Modal,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  SkeletonRows,
} from '@/components/ui';

/* ═══════════════════════ Types ═══════════════════════ */

interface DeliveryRow {
  id: string;
  invoiceNumber: string;
  customerName: string;
  contactName: string | null;
  phone: string | null;
  address: string | null;
  status: string;
  total: number;
  notes: string | null;
  itemCount: number;
  createdByName: string | null;
  createdAt: string;
  deliveredAt: string | null;
  deliveredByName: string | null;
}

interface DeliveryDetail extends DeliveryRow {
  items: {
    id: string;
    productId: string;
    productName: string;
    sku: string | null;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }[];
  settings: { shopName: string; receiptFooter: string };
}

interface ProductLite {
  id: string;
  name: string;
  sku: string | null;
  sellingPrice: number;
  quantityWarehouse: number;
  quantityShop: number;
}

interface LineDraft {
  productId: string;
  name: string;
  warehouse: number;
  qty: string;
  unitPrice: string;
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-GH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/* ═══════════════════════ Main component ═══════════════════════ */

export default function DeliveriesClient({ user }: { user: SessionUser }) {
  void user;
  const [orders, setOrders] = useState<DeliveryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [status, setStatus] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<DeliveryDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [deliverConfirm, setDeliverConfirm] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (from) params.set('from', new Date(from).toISOString());
      if (to) {
        const end = new Date(to);
        end.setHours(23, 59, 59, 999);
        params.set('to', end.toISOString());
      }
      if (status) params.set('status', status);
      const data = await api<{ items: DeliveryRow[] }>(`/api/v1/deliveries?${params}`);
      setOrders(data.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load delivery orders.');
    } finally {
      setLoading(false);
    }
  }, [from, to, status]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const openDetail = async (o: DeliveryRow) => {
    setDetailOpen(true);
    setDetailLoading(true);
    setDetail(null);
    try {
      const data = await api<DeliveryDetail>(`/api/v1/deliveries/${o.id}`);
      setDetail(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load order.');
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  };

  const doDeliver = async () => {
    if (!detail) return;
    setActionBusy(true);
    try {
      await api(`/api/v1/deliveries/${detail.id}/deliver`, { method: 'POST' });
      toast.success(`${detail.invoiceNumber} marked as delivered.`);
      setDeliverConfirm(false);
      const data = await api<DeliveryDetail>(`/api/v1/deliveries/${detail.id}`);
      setDetail(data);
      fetchOrders();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not mark delivered.');
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <motion.div variants={listVariants} initial="hidden" animate="show">
      {/* Print styles — invoice only */}
      <style>{`
        @page { size: A4; margin: 14mm; }
        @media print {
          .invoice-no-print { display: none !important; }
          .invoice-print-only { display: block !important; }
          body { background: #fff !important; }
          [data-sonner-toaster] { display: none !important; }
        }
      `}</style>

      <div className="invoice-no-print">
        <PageHeader
          title="Delivery Orders"
          subtitle="Warehouse sales to churches and outside buyers — each order gets an invoice"
          actions={
            <PrimaryButton onClick={() => setCreateOpen(true)}>
              <Icon name="add" size={20} /> New delivery order
            </PrimaryButton>
          }
        />

        {/* Filters */}
        <motion.div
          variants={riseVariants}
          className="mb-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow)]"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="From" htmlFor="d-from">
              <input id="d-from" type="date" max={todayISO()} value={from}
                onChange={(e) => setFrom(e.target.value)} className={inputClass} />
            </Field>
            <Field label="To" htmlFor="d-to">
              <input id="d-to" type="date" max={todayISO()} min={from || undefined} value={to}
                onChange={(e) => setTo(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Status" htmlFor="d-status">
              <select id="d-status" value={status} onChange={(e) => setStatus(e.target.value)} className={inputClass}>
                <option value="">All statuses</option>
                <option value="pending">Pending</option>
                <option value="delivered">Delivered</option>
              </select>
            </Field>
          </div>
        </motion.div>

        {loading ? (
          <SkeletonRows rows={6} />
        ) : error ? (
          <ErrorState message={error} onRetry={fetchOrders} />
        ) : orders.length === 0 ? (
          <EmptyState
            icon="local_shipping"
            title="No delivery orders"
            body="Create the first warehouse delivery order — stock is taken from the warehouse and an invoice is generated."
            action={
              <PrimaryButton onClick={() => setCreateOpen(true)}>
                <Icon name="add" size={20} /> New delivery order
              </PrimaryButton>
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {orders.map((o) => (
              <motion.button
                key={o.id}
                type="button"
                variants={riseVariants}
                onClick={() => openDetail(o)}
                className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-left shadow-[var(--shadow)] transition hover:-translate-y-0.5 hover:shadow-lg"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--wine-tint)] text-[var(--wine)]">
                      <Icon name="local_shipping" size={22} />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-bold text-[var(--ink)]">{o.customerName}</p>
                      <p className="truncate text-xs text-[var(--ink-muted)]">
                        {o.invoiceNumber} · {fmtDateTime(o.createdAt)}
                      </p>
                    </div>
                  </div>
                  {o.status === 'delivered' ? (
                    <Badge tone="green">Delivered</Badge>
                  ) : (
                    <Badge tone="gold">Pending</Badge>
                  )}
                </div>
                <div className="mt-3 flex items-center justify-between gap-2 border-t border-[var(--border)] pt-3">
                  <span className="text-xs font-semibold text-[var(--ink-muted)]">
                    {o.itemCount} item line{o.itemCount === 1 ? '' : 's'}
                  </span>
                  <span className="tnum text-lg font-bold text-[var(--ink)]">{formatMoney(o.total)}</span>
                </div>
              </motion.button>
            ))}
          </div>
        )}

        {/* ── Detail / invoice modal ── */}
        <Modal open={detailOpen} onClose={() => setDetailOpen(false)} title="Delivery order" wide>
          {detailLoading ? (
            <SkeletonRows rows={5} />
          ) : detail ? (
            <div>
              <div className="rounded-xl border border-[var(--border)] bg-[#FFFDF7] p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-display text-xl text-[var(--ink)]">{detail.settings.shopName}</p>
                    <p className="text-sm font-bold tracking-wide text-[var(--ink-muted)] uppercase">
                      Invoice {detail.invoiceNumber}
                    </p>
                  </div>
                  {detail.status === 'delivered' ? (
                    <Badge tone="green">Delivered</Badge>
                  ) : (
                    <Badge tone="gold">Pending delivery</Badge>
                  )}
                </div>
                <dl className="mt-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                  <div><dt className="text-[var(--ink-muted)]">Billed to</dt><dd className="font-bold">{detail.customerName}</dd></div>
                  {detail.contactName && (
                    <div><dt className="text-[var(--ink-muted)]">Contact</dt><dd className="font-semibold">{detail.contactName}</dd></div>
                  )}
                  {detail.phone && (
                    <div><dt className="text-[var(--ink-muted)]">Phone</dt><dd className="font-semibold">{detail.phone}</dd></div>
                  )}
                  {detail.address && (
                    <div><dt className="text-[var(--ink-muted)]">Deliver to</dt><dd className="font-semibold">{detail.address}</dd></div>
                  )}
                  <div><dt className="text-[var(--ink-muted)]">Date</dt><dd className="font-semibold">{fmtDateTime(detail.createdAt)}</dd></div>
                  {detail.deliveredAt && (
                    <div><dt className="text-[var(--ink-muted)]">Delivered</dt><dd className="font-semibold">{fmtDateTime(detail.deliveredAt)}{detail.deliveredByName ? ` · ${detail.deliveredByName}` : ''}</dd></div>
                  )}
                </dl>
                <div className="my-4 border-t border-dashed border-[var(--border-input)]" />
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-xs tracking-wide text-[var(--ink-muted)] uppercase">
                      <th className="py-2 pr-3 font-semibold">Item</th>
                      <th className="py-2 pr-3 text-right font-semibold">Qty</th>
                      <th className="py-2 pr-3 text-right font-semibold">Unit price</th>
                      <th className="py-2 text-right font-semibold">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.items.map((i) => (
                      <tr key={i.id} className="border-t border-[var(--border)]">
                        <td className="py-2 pr-3 font-semibold">{i.productName}</td>
                        <td className="tnum py-2 pr-3 text-right">{i.quantity}</td>
                        <td className="tnum py-2 pr-3 text-right">{formatMoney(i.unitPrice)}</td>
                        <td className="tnum py-2 text-right font-bold">{formatMoney(i.lineTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-[var(--border-input)]">
                      <td colSpan={3} className="py-3 text-right font-bold">Total</td>
                      <td className="tnum py-3 text-right text-lg font-bold">{formatMoney(detail.total)}</td>
                    </tr>
                  </tfoot>
                </table>
                {detail.notes && <p className="mt-3 text-sm text-[var(--ink-muted)]">{detail.notes}</p>}
                <p className="mt-2 text-xs text-[var(--ink-muted)]">
                  Warehouse stock was deducted when this order was created.
                </p>
              </div>
              <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <SecondaryButton onClick={() => window.print()}>
                  <Icon name="print" size={20} /> Print invoice
                </SecondaryButton>
                {detail.status === 'pending' && (
                  <PrimaryButton onClick={() => setDeliverConfirm(true)}>
                    <Icon name="local_shipping" size={20} /> Mark delivered
                  </PrimaryButton>
                )}
              </div>
            </div>
          ) : null}
        </Modal>

        <ConfirmDialog
          open={deliverConfirm}
          onClose={() => setDeliverConfirm(false)}
          onConfirm={doDeliver}
          title="Mark as delivered?"
          body={
            <>
              Confirm that <strong>{detail?.invoiceNumber}</strong> for{' '}
              <strong>{detail?.customerName}</strong> has been delivered. Stock was already
              deducted from the warehouse when the order was created.
            </>
          }
          confirmLabel="Mark delivered"
          busy={actionBusy}
        />

        <CreateOrderModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            fetchOrders();
          }}
        />
      </div>

      {/* Print-only invoice */}
      {detail && (
        <div className="invoice-print-only hidden bg-white text-black" aria-hidden="true">
          <InvoicePrint detail={detail} />
        </div>
      )}
    </motion.div>
  );
}

/* ═══════════════════════ Create order ═══════════════════════ */

function CreateOrderModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [customerName, setCustomerName] = useState('');
  const [contactName, setContactName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProductLite[]>([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCustomerName('');
    setContactName('');
    setPhone('');
    setAddress('');
    setNotes('');
    setLines([]);
    setQuery('');
    setResults([]);
  }, [open ]);

  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const data = await api<{ items: ProductLite[] }>(
          `/api/v1/products?search=${encodeURIComponent(query.trim())}&limit=8`
        );
        if (!cancelled) setResults(data.items);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, open]);

  const addLine = (p: ProductLite) => {
    setLines((prev) => {
      const existing = prev.find((l) => l.productId === p.id);
      if (existing) {
        return prev.map((l) =>
          l.productId === p.id ? { ...l, qty: String((parseInt(l.qty, 10) || 0) + 1) } : l
        );
      }
      return [
        ...prev,
        {
          productId: p.id,
          name: p.name,
          warehouse: p.quantityWarehouse,
          qty: '1',
          unitPrice: String(p.sellingPrice),
        },
      ];
    });
    setQuery('');
    setResults([]);
  };

  const total = lines.reduce(
    (s, l) => s + (parseInt(l.qty, 10) || 0) * (parseFloat(l.unitPrice) || 0),
    0
  );

  const submit = async () => {
    if (!customerName.trim()) {
      toast.error('Enter the church / customer name.');
      return;
    }
    const valid = lines.filter((l) => (parseInt(l.qty, 10) || 0) > 0);
    if (valid.length === 0) {
      toast.error('Add at least one item.');
      return;
    }
    for (const l of valid) {
      if ((parseInt(l.qty, 10) || 0) > l.warehouse) {
        toast.error(`Only ${l.warehouse} of “${l.name}” in the warehouse.`);
        return;
      }
    }
    setBusy(true);
    try {
      await api('/api/v1/deliveries', {
        method: 'POST',
        body: JSON.stringify({
          customerName: customerName.trim(),
          contactName: contactName.trim() || undefined,
          phone: phone.trim() || undefined,
          address: address.trim() || undefined,
          notes: notes.trim() || undefined,
          items: valid.map((l) => ({
            productId: l.productId,
            quantity: parseInt(l.qty, 10),
            unitPrice: parseFloat(l.unitPrice) || 0,
          })),
        }),
      });
      toast.success('Delivery order created — warehouse stock deducted.');
      onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create delivery order.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="New delivery order" wide>
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Church / customer name" htmlFor="co-customer">
            <input id="co-customer" className={inputClass} value={customerName}
              onChange={(e) => setCustomerName(e.target.value)} placeholder="e.g. Grace Assembly — Kumasi" />
          </Field>
          <Field label="Contact person" htmlFor="co-contact">
            <input id="co-contact" className={inputClass} value={contactName}
              onChange={(e) => setContactName(e.target.value)} placeholder="e.g. Pastor Yaw Boateng" />
          </Field>
          <Field label="Phone" htmlFor="co-phone">
            <input id="co-phone" className={inputClass} value={phone}
              onChange={(e) => setPhone(e.target.value)} placeholder="0244 000 111" />
          </Field>
          <Field label="Delivery address" htmlFor="co-address">
            <input id="co-address" className={inputClass} value={address}
              onChange={(e) => setAddress(e.target.value)} placeholder="e.g. Ahodwo, Kumasi" />
          </Field>
        </div>

        <div>
          <Field label="Add items (from warehouse stock)" htmlFor="co-search">
            <input id="co-search" className={inputClass} value={query}
              onChange={(e) => setQuery(e.target.value)} placeholder="Search items…" />
          </Field>
          {searching && <p className="mt-2 text-sm text-[var(--ink-muted)]">Searching…</p>}
          {results.length > 0 && (
            <ul className="mt-2 divide-y divide-[var(--border)] rounded-xl border border-[var(--border)]">
              {results.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => addLine(p)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-[var(--surface-alt)]"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{p.name}</span>
                      <span className="text-xs text-[var(--ink-muted)]">
                        Warehouse: {p.quantityWarehouse} · {formatMoney(p.sellingPrice)}
                      </span>
                    </span>
                    <Icon name="add_circle" size={22} className="shrink-0 text-[var(--wine)]" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {lines.length > 0 && (
          <div className="space-y-2">
            {lines.map((l) => (
              <div key={l.productId} className="flex flex-wrap items-end gap-2 rounded-xl border border-[var(--border)] px-3 py-2.5">
                <div className="min-w-40 flex-1">
                  <p className="truncate text-sm font-bold">{l.name}</p>
                  <p className="text-xs text-[var(--ink-muted)]">Warehouse stock: {l.warehouse}</p>
                </div>
                <label className="text-xs font-semibold text-[var(--ink-muted)]">
                  Qty
                  <input
                    type="number" min={1} value={l.qty}
                    onChange={(e) =>
                      setLines((prev) => prev.map((x) => (x.productId === l.productId ? { ...x, qty: e.target.value } : x)))
                    }
                    className={`${inputClass} mt-1 w-20`}
                  />
                </label>
                <label className="text-xs font-semibold text-[var(--ink-muted)]">
                  Unit price
                  <input
                    type="number" min={0} step="0.01" value={l.unitPrice}
                    onChange={(e) =>
                      setLines((prev) => prev.map((x) => (x.productId === l.productId ? { ...x, unitPrice: e.target.value } : x)))
                    }
                    className={`${inputClass} mt-1 w-28`}
                  />
                </label>
                <button
                  type="button"
                  aria-label={`Remove ${l.name}`}
                  onClick={() => setLines((prev) => prev.filter((x) => x.productId !== l.productId))}
                  className="flex h-11 w-11 items-center justify-center rounded-full text-[var(--danger)] hover:bg-[var(--danger-bg)]"
                >
                  <Icon name="delete" size={20} />
                </button>
              </div>
            ))}
            <p className="tnum text-right text-base font-bold">
              Total: {formatMoney(total)}
            </p>
          </div>
        )}

        <Field label="Notes" htmlFor="co-notes">
          <textarea id="co-notes" className={`${inputClass} min-h-[72px] py-3`} value={notes}
            onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes…" maxLength={2000} />
        </Field>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <SecondaryButton onClick={onClose} disabled={busy}>Cancel</SecondaryButton>
          <PrimaryButton onClick={submit} disabled={busy}>
            {busy ? 'Creating…' : 'Create order & deduct warehouse stock'}
          </PrimaryButton>
        </div>
      </div>
    </Modal>
  );
}

/* ═══════════════════════ Print-only invoice ═══════════════════════ */

function InvoicePrint({ detail }: { detail: DeliveryDetail }) {
  return (
    <div className="mx-auto w-full max-w-[700px] text-black">
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <p style={{ fontSize: 22, fontWeight: 800 }}>{detail.settings.shopName}</p>
        <p style={{ fontSize: 13, letterSpacing: 2, textTransform: 'uppercase' }}>Invoice</p>
      </div>
      <table style={{ width: '100%', fontSize: 13, marginBottom: 12 }}>
        <tbody>
          <tr>
            <td><strong>Invoice No:</strong> {detail.invoiceNumber}</td>
            <td style={{ textAlign: 'right' }}>
              <strong>Date:</strong>{' '}
              {new Date(detail.createdAt).toLocaleDateString('en-GH', { day: 'numeric', month: 'long', year: 'numeric' })}
            </td>
          </tr>
          <tr>
            <td><strong>Billed to:</strong> {detail.customerName}</td>
            <td style={{ textAlign: 'right' }}>
              <strong>Status:</strong> {detail.status === 'delivered' ? 'Delivered' : 'Pending delivery'}
            </td>
          </tr>
          {detail.contactName && (
            <tr><td><strong>Contact:</strong> {detail.contactName}</td><td /></tr>
          )}
          {detail.phone && (
            <tr><td><strong>Phone:</strong> {detail.phone}</td><td /></tr>
          )}
          {detail.address && (
            <tr><td><strong>Deliver to:</strong> {detail.address}</td><td /></tr>
          )}
        </tbody>
      </table>
      <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderTop: '2px solid #000', borderBottom: '1px solid #000' }}>
            <th style={{ textAlign: 'left', padding: '6px 4px' }}>Item</th>
            <th style={{ textAlign: 'right', padding: '6px 4px' }}>Qty</th>
            <th style={{ textAlign: 'right', padding: '6px 4px' }}>Unit price</th>
            <th style={{ textAlign: 'right', padding: '6px 4px' }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {detail.items.map((i) => (
            <tr key={i.id} style={{ borderBottom: '1px solid #ccc' }}>
              <td style={{ padding: '6px 4px' }}>{i.productName}</td>
              <td style={{ textAlign: 'right', padding: '6px 4px' }}>{i.quantity}</td>
              <td style={{ textAlign: 'right', padding: '6px 4px' }}>{formatMoney(i.unitPrice)}</td>
              <td style={{ textAlign: 'right', padding: '6px 4px', fontWeight: 700 }}>{formatMoney(i.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: '2px solid #000' }}>
            <td colSpan={3} style={{ textAlign: 'right', padding: '8px 4px', fontWeight: 800 }}>TOTAL</td>
            <td style={{ textAlign: 'right', padding: '8px 4px', fontWeight: 800, fontSize: 15 }}>
              {formatMoney(detail.total)}
            </td>
          </tr>
        </tfoot>
      </table>
      {detail.notes && <p style={{ fontSize: 12, marginTop: 12 }}>{detail.notes}</p>}
      <p style={{ fontSize: 12, marginTop: 20, textAlign: 'center', fontStyle: 'italic' }}>
        {detail.settings.receiptFooter || 'Thank you and God bless you.'}
      </p>
    </div>
  );
}
