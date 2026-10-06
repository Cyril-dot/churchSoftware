'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import Icon from '@/components/Icon';
import { formatMoney, parseMoney } from '@/lib/money';
import type { Role } from '@/lib/rbac';
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

interface MomoEntry {
  id: string;
  entryType: string;
  amount: number;
  balanceAfter: number;
  reference: string | null;
  notes: string | null;
  createdBy: string;
  createdByName: string | null;
  createdAt: string;
}

type MomoActionType = 'top_up' | 'withdrawal' | 'set_balance';

type StampToneName = 'wine' | 'gold' | 'olive' | 'slate' | 'danger' | 'brass';

const MOMO_ACTIONS: Record<
  MomoActionType,
  { label: string; icon: string; blurb: string }
> = {
  top_up: { label: 'Top up', icon: 'add', blurb: 'Add float to the MoMo wallet.' },
  withdrawal: { label: 'Withdraw', icon: 'remove', blurb: 'Take float out of the MoMo wallet.' },
  set_balance: { label: 'Set balance', icon: 'tune', blurb: 'Correct the wallet to an exact balance.' },
};

const MOMO_TYPE_META: Record<string, { label: string; tone: StampToneName; sign: '+' | '−' | '=' }> = {
  top_up: { label: 'Top up', tone: 'olive', sign: '+' },
  withdrawal: { label: 'Withdrawal', tone: 'brass', sign: '−' },
  set_balance: { label: 'Set balance', tone: 'slate', sign: '=' },
  sale: { label: 'Sale', tone: 'olive', sign: '+' },
  cashout: { label: 'Cashout', tone: 'brass', sign: '−' },
};

const MOMO_HISTORY_LIMIT = 12;

function formatEntryDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface Cashout {
  id: string;
  referenceNumber: string;
  amount: number;
  cashedAt: string;
  cashedBy: string;
  cashedByName: string | null;
  notes: string | null;
  createdAt: string;
}

/** "YYYY-MM-DDTHH:MM" in local time, for <input type="datetime-local">. */
function localDateTimeValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

function formatCashoutDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function DepositsClient({ role }: { role: Role }) {
  const isAdmin = role === 'admin';
  const [accounts, setAccounts] = useState<DepositAccount[]>([]);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [cash, setCash] = useState<{ cashSales: number; bankedToday: number } | null>(null);

  // ── MoMo wallet ──
  const [momoBalance, setMomoBalance] = useState<number | null>(null);
  const [momoEntries, setMomoEntries] = useState<MomoEntry[]>([]);
  const [momoLoading, setMomoLoading] = useState(true);
  const [momoError, setMomoError] = useState<string | null>(null);
  const [momoAction, setMomoAction] = useState<MomoActionType | null>(null);
  const [momoAmount, setMomoAmount] = useState('');
  const [momoReference, setMomoReference] = useState('');
  const [momoNotes, setMomoNotes] = useState('');
  const [momoFormError, setMomoFormError] = useState<string | null>(null);
  const [momoConfirming, setMomoConfirming] = useState(false);
  const [momoBusy, setMomoBusy] = useState(false);

  // ── Cash-outs (admin only) ──
  const [cashouts, setCashouts] = useState<Cashout[]>([]);
  const [cashoutLoading, setCashoutLoading] = useState(true);
  const [cashoutError, setCashoutError] = useState<string | null>(null);
  const [cashoutModalOpen, setCashoutModalOpen] = useState(false);
  const [cashoutAmount, setCashoutAmount] = useState('');
  const [cashoutAt, setCashoutAt] = useState('');
  const [cashoutNotes, setCashoutNotes] = useState('');
  const [cashoutBusy, setCashoutBusy] = useState(false);
  const [cashoutFormError, setCashoutFormError] = useState<string | null>(null);

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

  // ── MoMo wallet logic ──
  const fetchMomo = useCallback(async () => {
    setMomoLoading(true);
    setMomoError(null);
    try {
      const res = await api<{ balance: number; entries: MomoEntry[] }>('/api/v1/momo');
      setMomoBalance(res.balance ?? 0);
      setMomoEntries(res.entries ?? []);
    } catch (e) {
      setMomoError(e instanceof Error ? e.message : 'Failed to load the MoMo wallet.');
    } finally {
      setMomoLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    fetchMomo();
  }, [fetchAll, fetchMomo]);

  // ── Cash-out history (admins only; managers never fetch) ──
  const fetchCashouts = useCallback(async () => {
    if (role !== 'admin') return;
    setCashoutLoading(true);
    setCashoutError(null);
    try {
      const res = await api<{ items: Cashout[] }>('/api/v1/cashouts?limit=50');
      setCashouts(res.items ?? []);
    } catch (e) {
      setCashoutError(e instanceof Error ? e.message : 'Failed to load cash-outs.');
    } finally {
      setCashoutLoading(false);
    }
  }, [role]);

  useEffect(() => {
    fetchCashouts();
  }, [fetchCashouts]);

  const openCashoutModal = () => {
    setCashoutAmount('');
    setCashoutAt(localDateTimeValue(new Date()));
    setCashoutNotes('');
    setCashoutFormError(null);
    setCashoutModalOpen(true);
  };

  const submitCashout = async () => {
    const value = parseMoney(cashoutAmount);
    if (Number.isNaN(value) || value <= 0) {
      setCashoutFormError('Enter a valid amount greater than zero.');
      return;
    }
    const dt = new Date(cashoutAt);
    if (Number.isNaN(dt.getTime())) {
      setCashoutFormError('Choose a valid date and time.');
      return;
    }
    setCashoutBusy(true);
    setCashoutFormError(null);
    try {
      const res = await api<{ cashout: Cashout }>('/api/v1/cashouts', {
        method: 'POST',
        body: JSON.stringify({
          amount: value,
          cashedAt: dt.toISOString(),
          notes: cashoutNotes.trim() || undefined,
        }),
      });
      toast.success(`Cash-out recorded: ${res.cashout.referenceNumber}`);
      setCashoutModalOpen(false);
      fetchCashouts();
    } catch (e) {
      setCashoutFormError(e instanceof Error ? e.message : 'Failed to record the cash-out.');
    } finally {
      setCashoutBusy(false);
    }
  };
  const cashoutValue = parseMoney(cashoutAmount);

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

  // ── MoMo action modal ──
  const openMomoModal = (action: MomoActionType) => {
    setMomoAction(action);
    setMomoAmount('');
    setMomoReference('');
    setMomoNotes('');
    setMomoFormError(null);
    setMomoConfirming(false);
  };

  const closeMomoModal = () => {
    setMomoAction(null);
    setMomoConfirming(false);
    setMomoFormError(null);
  };

  const momoValue = parseMoney(momoAmount);
  const momoCfg = momoAction ? MOMO_ACTIONS[momoAction] : null;

  const momoResultingBalance =
    momoBalance == null || Number.isNaN(momoValue)
      ? null
      : momoAction === 'top_up'
        ? momoBalance + momoValue
        : momoAction === 'withdrawal'
          ? momoBalance - momoValue
          : momoValue;

  /** Step 1: validate, then ask for confirmation. */
  const reviewMomo = () => {
    if (Number.isNaN(momoValue) || momoValue <= 0) {
      setMomoFormError('Enter a valid amount greater than zero.');
      return;
    }
    if (momoAction === 'withdrawal' && momoBalance != null && momoValue > momoBalance) {
      setMomoFormError(`Insufficient MoMo balance (${formatMoney(momoBalance)}).`);
      return;
    }
    setMomoFormError(null);
    setMomoConfirming(true);
  };

  /** Step 2 (confirmed): post to the API. */
  const submitMomo = async () => {
    if (!momoAction || Number.isNaN(momoValue) || momoValue <= 0) {
      setMomoConfirming(false);
      return;
    }
    setMomoBusy(true);
    try {
      await api('/api/v1/momo', {
        method: 'POST',
        body: JSON.stringify({
          entryType: momoAction,
          amount: momoValue,
          reference: momoReference.trim() || undefined,
          notes: momoNotes.trim() || undefined,
        }),
      });
      toast.success(`${MOMO_ACTIONS[momoAction].label} recorded.`);
      closeMomoModal();
      fetchMomo();
    } catch (e) {
      setMomoFormError(e instanceof Error ? e.message : 'Failed to record the entry.');
      setMomoConfirming(false);
    } finally {
      setMomoBusy(false);
    }
  };
  const summaryAmount = parseFloat(amount);
  const summaryAccount = accounts.find((a) => a.id === accountId);

  return (
    <div className="mx-auto max-w-5xl pb-24">
      <ChapterHeader
        eyebrow="Chapter One"
        title="Bank deposits"
        action={
          <PrimaryButton onClick={openModal}>
            <Icon name="add" size={20} /> Record deposit
          </PrimaryButton>
        }
      />

      {/* MoMo wallet */}
      {momoLoading ? (
        <div className="mb-6 h-52 animate-pulse rounded-2xl bg-[var(--surface-alt)]" />
      ) : momoError ? (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <p role="alert" className="text-sm font-semibold text-[var(--danger)]">
            {momoError}
          </p>
          <SecondaryButton onClick={fetchMomo}>
            <Icon name="refresh" size={20} /> Retry
          </SecondaryButton>
        </div>
      ) : (
        <>
          <SpineCard tone="wine" className="mb-6">
            <div className="flex items-center gap-3">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[var(--wine)]/10 text-[var(--wine)]">
                <Icon name="smartphone" size={26} />
              </span>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
                  MoMo wallet
                </p>
                <p className="mt-0.5 text-[13px] text-[var(--ink-muted)]">
                  Shop mobile-money float
                </p>
              </div>
            </div>
            <p className="tnum font-display mt-3 text-4xl leading-none text-[var(--ink)] sm:text-5xl">
              {formatMoney(momoBalance)}
            </p>
            <div className="mt-5 grid grid-cols-3 gap-2">
              {(Object.keys(MOMO_ACTIONS) as MomoActionType[]).map((key) =>
                key === 'top_up' ? (
                  <PrimaryButton key={key} onClick={() => openMomoModal(key)} className="px-3">
                    <Icon name={MOMO_ACTIONS[key].icon} size={20} />{' '}
                    <span className="text-[13px] leading-tight">{MOMO_ACTIONS[key].label}</span>
                  </PrimaryButton>
                ) : (
                  <SecondaryButton key={key} onClick={() => openMomoModal(key)} className="px-3">
                    <Icon name={MOMO_ACTIONS[key].icon} size={20} />{' '}
                    <span className="text-[13px] leading-tight">{MOMO_ACTIONS[key].label}</span>
                  </SecondaryButton>
                )
              )}
            </div>
          </SpineCard>

          {/* MoMo entry history */}
          {momoEntries.length > 0 && (
            <div className="mb-8">
              <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
                MoMo entries
              </p>
              <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
                <ul>
                  {momoEntries.slice(0, MOMO_HISTORY_LIMIT).map((e) => {
                    const meta = MOMO_TYPE_META[e.entryType] ?? {
                      label: e.entryType,
                      tone: 'slate' as StampToneName,
                      sign: '=' as const,
                    };
                    return (
                      <li key={e.id} className="ledger-row">
                        <div className="flex min-h-[64px] items-center justify-between gap-3 px-4 py-3 sm:px-5">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <StampBadge tone={meta.tone}>{meta.label}</StampBadge>
                              {e.reference && (
                                <span className="font-mono text-[13px] font-semibold text-[var(--ink)]">
                                  {e.reference}
                                </span>
                              )}
                            </div>
                            <p className="tnum mt-1 truncate text-[13px] text-[var(--ink-muted)]">
                              {formatEntryDate(e.createdAt)}
                              {e.createdByName ? ` · ${e.createdByName}` : ''}
                            </p>
                            {e.notes && (
                              <p className="truncate text-[13px] italic text-[var(--ink-muted)]">
                                {e.notes}
                              </p>
                            )}
                          </div>
                          <div className="shrink-0 text-right">
                            <p
                              className={`tnum font-display text-lg ${
                                meta.sign === '+'
                                  ? 'text-[var(--olive)]'
                                  : meta.sign === '−'
                                    ? 'text-[var(--danger)]'
                                    : 'text-[var(--ink)]'
                              }`}
                            >
                              {meta.sign}&nbsp;{formatMoney(e.amount)}
                            </p>
                            <p className="tnum mt-0.5 text-[12px] text-[var(--ink-muted)]">
                              Bal: {formatMoney(e.balanceAfter)}
                            </p>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          )}
        </>
      )}

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
                    {selected && (
                      <span className="shrink-0">
                        <StampBadge tone="brass">Filtered</StampBadge>
                      </span>
                    )}
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

          {/* Cash-outs — admin only; managers never see this section */}
          {isAdmin && (
            <div className="mt-8">
              <ChapterHeader
                eyebrow="Admin"
                title="Cash-outs"
                action={
                  <PrimaryButton onClick={openCashoutModal}>
                    <Icon name="remove" size={20} /> Record cash-out
                  </PrimaryButton>
                }
              />
              {cashoutLoading ? (
                <div className="h-40 animate-pulse rounded-2xl bg-[var(--surface-alt)]" />
              ) : cashoutError ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
                  <p role="alert" className="text-sm font-semibold text-[var(--danger)]">
                    {cashoutError}
                  </p>
                  <SecondaryButton onClick={fetchCashouts}>
                    <Icon name="refresh" size={20} /> Retry
                  </SecondaryButton>
                </div>
              ) : cashouts.length === 0 ? (
                <EmptyState
                  icon="payments"
                  title="No cash-outs recorded yet"
                  body="Cash taken out of the till — purchases, expenses, floats — will be listed here."
                  action={
                    <PrimaryButton onClick={openCashoutModal}>
                      <Icon name="remove" size={20} /> Record cash-out
                    </PrimaryButton>
                  }
                />
              ) : (
                <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
                  <ul>
                    {cashouts.map((c) => (
                      <li key={c.id} className="ledger-row">
                        <div className="flex min-h-[64px] items-center justify-between gap-3 px-4 py-3 sm:px-5">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <StampBadge tone="wine">Cash-out</StampBadge>
                              <span className="font-mono text-[13px] font-semibold text-[var(--ink)]">
                                {c.referenceNumber}
                              </span>
                            </div>
                            <p className="tnum mt-1 truncate text-[13px] text-[var(--ink-muted)]">
                              {formatCashoutDate(c.cashedAt)}
                              {c.cashedByName ? ` · by ${c.cashedByName}` : ''}
                            </p>
                            {c.notes && (
                              <p className="truncate text-[13px] italic text-[var(--ink-muted)]">
                                {c.notes}
                              </p>
                            )}
                          </div>
                          <p className="tnum font-display shrink-0 text-lg text-[var(--danger)]">
                            −{formatMoney(c.amount)}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
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

      {/* Record cash-out modal (admin only) */}
      <Modal open={cashoutModalOpen} onClose={() => setCashoutModalOpen(false)} title="Record cash-out">
        <div className="flex flex-col gap-4">
          {cashoutFormError && (
            <p role="alert" className="rounded-lg bg-[var(--danger-bg)] px-4 py-3 text-sm font-semibold text-[var(--danger)]">
              {cashoutFormError}
            </p>
          )}
          <p className="text-sm text-[var(--ink-muted)]">
            Cash taken out of the till — expenses, purchases, or change floats.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Amount (GH₵)" htmlFor="co-amount">
              <input
                id="co-amount"
                className={inputClass}
                inputMode="decimal"
                value={cashoutAmount}
                onChange={(e) => setCashoutAmount(e.target.value)}
                placeholder="0.00"
                autoFocus
              />
            </Field>
            <Field label="Date & time" htmlFor="co-at">
              <input
                id="co-at"
                type="datetime-local"
                className={inputClass}
                value={cashoutAt}
                onChange={(e) => setCashoutAt(e.target.value)}
              />
            </Field>
          </div>
          <Field label="Note (optional)" htmlFor="co-notes">
            <input
              id="co-notes"
              className={inputClass}
              value={cashoutNotes}
              onChange={(e) => setCashoutNotes(e.target.value)}
              placeholder="e.g. Change float for Sunday sales"
            />
          </Field>
          {!Number.isNaN(cashoutValue) && cashoutValue > 0 && (
            <div className="flex min-h-[56px] items-center justify-between gap-3 rounded-xl bg-[var(--danger-bg)] px-4 py-3">
              <span className="flex items-center gap-2 text-sm font-bold text-[var(--danger)]">
                <Icon name="payments" size={20} /> Cashing out
              </span>
              <span className="tnum font-display text-right text-lg text-[var(--ink)]">
                −{formatMoney(cashoutValue)}
              </span>
            </div>
          )}
          <div className="mt-1 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <SecondaryButton onClick={() => setCashoutModalOpen(false)} disabled={cashoutBusy}>Cancel</SecondaryButton>
            <PrimaryButton onClick={submitCashout} disabled={cashoutBusy}>
              {cashoutBusy ? 'Saving…' : 'Record cash-out'}
            </PrimaryButton>
          </div>
        </div>
      </Modal>

      {/* MoMo action modal (top up / withdraw / set balance) */}
      <Modal open={momoAction !== null} onClose={closeMomoModal} title={momoCfg ? `MoMo — ${momoCfg.label}` : 'MoMo'}>
        {momoCfg && (
          <div className="flex flex-col gap-4">
            {momoFormError && (
              <p role="alert" className="rounded-lg bg-[var(--danger-bg)] px-4 py-3 text-sm font-semibold text-[var(--danger)]">
                {momoFormError}
              </p>
            )}
            {!momoConfirming ? (
              <>
                <p className="text-sm text-[var(--ink-muted)]">{momoCfg.blurb}</p>
                <Field label="Amount (GH₵)" htmlFor="momo-amount">
                  <input
                    id="momo-amount"
                    className={inputClass}
                    inputMode="decimal"
                    value={momoAmount}
                    onChange={(e) => setMomoAmount(e.target.value)}
                    placeholder="0.00"
                    autoFocus
                  />
                </Field>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Reference (optional)" htmlFor="momo-ref">
                    <input
                      id="momo-ref"
                      className={inputClass}
                      value={momoReference}
                      onChange={(e) => setMomoReference(e.target.value)}
                      placeholder="e.g. MTN txn ref"
                      maxLength={100}
                    />
                  </Field>
                  <Field label="Notes (optional)" htmlFor="momo-notes">
                    <input
                      id="momo-notes"
                      className={inputClass}
                      value={momoNotes}
                      onChange={(e) => setMomoNotes(e.target.value)}
                      placeholder="e.g. Float for Sunday sales"
                    />
                  </Field>
                </div>
                {momoResultingBalance != null && !Number.isNaN(momoValue) && momoValue > 0 && (
                  <div className="flex min-h-[56px] items-center justify-between gap-3 rounded-xl bg-[var(--olive-bg)] px-4 py-3">
                    <span className="flex items-center gap-2 text-sm font-bold text-[var(--olive)]">
                      <Icon name="smartphone" size={20} />
                      {momoAction === 'set_balance' ? 'New balance' : 'Balance after'}
                    </span>
                    <span className="tnum font-display text-right text-lg text-[var(--ink)]">
                      {formatMoney(momoResultingBalance)}
                    </span>
                  </div>
                )}
                <div className="mt-1 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <SecondaryButton onClick={closeMomoModal} disabled={momoBusy}>Cancel</SecondaryButton>
                  <PrimaryButton onClick={reviewMomo} disabled={momoBusy}>
                    Review {momoCfg.label.toLowerCase()}
                  </PrimaryButton>
                </div>
              </>
            ) : (
              <>
                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-alt)] px-4 py-3">
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
                    Confirm {momoCfg.label.toLowerCase()}
                  </p>
                  <p className="tnum font-display mt-2 text-3xl text-[var(--ink)]">
                    {formatMoney(momoValue)}
                  </p>
                  {momoResultingBalance != null && (
                    <p className="tnum mt-1 text-[13px] text-[var(--ink-muted)]">
                      Wallet: {formatMoney(momoBalance)} →{' '}
                      <span className="font-bold text-[var(--ink)]">{formatMoney(momoResultingBalance)}</span>
                    </p>
                  )}
                  {(momoReference.trim() || momoNotes.trim()) && (
                    <p className="mt-2 truncate text-[13px] text-[var(--ink-muted)]">
                      {momoReference.trim()}
                      {momoReference.trim() && momoNotes.trim() ? ' · ' : ''}
                      <span className="italic">{momoNotes.trim()}</span>
                    </p>
                  )}
                </div>
                <div className="mt-1 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <SecondaryButton onClick={() => setMomoConfirming(false)} disabled={momoBusy}>
                    Back
                  </SecondaryButton>
                  <PrimaryButton onClick={submitMomo} disabled={momoBusy}>
                    {momoBusy ? 'Saving…' : `Confirm ${momoCfg.label.toLowerCase()}`}
                  </PrimaryButton>
                </div>
              </>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
