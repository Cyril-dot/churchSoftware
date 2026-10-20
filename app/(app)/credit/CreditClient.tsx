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
  EmptyState,
  ErrorState,
  SkeletonRows,
  StatCard,
} from '@/components/ui';

/* ═══════════════════════ Types ═══════════════════════ */

interface CreditRow {
  id: string;
  referenceNumber: string;
  churchName: string;
  contactName: string;
  phone: string | null;
  location: string | null;
  takenOn: string;
  dueDate: string | null;
  total: number;
  paid: number;
  balance: number;
  status: 'owing' | 'part_paid' | 'settled';
  overdue: boolean;
  notes: string | null;
  itemCount: number;
  createdByName: string | null;
  createdAt: string;
}

interface CreditDetail extends CreditRow {
  items: {
    id: string;
    productId: string;
    productName: string;
    sku: string | null;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }[];
  payments: {
    id: string;
    amount: number;
    paidOn: string;
    paymentMethod: string | null;
    notes: string | null;
    receivedByName: string | null;
  }[];
}

interface ProductLite {
  id: string;
  name: string;
  sellingPrice: number;
  quantityShop: number;
  quantityWarehouse: number;
}

interface LineDraft {
  productId: string;
  name: string;
  shop: number;
  qty: string;
  unitPrice: string;
}

const STATUS_FILTERS = [
  { value: '', label: 'All' },
  { value: 'owing', label: 'Owing' },
  { value: 'part_paid', label: 'Part-paid' },
  { value: 'settled', label: 'Settled' },
  { value: 'overdue', label: 'Overdue' },
];

const LOCATIONS = ['Accra', 'Kumasi', 'Adenta', 'Tema', 'Takoradi', 'Cape Coast', 'Other'];

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso + (iso.length === 10 ? 'T12:00:00' : '')).toLocaleDateString('en-GH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function StatusBadges({ c }: { c: CreditRow }) {
  return (
    <span className="flex flex-wrap gap-1.5">
      {c.overdue && <Badge tone="red">Overdue</Badge>}
      {c.status === 'settled' ? (
        <Badge tone="green">Settled</Badge>
      ) : c.status === 'part_paid' ? (
        <Badge tone="gold">Part-paid</Badge>
      ) : (
        <Badge tone="wine">Owing</Badge>
      )}
    </span>
  );
}

/* ═══════════════════════ Main component ═══════════════════════ */

