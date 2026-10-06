'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import Icon from '@/components/Icon';
import { formatMoney } from '@/lib/money';
import {
  api,
  PrimaryButton,
  SecondaryButton,
  Modal,
  Field,
  inputClass,
  ChapterHeader,
  StampBadge,
  SpineCard,
  EmptyState,
} from '@/components/ui';

interface DepositAccount {
  id: string;
  name: string;
  bankName: string | null;
  accountNumber: string | null;
  totalDeposited: number;
  depositCount: number;
  lastDepositOn: string | null;
}

interface Deposit {
  id: string;
  referenceNumber: string;
  depositAccountId: string;
  depositAccountName: string;
  amount: number;
  depositedOn: string;
  depositedByName: string | null;
  notes: string | null;
  createdAt: string;
}

interface PaymentMethodRow {
  paymentMethod: string;
  revenue: number;
  transactions: number;
}

export default function DepositsClient() {
  const [accounts, setAccounts] = useState<DepositAccount[]>([]);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [cash, setCash] = useState<{ cashSales: number; bankedToday: number } | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [accountId, setAccountId] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [acctRes, depRes] = await Promise.all([
        api<{ items: DepositAccount[] }>('/api/v1/deposit-accounts'),
        api<{ items: Deposit[] }>(
          `/api/v1/deposits${selectedAccount ? `?accountId=${selectedAccount}` : ''}`
        ),
      ]);
      setAccounts(acctRes.items);
      setDeposits(depRes.items);
      if (!accountId && acctRes.items[0]) setAccountId(acctRes.items[0].id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load deposits.');
    } finally {
      setLoading(false);
    }
    // Unbanked-cash calculator: best-effort, never blocks the page.
    try {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const todayStr = new Date().toISOString().slice(0, 10);
      const [payRes, todayRes] = await Promise.all([
        api<{ methods: PaymentMethodRow[] }>(
          `/api/v1/reports/by-payment?from=${encodeURIComponent(startOfDay.toISOString())}`
        ),
        api<{ items: Deposit[] }>('/api/v1/deposits?limit=100'),
      ]);
      const cashSales = payRes.methods
        .filter((m) => m.paymentMethod === 'cash')
        .reduce((sum, m) => sum + (m.revenue || 0), 0);
      const bankedToday = todayRes.items
        .filter((d) => d.depositedOn === todayStr)
        .reduce((sum, d) => sum + (d.amount || 0), 0);
      setCash({ cashSales, bankedToday });
    } catch {
      setCash(null);
    }
  }, [selectedAccount, accountId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const openModal = () => {
    setAmount('');
    setNotes('');
    setDate(new Date().toISOString().slice(0, 10));
    setError(null);
    setModalOpen(true);
  };

  const submit = async () => {
    const value = parseFloat(amount);
    if (Number.isNaN(value) || value <= 0) {
      setError('Enter a valid amount greater than zero.');
      return;
    }
    if (!accountId) {
      setError('Choose an account.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api('/api/v1/deposits', {
        method: 'POST',
        body: JSON.stringify({
          depositAccountId: accountId,
          amount: value,
          depositedOn: date || undefined,
          notes: notes.trim() || undefined,
        }),
      });
      toast.success('Deposit recorded.');
      setModalOpen(false);
      fetchAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to record deposit.');
    } finally {
      setBusy(false);
    }
  };

  const unbanked = cash ? cash.cashSales - cash.bankedToday : 0;
  const summaryAmount = parseFloat(amount);
  const summaryAccount = accounts.find((a) => a.id === accountId);

  return (
    <div className="mx-auto max-w-5xl px-4 pb-24 pt-6 sm:px-6">
      <ChapterHeader
        eyebrow="Chapter One"
        title="Bank deposits"
        action={
          <PrimaryButton onClick={openModal}>
            <Icon name="add" size={20} /> Record deposit
          </PrimaryButton>
        }
      />

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-44 animate-pulse rounded-2xl bg-[var(--surface-alt)]" />
          ))}
        </div>
      ) : (
        <>
          {/* Unbanked cash calculator */}
          {cash && (
            <SpineCard tone="brass" className="mb-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
                  Unbanked cash
                </p>
                {unbanked > 0 ? (
                  <StampBadge tone="brass">Unbanked</StampBadge>
                ) : (
                  <StampBadge tone="olive">All banked</StampBadge>
                )}
              </div>
              <p className="tnum font-display mt-2 text-4xl leading-none text-[var(--ink)] sm:text-5xl">
                {formatMoney(unbanked)}
              </p>
              <div className="receipt-dash mt-4 flex flex-col gap-2 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center justify-between gap-6 sm:justify-start sm:gap-10">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">
                      Cash sales today
                    </p>
                    <p className="tnum mt-0.5 text-lg font-bold text-[var(--ink)]">
                      {formatMoney(cash.cashSales)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">
                      Banked today
                    </p>
                    <p className="tnum mt-0.5 text-lg font-bold text-[var(--olive)]">
                      {formatMoney(cash.bankedToday)}
                    </p>
                  </div>
                </div>
                <p className="text-[12px] text-[var(--ink-muted)]">
                  Today&apos;s cash sales minus deposits recorded today.
                </p>
              </div>
            </SpineCard>
          )}

          {/* Account cards */}
          <div className="grid gap-4 sm:grid-cols-2">
            {accounts.map((a) => {
              const selected = selectedAccount === a.id;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setSelectedAccount(selected ? '' : a.id)}
                  aria-pressed={selected}
                  className={`spine-card spine-brass min-h-[88px] w-full p-5 text-left transition active:scale-[0.99] ${
                    selected ? 'ring-2 ring-[var(--brass)] ring-offset-2 ring-offset-[var(--bg)]' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[var(--brass)]/10 text-[var(--brass)]">
                        <Icon name="account_balance" size={26} />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-bold leading-tight">{a.name}</p>
                        {(a.bankName || a.accountNumber) && (
                          <p className="mt-1 truncate text-[13px] text-[var(--ink-muted)]">
                            {a.bankName}
                            {a.accountNumber && (
                              <span className="font-mono"> · {a.accountNumber}</span>
                            )}
                          </p>
                        )}
                      </div>
                    </div>
                    {selected && <StampBadge tone="brass">Filtered</StampBadge>}
                  </div>
                  <div className="mt-4 flex flex-wrap items-end justify-between gap-2">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">
                        Total deposited
                      </p>
                      <p className="tnum font-display mt-0.5 text-2xl leading-none text-[var(--brass)]">
                        {formatMoney(a.totalDeposited)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[13px] font-bold text-[var(--ink)]">
                        {a.depositCount} deposit{a.depositCount === 1 ? '' : 's'}
                      </p>
                      <p className="tnum mt-0.5 text-[12px] text-[var(--ink-muted)]">
                        {a.lastDepositOn ? `Last: ${a.lastDepositOn}` : 'No deposits yet'}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Deposit timeline */}
          <div className="mt-8">
            <ChapterHeader
              eyebrow="Ledger"
              title={
                selectedAccount
                  ? `Deposits — ${accounts.find((a) => a.id === selectedAccount)?.name ?? ''}`
                  : 'Deposit timeline'
              }
              action={
                selectedAccount ? (
                  <button
                    type="button"
                    onClick={() => setSelectedAccount('')}
                    className="min-h-[44px] px-2 text-sm font-bold text-[var(--wine)]"
                  >
                    Clear filter
                  </button>
                ) : undefined
              }
            />
            {deposits.length === 0 ? (
              <EmptyState
                icon="savings"
                title="No deposits recorded yet"
                body="Tap “Record deposit” when cash from the shop is banked."
                action={
                  <PrimaryButton onClick={openModal}>
                    <Icon name="add" size={20} /> Record deposit
                  </PrimaryButton>
                }
              />
            ) : (
              <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
                <ul>
                  {deposits.map((d) => (
                    <li key={d.id} className="ledger-row">
                      <div className="flex min-h-[64px] items-center justify-between gap-3 px-4 py-3 sm:px-5">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <StampBadge tone="olive">Banked</StampBadge>
                            <span className="font-mono text-[13px] font-semibold text-[var(--ink)]">
                              {d.referenceNumber}
                            </span>
                          </div>
                          <p className="tnum mt-1 truncate text-[13px] text-[var(--ink-muted)]">
                            {d.depositedOn} · {d.depositAccountName}
                            {d.depositedByName ? ` · by ${d.depositedByName}` : ''}
                          </p>
                          {d.notes && (
                            <p className="truncate text-[13px] italic text-[var(--ink-muted)]">
                              {d.notes}
                            </p>
                          )}
                        </div>
                        <p className="tnum font-display shrink-0 text-lg text-[var(--ink)]">
                          {formatMoney(d.amount)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </>
      )}

      {/* Record deposit modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Record deposit">
        <div className="flex flex-col gap-4">
          {error && (
            <p role="alert" className="rounded-lg bg-[var(--danger-bg)] px-4 py-3 text-sm font-semibold text-[var(--danger)]">
              {error}
            </p>
          )}
          <Field label="Account" htmlFor="d-account">
            <select
              id="d-account"
              className={inputClass}
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Amount (GH₵)" htmlFor="d-amount">
              <input
                id="d-amount"
                className={inputClass}
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                autoFocus
              />
            </Field>
            <Field label="Date" htmlFor="d-date">
              <input
                id="d-date"
                type="date"
                className={inputClass}
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </Field>
          </div>
          <Field label="Note (optional)" htmlFor="d-notes">
            <input
              id="d-notes"
              className={inputClass}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Weekend sales banked"
            />
          </Field>
          {!Number.isNaN(summaryAmount) && summaryAmount > 0 && summaryAccount && (
            <div className="flex min-h-[56px] items-center justify-between gap-3 rounded-xl bg-[var(--olive-bg)] px-4 py-3">
              <span className="flex items-center gap-2 text-sm font-bold text-[var(--olive)]">
                <Icon name="account_balance" size={20} /> Banking into
              </span>
              <span className="tnum font-display text-right text-lg text-[var(--ink)]">
                {formatMoney(summaryAmount)}
                <span className="tnum block font-sans text-[12px] font-semibold text-[var(--ink-muted)]">
                  {summaryAccount.name}
                </span>
              </span>
            </div>
          )}
          <div className="mt-1 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <SecondaryButton onClick={() => setModalOpen(false)} disabled={busy}>Cancel</SecondaryButton>
            <PrimaryButton onClick={submit} disabled={busy}>
              {busy ? 'Saving…' : 'Record deposit'}
            </PrimaryButton>
          </div>
        </div>
      </Modal>
    </div>
  );
}
