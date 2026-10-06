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


export default function DepositsClient() {
  const [accounts, setAccounts] = useState<DepositAccount[]>([]);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>('');
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="mx-auto max-w-5xl px-4 pb-24 pt-6 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Deposit Accounts</h1>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">
            Record cash deposited into the bank accounts. Every deposit is logged with a reference.
          </p>
        </div>
        <PrimaryButton onClick={openModal}>
          <Icon name="add" size={20} /> Record deposit
        </PrimaryButton>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-40 animate-pulse rounded-2xl bg-[var(--surface-alt)]" />
          ))}
        </div>
      ) : (
        <>
          {/* Account cards */}
          <div className="grid gap-4 sm:grid-cols-2">
            {accounts.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setSelectedAccount(selectedAccount === a.id ? '' : a.id)}
                aria-pressed={selectedAccount === a.id}
                className={`rounded-2xl border-2 bg-[var(--surface)] p-5 text-left transition active:scale-[0.99] ${
                  selectedAccount === a.id
                    ? 'border-[var(--wine)] shadow-lg'
                    : 'border-[var(--border)]'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="grid h-12 w-12 place-items-center rounded-xl bg-[var(--wine)]/10 text-[var(--wine)]">
                      <Icon name="account_balance" size={26} />
                    </span>
                    <div>
                      <p className="font-bold leading-tight">{a.name}</p>
                      {a.bankName && (
                        <p className="mt-0.5 text-[13px] text-[var(--ink-muted)]">
                          {a.bankName}
                          {a.accountNumber ? ` · ${a.accountNumber}` : ''}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex items-end justify-between">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">
                      Total deposited
                    </p>
                    <p className="tnum text-2xl font-bold text-[var(--wine)]">
                      {formatMoney(a.totalDeposited)}
                    </p>
                  </div>
                  <p className="text-[13px] font-semibold text-[var(--ink-muted)]">
                    {a.depositCount} deposit{a.depositCount === 1 ? '' : 's'}
                  </p>
                </div>
              </button>
            ))}
          </div>

          {/* Deposit history */}
          <div className="mt-8">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold">
                {selectedAccount
                  ? `Deposits — ${accounts.find((a) => a.id === selectedAccount)?.name ?? ''}`
                  : 'Recent deposits'}
              </h2>
              {selectedAccount && (
                <button
                  type="button"
                  onClick={() => setSelectedAccount('')}
                  className="text-sm font-bold text-[var(--wine)]"
                >
                  Clear filter
                </button>
              )}
            </div>
            {deposits.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[var(--border)] p-10 text-center">
                <Icon name="savings" size={40} className="mx-auto text-[var(--ink-muted)]" />
                <p className="mt-3 font-bold">No deposits recorded yet</p>
                <p className="mt-1 text-sm text-[var(--ink-muted)]">
                  Tap “Record deposit” when cash from the shop is banked.
                </p>
              </div>
            ) : (
              <ul className="flex flex-col gap-2">
                {deposits.map((d) => (
                  <li
                    key={d.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="font-bold tnum">{formatMoney(d.amount)}</p>
                      <p className="truncate text-[13px] text-[var(--ink-muted)]">
                        {d.referenceNumber} · {d.depositAccountName} · {d.depositedOn}
                        {d.depositedByName ? ` · by ${d.depositedByName}` : ''}
                      </p>
                      {d.notes && (
                        <p className="truncate text-[13px] italic text-[var(--ink-muted)]">{d.notes}</p>
                      )}
                    </div>
                    <Icon name="check_circle" size={22} className="shrink-0 text-[var(--success)]" />
                  </li>
                ))}
              </ul>
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