export default function CreditClient({
  user,
  initialStatus = '',
}: {
  user: SessionUser;
  initialStatus?: string;
}) {
  void user;
  const [rows, setRows] = useState<CreditRow[]>([]);
  const [summary, setSummary] = useState({ outstandingCount: 0, outstandingTotal: 0, overdueCount: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState(initialStatus);

  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<CreditDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (status) params.set('status', status);
      const data = await api<{
        items: CreditRow[];
        summary: { outstandingCount: number; outstandingTotal: number; overdueCount: number };
      }>(`/api/v1/credit?${params}`);
      setRows(data.items);
      setSummary(data.summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load credit customers.');
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const openDetail = async (c: CreditRow) => {
    setDetailOpen(true);
    setDetailLoading(true);
    setDetail(null);
    try {
      const data = await api<CreditDetail>(`/api/v1/credit/${c.id}`);
      setDetail(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load credit record.');
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  };

  const refreshDetail = async (id: string) => {
    try {
      const data = await api<CreditDetail>(`/api/v1/credit/${id}`);
      setDetail(data);
    } catch {
      /* keep stale */
    }
  };

  return (
    <motion.div variants={listVariants} initial="hidden" animate="show">
      <PageHeader
        title="Credit Customers"
        subtitle="Books taken on credit — track balances, part payments and overdue accounts"
        actions={
          <PrimaryButton onClick={() => setCreateOpen(true)}>
            <Icon name="add" size={20} /> New credit sale
          </PrimaryButton>
        }
      />

      {/* Summary */}
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard icon="account_balance_wallet" label="Total outstanding" value={formatMoney(summary.outstandingTotal)} tone="wine" />
        <StatCard icon="group" label="Accounts owing" value={String(summary.outstandingCount)} tone="gold" />
        <StatCard icon="warning" label="Overdue accounts" value={String(summary.overdueCount)} tone="red" />
      </div>

      {/* Status filter chips */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setStatus(f.value)}
            aria-pressed={status === f.value}
            className={`inline-flex min-h-[44px] items-center rounded-full px-4 text-sm font-semibold transition ${
              status === f.value
                ? 'bg-[var(--wine)] text-white'
                : 'bg-[var(--surface-alt)] text-[var(--ink-muted)] hover:bg-[var(--wine-tint)] hover:text-[var(--wine)]'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <SkeletonRows rows={6} />
      ) : error ? (
        <ErrorState message={error} onRetry={fetchRows} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon="account_balance_wallet"
          title="No credit records"
          body="Record a credit sale when a church or customer takes books now and pays later."
          action={
            <PrimaryButton onClick={() => setCreateOpen(true)}>
              <Icon name="add" size={20} /> New credit sale
            </PrimaryButton>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((c) => (
            <motion.button
              key={c.id}
              type="button"
              variants={riseVariants}
              onClick={() => openDetail(c)}
              className={`rounded-2xl border bg-[var(--surface)] p-4 text-left shadow-[var(--shadow)] transition hover:-translate-y-0.5 hover:shadow-lg ${
                c.overdue ? 'border-[var(--danger)]/50' : 'border-[var(--border)]'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-bold text-[var(--ink)]">{c.churchName}</p>
                  <p className="truncate text-xs text-[var(--ink-muted)]">
                    {c.contactName}
                    {c.location ? ` · ${c.location}` : ''} · {c.referenceNumber}
                  </p>
                </div>
                <StatusBadges c={c} />
              </div>
              <div className="mt-3 space-y-1 border-t border-[var(--border)] pt-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-[var(--ink-muted)]">Taken {fmtDate(c.takenOn)}</span>
                  <span className="text-[var(--ink-muted)]">
                    Due {fmtDate(c.dueDate)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--ink-muted)]">Paid {formatMoney(c.paid)}</span>
                  <span className="tnum font-bold text-[var(--ink)]">
                    Balance {formatMoney(c.balance)}
                  </span>
                </div>
              </div>
            </motion.button>
          ))}
        </div>
      )}

      {/* ── Detail modal ── */}
      <Modal open={detailOpen} onClose={() => setDetailOpen(false)} title="Credit record" wide>
        {detailLoading ? (
          <SkeletonRows rows={5} />
        ) : detail ? (
          <CreditDetailView
            detail={detail}
            onPaymentRecorded={() => {
              refreshDetail(detail.id);
              fetchRows();
            }}
          />
        ) : null}
      </Modal>

      <CreateCreditModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setCreateOpen(false);
          fetchRows();
        }}
      />
    </motion.div>
  );
}

/* ═══════════════════════ Detail + payments ═══════════════════════ */

function CreditDetailView({
  detail,
  onPaymentRecorded,
}: {
  detail: CreditDetail;
  onPaymentRecorded: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [paidOn, setPaidOn] = useState(todayISO());
  const [method, setMethod] = useState('cash');
  const [payNotes, setPayNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const submitPayment = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) {
      toast.error('Enter a payment amount.');
      return;
    }
    if (amt > detail.balance) {
      toast.error(`Payment exceeds the balance of ${formatMoney(detail.balance)}.`);
      return;
    }
    setBusy(true);
    try {
      await api(`/api/v1/credit/${detail.id}/payments`, {
        method: 'POST',
        body: JSON.stringify({
          amount: amt,
          paidOn,
          paymentMethod: method,
          notes: payNotes.trim() || undefined,
        }),
      });
      toast.success('Payment recorded.');
      setAmount('');
      setPayNotes('');
      onPaymentRecorded();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to record payment.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-display text-xl text-[var(--ink)]">{detail.churchName}</p>
          <p className="text-sm text-[var(--ink-muted)]">
            {detail.referenceNumber} · Taken {fmtDate(detail.takenOn)}
          </p>
        </div>
        <StatusBadges c={detail} />
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div className="rounded-xl bg-[var(--surface-alt)] px-3 py-2.5">
          <dt className="text-[var(--ink-muted)]">Contact</dt>
          <dd className="font-bold">{detail.contactName}</dd>
        </div>
        <div className="rounded-xl bg-[var(--surface-alt)] px-3 py-2.5">
          <dt className="text-[var(--ink-muted)]">Phone</dt>
          <dd className="font-bold">{detail.phone ?? '—'}</dd>
        </div>
        <div className="rounded-xl bg-[var(--surface-alt)] px-3 py-2.5">
          <dt className="text-[var(--ink-muted)]">Location</dt>
          <dd className="font-bold">{detail.location ?? '—'}</dd>
        </div>
        <div className="rounded-xl bg-[var(--surface-alt)] px-3 py-2.5">
          <dt className="text-[var(--ink-muted)]">Due date</dt>
          <dd className={`font-bold ${detail.overdue ? 'text-[var(--danger)]' : ''}`}>
            {fmtDate(detail.dueDate)}
          </dd>
        </div>
      </dl>

      <h3 className="font-display mt-5 text-base text-[var(--ink)]">Items taken</h3>
      <table className="mt-2 w-full text-left text-sm">
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
      </table>

      <dl className="mt-4 space-y-1.5 border-t border-[var(--border)] pt-3 text-[15px]">
        <div className="flex justify-between">
          <dt className="text-[var(--ink-muted)]">Total</dt>
          <dd className="tnum font-bold">{formatMoney(detail.total)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-[var(--ink-muted)]">Paid so far</dt>
          <dd className="tnum font-bold text-[var(--success)]">{formatMoney(detail.paid)}</dd>
        </div>
        <div className="flex justify-between text-lg">
          <dt className="font-bold">Balance</dt>
          <dd className={`tnum font-bold ${detail.balance > 0 ? 'text-[var(--danger)]' : 'text-[var(--success)]'}`}>
            {formatMoney(detail.balance)}
          </dd>
        </div>
      </dl>

      {detail.payments.length > 0 && (
        <>
          <h3 className="font-display mt-5 text-base text-[var(--ink)]">Payments</h3>
          <ul className="mt-2 divide-y divide-[var(--border)] rounded-xl border border-[var(--border)]">
            {detail.payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span>
                  <span className="font-semibold">{fmtDate(p.paidOn)}</span>
                  <span className="text-[var(--ink-muted)]">
                    {' '}· {p.paymentMethod ? p.paymentMethod.replace('_', ' ') : '—'}
                    {p.notes ? ` · ${p.notes}` : ''}
                  </span>
                </span>
                <span className="tnum font-bold text-[var(--success)]">{formatMoney(p.amount)}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {detail.balance > 0 && (
        <div className="mt-5 rounded-xl border border-[var(--border)] bg-[var(--surface-alt)]/50 p-4">
          <h3 className="font-display text-base text-[var(--ink)]">Record a payment</h3>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Amount" htmlFor="pay-amount">
              <input id="pay-amount" type="number" min={0} step="0.01" className={inputClass}
                value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
            </Field>
            <Field label="Date" htmlFor="pay-date">
              <input id="pay-date" type="date" max={todayISO()} className={inputClass}
                value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
            </Field>
            <Field label="Method" htmlFor="pay-method">
              <select id="pay-method" className={inputClass} value={method}
                onChange={(e) => setMethod(e.target.value)}>
                <option value="cash">Cash</option>
                <option value="mobile_money">Mobile Money</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="card">Card</option>
                <option value="other">Other</option>
              </select>
            </Field>
          </div>
          <div className="mt-3">
            <Field label="Notes" htmlFor="pay-notes">
              <input id="pay-notes" className={inputClass} value={payNotes}
                onChange={(e) => setPayNotes(e.target.value)} placeholder="Optional…" maxLength={1000} />
            </Field>
          </div>
          <div className="mt-4 flex justify-end">
            <PrimaryButton onClick={submitPayment} disabled={busy}>
              {busy ? 'Saving…' : 'Record payment'}
            </PrimaryButton>
          </div>
        </div>
      )}
      {detail.notes && <p className="mt-4 text-sm text-[var(--ink-muted)]">{detail.notes}</p>}
    </div>
  );
}

/* ═══════════════════════ Create credit sale ═══════════════════════ */

function CreateCreditModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [churchName, setChurchName] = useState('');
  const [contactName, setContactName] = useState('');
  const [phone, setPhone] = useState('');
  const [location, setLocation] = useState('');
  const [takenOn, setTakenOn] = useState(todayISO());
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProductLite[]>([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setChurchName('');
    setContactName('');
    setPhone('');
    setLocation('');
    setTakenOn(todayISO());
    setDueDate('');
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
        { productId: p.id, name: p.name, shop: p.quantityShop, qty: '1', unitPrice: String(p.sellingPrice) },
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
    if (!churchName.trim()) {
      toast.error('Enter the church name.');
      return;
    }
    if (!contactName.trim()) {
      toast.error('Enter the pastor / contact person name.');
      return;
    }
    const valid = lines.filter((l) => (parseInt(l.qty, 10) || 0) > 0);
    if (valid.length === 0) {
      toast.error('Add at least one item.');
      return;
    }
    for (const l of valid) {
      if ((parseInt(l.qty, 10) || 0) > l.shop) {
        toast.error(`Only ${l.shop} of “${l.name}” in the shop.`);
        return;
      }
    }
    setBusy(true);
    try {
      await api('/api/v1/credit', {
        method: 'POST',
        body: JSON.stringify({
          churchName: churchName.trim(),
          contactName: contactName.trim(),
          phone: phone.trim() || undefined,
          location: location.trim() || undefined,
          takenOn,
          dueDate: dueDate || undefined,
          notes: notes.trim() || undefined,
          items: valid.map((l) => ({
            productId: l.productId,
            quantity: parseInt(l.qty, 10),
            unitPrice: parseFloat(l.unitPrice) || 0,
          })),
        }),
      });
      toast.success('Credit sale recorded — shop stock deducted.');
      onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to record credit sale.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="New credit sale" wide>
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Church name" htmlFor="cr-church">
            <input id="cr-church" className={inputClass} value={churchName}
              onChange={(e) => setChurchName(e.target.value)} placeholder="e.g. Pentecost Fellowship — Accra" />
          </Field>
          <Field label="Pastor / contact person" htmlFor="cr-contact">
            <input id="cr-contact" className={inputClass} value={contactName}
              onChange={(e) => setContactName(e.target.value)} placeholder="e.g. Pastor Daniel Osei" />
          </Field>
          <Field label="Phone" htmlFor="cr-phone">
            <input id="cr-phone" className={inputClass} value={phone}
              onChange={(e) => setPhone(e.target.value)} placeholder="0244 111 222" />
          </Field>
          <Field label="Location" htmlFor="cr-location">
            <input id="cr-location" className={inputClass} value={location} list="cr-locations"
              onChange={(e) => setLocation(e.target.value)} placeholder="Accra / Kumasi / Adenta…" />
            <datalist id="cr-locations">
              {LOCATIONS.map((l) => (
                <option key={l} value={l} />
              ))}
            </datalist>
          </Field>
          <Field label="Date taken" htmlFor="cr-taken">
            <input id="cr-taken" type="date" max={todayISO()} className={inputClass} value={takenOn}
              onChange={(e) => setTakenOn(e.target.value)} />
          </Field>
          <Field label="Due date (final payment)" htmlFor="cr-due">
            <input id="cr-due" type="date" className={inputClass} value={dueDate}
              onChange={(e) => setDueDate(e.target.value)} />
          </Field>
        </div>

        <div>
          <Field label="Add items (from shop stock)" htmlFor="cr-search">
            <input id="cr-search" className={inputClass} value={query}
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
                        Shop: {p.quantityShop} · {formatMoney(p.sellingPrice)}
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
                  <p className="text-xs text-[var(--ink-muted)]">Shop stock: {l.shop}</p>
                </div>
                <label className="text-xs font-semibold text-[var(--ink-muted)]">
                  Qty
                  <input type="number" min={1} value={l.qty}
                    onChange={(e) => setLines((prev) => prev.map((x) => (x.productId === l.productId ? { ...x, qty: e.target.value } : x)))}
                    className={`${inputClass} mt-1 w-20`} />
                </label>
                <label className="text-xs font-semibold text-[var(--ink-muted)]">
                  Unit price
                  <input type="number" min={0} step="0.01" value={l.unitPrice}
                    onChange={(e) => setLines((prev) => prev.map((x) => (x.productId === l.productId ? { ...x, unitPrice: e.target.value } : x)))}
                    className={`${inputClass} mt-1 w-28`} />
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
            <p className="tnum text-right text-base font-bold">Total on credit: {formatMoney(total)}</p>
          </div>
        )}

        <Field label="Notes" htmlFor="cr-notes">
          <textarea id="cr-notes" className={`${inputClass} min-h-[72px] py-3`} value={notes}
            onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes…" maxLength={2000} />
        </Field>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <SecondaryButton onClick={onClose} disabled={busy}>Cancel</SecondaryButton>
          <PrimaryButton onClick={submit} disabled={busy}>
            {busy ? 'Saving…' : 'Record credit sale'}
          </PrimaryButton>
        </div>
      </div>
    </Modal>
  );
}
