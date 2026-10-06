'use client';

import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import Icon from '@/components/Icon';
import { PageHeader, ChapterHeader, SpineCard, EmptyState, listVariants, riseVariants, inputClass } from '@/components/ui';
import type { Role } from '@/lib/rbac';

/* ── Content model ─────────────────────────────────────────── */

interface Step {
  title: string;
  body: string;
}

interface Topic {
  icon: string;
  title: string;
  tagline: string;
  steps: Step[];
}

const CASHIER_TOPICS: Topic[] = [
  {
    icon: 'point_of_sale',
    title: 'Making your first sale',
    tagline: 'Ring up a customer from start to finish',
    steps: [
      { title: 'Open Sell', body: 'Tap Sell in the bottom menu. You will see the product list.' },
      { title: 'Find the item', body: 'Type in the search box, or tap Browse to look through categories.' },
      { title: 'Add to cart', body: 'Tap an item to add it. Use + and − on the cart line to change the quantity.' },
      { title: 'Charge', body: 'Tap the big Charge button showing the total.' },
      { title: 'Take payment', body: 'Choose Cash, Card, or Mobile Money. For cash, type the amount the customer hands you — the change due is shown automatically.' },
      { title: 'Print the receipt', body: 'Tap Print on the success screen to print the customer’s receipt.' },
      { title: 'Next customer', body: 'Tap New Sale to clear the cart and start over.' },
    ],
  },
  {
    icon: 'payments',
    title: 'Handling cash & Mobile Money',
    tagline: 'Take payment the right way, every time',
    steps: [
      { title: 'Count cash in front of the customer', body: 'Read the amount shown, count the notes, and place them in the till before giving change.' },
      { title: 'Give exact change', body: 'The screen shows the change due automatically — read it out as you hand it over.' },
      { title: 'Mobile Money', body: 'Choose Mobile Money, confirm the customer’s name on their phone prompt, and only tap complete when they confirm the payment.' },
      { title: 'Short till?', body: 'Tell your manager immediately — never “top up” the till from your own pocket or the float silently.' },
    ],
  },
  {
    icon: 'print',
    title: 'Reprinting a receipt',
    tagline: 'The customer lost their receipt? Print it again',
    steps: [
      { title: 'Open Sales', body: 'Tap Sales in the bottom menu.' },
      { title: 'Find the sale', body: 'Scroll, or type the receipt number in the search box.' },
      { title: 'Open it', body: 'Tap the sale to see the full receipt.' },
      { title: 'Print', body: 'Tap Print receipt. In the print dialog, choose your printer.' },
    ],
  },
  {
    icon: 'receipt_long',
    title: 'Checking my sales',
    tagline: 'See everything you have sold',
    steps: [
      { title: 'Open Sales', body: 'Your own sales are listed here, newest first.' },
      { title: 'Filter', body: 'Use the date and payment-method filters to narrow things down.' },
    ],
  },
];

const MANAGER_TOPICS: Topic[] = [
  {
    icon: 'inventory_2',
    title: 'Managing items',
    tagline: 'Add, edit, and fix stock levels',
    steps: [
      { title: 'Open Items', body: 'Tap Items in the bottom menu to see everything in stock.' },
      { title: 'Add a new item', body: 'Tap the + button. Fill in the name, selling price, category, and starting stock, then save.' },
      { title: 'Edit an item', body: 'Tap the item, then edit. You can change the name, price, or category.' },
      { title: 'Fix the stock count', body: 'If stock is wrong (damaged, lost, or found items), open the item and use Adjust stock. Write a short reason — it is recorded for accountability.' },
      { title: 'Low stock', body: 'Items running low are flagged so you know what to reorder.' },
    ],
  },
  {
    icon: 'shopping_bag',
    title: 'Recording purchases',
    tagline: 'New stock arriving from a supplier',
    steps: [
      { title: 'Open Purchases', body: 'Tap Purchases in the bottom menu.' },
      { title: 'New purchase', body: 'Tap + and pick the supplier (or add a new one).' },
      { title: 'Add the items', body: 'Add each item received, with the quantity and what you paid per unit (cost).' },
      { title: 'Receive', body: 'Tap Receive. Stock levels go up immediately and the cost is recorded.' },
    ],
  },
  {
    icon: 'account_balance',
    title: 'Recording bank deposits',
    tagline: 'Bank the day’s cash and keep a paper trail',
    steps: [
      { title: 'Open the dashboard', body: 'Find the Bank deposits card on the dashboard and tap View all.' },
      { title: 'Record deposit', body: 'Tap Record deposit, pick the bank account, enter the amount, the date it was banked, and the reference from the bank slip.' },
      { title: 'Done', body: 'The deposit is saved with its reference number, so the totals always add up.' },
    ],
  },
  {
    icon: 'bar_chart',
    title: 'Reading reports',
    tagline: 'See how the bookshop is doing',
    steps: [
      { title: 'Open Reports', body: 'Tap Reports in the bottom menu.' },
      { title: 'Pick a period', body: 'Choose today, this week, this month, or a custom range.' },
      { title: 'What you see', body: 'Total sales, number of transactions, top-selling items, and sales by payment method.' },
    ],
  },
  {
    icon: 'block',
    title: 'Voiding a wrong sale',
    tagline: 'Undo a mistake — items go back to stock',
    steps: [
      { title: 'Find the sale', body: 'Open Sales, find the receipt, and tap it.' },
      { title: 'Void it', body: 'Tap Void sale and type the reason (e.g. “double charge”).' },
      { title: 'Done', body: 'The sale is marked voided and the items return to stock. This cannot be undone, so double-check first.' },
    ],
  },
];

const ADMIN_TOPICS: Topic[] = [
  {
    icon: 'group',
    title: 'Managing staff accounts',
    tagline: 'Add cashiers and managers, reset passwords',
    steps: [
      { title: 'Open Users', body: 'Tap Users in the bottom menu.' },
      { title: 'Add someone', body: 'Tap + , enter their name and email, and pick a role: Cashier (sell only), Manager (sell + stock + reports), or Admin (everything).' },
      { title: 'Tell them the login', body: 'Share the email and the temporary password with them. They should change it on first sign-in.' },
      { title: 'Reset a password', body: 'Open the user and tap Reset password if someone forgets theirs.' },
      { title: 'Remove access', body: 'Deactivate a user when they leave — they will no longer be able to sign in.' },
    ],
  },
  {
    icon: 'settings',
    title: 'Shop settings',
    tagline: 'Receipt header, shop details, preferences',
    steps: [
      { title: 'Open Settings', body: 'Tap Settings in the bottom menu.' },
      { title: 'Shop name on receipts', body: 'Set the name printed at the top of every receipt.' },
      { title: 'Save', body: 'Changes apply immediately to new sales and reprints.' },
    ],
  },
];

const TIPS: Step[] = [
  { title: 'Printing not working?', body: 'Make sure the printer is on and connected. In the print dialog, pick the right printer and paper size (80mm for receipt printers).' },
  { title: 'Page looks broken?', body: 'Pull down to refresh, or close and reopen the page. Your work is saved.' },
  { title: 'Wrong account?', body: 'Tap your name at the top, then Sign out, and sign in with the correct account.' },
  { title: 'Forgot your password?', body: 'Ask an admin or manager to reset it for you from the Users page.' },
];

/* ── Onboarding checklists (progress saved on this device) ─── */

interface ChecklistItem {
  id: string;
  label: string;
}

const CASHIER_CHECKLIST: ChecklistItem[] = [
  { id: 'signin', label: 'Sign in with your own staff account' },
  { id: 'sell', label: 'Make a practice sale from start to finish' },
  { id: 'momo', label: 'Take a Mobile Money payment' },
  { id: 'print', label: 'Print a receipt' },
  { id: 'reprint', label: 'Reprint a past receipt from Sales' },
  { id: 'void', label: 'Ask a manager to show you how to void a wrong sale' },
  { id: 'help', label: 'Know who to call when you get stuck' },
];

const MANAGER_CHECKLIST: ChecklistItem[] = [
  { id: 'item', label: 'Add a new item with its price and stock' },
  { id: 'purchase', label: 'Record a purchase from a supplier' },
  { id: 'adjust', label: 'Adjust stock for a damaged item (with a reason)' },
  { id: 'deposit', label: 'Record a bank deposit' },
  { id: 'void', label: 'Void a wrong sale (with a reason)' },
  { id: 'reports', label: 'Read today’s report' },
  { id: 'staff', label: 'Add or edit a staff account (admin only)' },
];

function checklistKey(kind: 'cashier' | 'manager'): string {
  return `bookshop_guide_checklist_${kind}`;
}

function loadChecked(kind: 'cashier' | 'manager'): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(checklistKey(kind));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/* ── Component ─────────────────────────────────────────────── */

const TABS: { role: Role; label: string; icon: string }[] = [
  { role: 'cashier', label: 'Cashier', icon: 'point_of_sale' },
  { role: 'manager', label: 'Manager', icon: 'supervisor_account' },
  { role: 'admin', label: 'Admin', icon: 'shield_person' },
];

function topicsFor(role: Role): Topic[] {
  if (role === 'admin') return [...CASHIER_TOPICS, ...MANAGER_TOPICS, ...ADMIN_TOPICS];
  if (role === 'manager') return [...CASHIER_TOPICS, ...MANAGER_TOPICS];
  return CASHIER_TOPICS;
}

const TAB_LABELS: Record<Role, string> = {
  cashier: 'Cashier',
  manager: 'Manager',
  admin: 'Admin',
};

export default function GuideClient({ role }: { role: Role }) {
  const [tab, setTab] = useState<Role>(role);
  const [openTopic, setOpenTopic] = useState<number | null>(0);
  const [query, setQuery] = useState('');

  const [checkedCashier, setCheckedCashier] = useState<string[]>(() => loadChecked('cashier'));
  const [checkedManager, setCheckedManager] = useState<string[]>(() => loadChecked('manager'));

  const checklistKind = tab === 'cashier' ? 'cashier' : 'manager';
  const checklist = checklistKind === 'cashier' ? CASHIER_CHECKLIST : MANAGER_CHECKLIST;
  const checked = checklistKind === 'cashier' ? checkedCashier : checkedManager;
  const setChecked = checklistKind === 'cashier' ? setCheckedCashier : setCheckedManager;

  const toggleCheck = (id: string) => {
    const next = checked.includes(id) ? checked.filter((x) => x !== id) : [...checked, id];
    setChecked(next);
    try {
      localStorage.setItem(checklistKey(checklistKind), JSON.stringify(next));
    } catch {
      /* storage unavailable — progress just won't persist */
    }
  };

  const resetChecklist = () => {
    setChecked([]);
    try {
      localStorage.removeItem(checklistKey(checklistKind));
    } catch {
      /* ignore */
    }
  };

  const doneCount = checklist.filter((i) => checked.includes(i.id)).length;

  /* Search: filter chapters by title, tagline, and steps */
  const q = query.trim().toLowerCase();
  const visible = useMemo(() => {
    const base = topicsFor(tab).map((topic, idx) => ({ topic, chapter: idx + 1 }));
    if (!q) return base.map(({ topic, chapter }) => ({ topic, chapter, steps: topic.steps }));
    const out: { topic: Topic; chapter: number; steps: Step[] }[] = [];
    for (const { topic, chapter } of base) {
      const topicHit = `${topic.title} ${topic.tagline}`.toLowerCase().includes(q);
      const steps = topic.steps.filter(
        (s) => topicHit || `${s.title} ${s.body}`.toLowerCase().includes(q)
      );
      if (steps.length > 0) out.push({ topic, chapter, steps });
    }
    return out;
  }, [tab, q]);

  const switchTab = (r: Role) => {
    setTab(r);
    setOpenTopic(0);
    setQuery('');
  };

  return (
    <motion.div variants={listVariants} initial="hidden" animate="show" className="mx-auto max-w-3xl">
      <PageHeader
        title="Staff Guide"
        subtitle="Step-by-step help for using the bookshop app"
      />

      {/* Search */}
      <motion.div variants={riseVariants} className="mb-5">
        <div className="relative">
          <Icon
            name="search"
            size={22}
            className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-[var(--ink-muted)]"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the guide — try “receipt” or “void”…"
            aria-label="Search the guide"
            className={`${inputClass} pr-11 pl-11`}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="absolute top-1/2 right-2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-[var(--ink-muted)] hover:bg-[var(--surface-alt)]"
            >
              <Icon name="close" size={20} />
            </button>
          )}
        </div>
      </motion.div>

      {/* Onboarding checklist */}
      <SpineCard tone="olive" className="mb-6 p-5">
        <ChapterHeader
          eyebrow="Onboarding checklist"
          title={checklistKind === 'cashier' ? 'Your first week as a cashier' : 'Your first week as a manager'}
        />
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-[var(--ink-muted)] tnum">
            {doneCount} of {checklist.length} done
          </p>
          {doneCount > 0 && (
            <button
              type="button"
              onClick={resetChecklist}
              className="min-h-[44px] px-2 text-sm font-bold text-[var(--ink-muted)] underline underline-offset-2"
            >
              Reset
            </button>
          )}
        </div>
        <div
          className="mb-4 h-2 overflow-hidden rounded-full bg-[var(--surface-alt)]"
          role="progressbar"
          aria-valuenow={doneCount}
          aria-valuemin={0}
          aria-valuemax={checklist.length}
          aria-label="Checklist progress"
        >
          <div
            className="h-full rounded-full bg-[var(--olive)] transition-all"
            style={{ width: `${(doneCount / checklist.length) * 100}%` }}
          />
        </div>
        <ul className="flex flex-col">
          {checklist.map((item) => {
            const done = checked.includes(item.id);
            return (
              <li key={item.id}>
                <label className="flex min-h-[48px] cursor-pointer items-center gap-3 rounded-lg px-1 py-2 active:bg-black/[0.03]">
                  <input
                    type="checkbox"
                    checked={done}
                    onChange={() => toggleCheck(item.id)}
                    className="h-6 w-6 shrink-0 accent-[var(--wine)]"
                  />
                  <span
                    className={`text-[15px] ${done ? 'text-[var(--ink-muted)] line-through' : 'text-[var(--ink)]'}`}
                  >
                    {item.label}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-xs text-[var(--ink-muted)]">Your progress is saved on this device.</p>
      </SpineCard>

      {/* Role tabs */}
      <motion.div variants={riseVariants} className="mb-5 grid grid-cols-3 gap-2">
        {TABS.map((t) => {
          const active = tab === t.role;
          return (
            <button
              key={t.role}
              type="button"
              onClick={() => switchTab(t.role)}
              aria-pressed={active}
              className={`flex min-h-[56px] flex-col items-center justify-center gap-1 rounded-xl border-2 font-bold transition active:scale-95 ${
                active
                  ? 'border-[var(--wine)] bg-[var(--wine)] text-white shadow-[var(--shadow)]'
                  : 'border-[var(--border)] bg-[var(--surface)] text-[var(--ink-muted)]'
              }`}
            >
              <Icon name={t.icon} size={22} />
              <span className="text-[13px]">{t.label}</span>
            </button>
          );
        })}
      </motion.div>

      {tab !== role && (
        <p className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--surface-alt)] px-4 py-3 text-sm text-[var(--ink-muted)]">
          You are signed in as <strong className="capitalize text-[var(--ink)]">{role}</strong>. You are previewing the {tab} guide — some of these pages may not be visible to you.
        </p>
      )}

      {/* Chapters */}
      <ChapterHeader eyebrow="Staff handbook" title={`${TAB_LABELS[tab]} chapters`} />

      {visible.length === 0 ? (
        <EmptyState
          icon="search"
          title="No matches"
          body={`Nothing in the ${TAB_LABELS[tab].toLowerCase()} guide matches “${query.trim()}”. Try a different word.`}
        />
      ) : (
        <div className="space-y-3">
          {visible.map(({ topic, chapter, steps }, i) => {
            const open = q ? true : openTopic === i;
            return (
              <motion.section
                key={`${tab}-${topic.title}`}
                variants={riseVariants}
              >
                <SpineCard tone="wine" className="overflow-hidden p-0">
                  <button
                    type="button"
                    onClick={() => setOpenTopic(open && !q ? null : i)}
                    aria-expanded={open}
                    className="block w-full px-4 pt-4 pb-1 text-left active:bg-black/[0.03]"
                  >
                    <span className="flex items-center gap-3">
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[var(--wine-tint)] text-[var(--wine)]">
                        <Icon name={topic.icon} size={24} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="chapter-eyebrow block">Chapter {chapter}</span>
                        <span className="chapter-title block">
                          <span className="chapter-number">{chapter}.</span>
                          {topic.title}
                        </span>
                        <span className="mt-0.5 block truncate text-[13px] text-[var(--ink-muted)]">
                          {topic.tagline}
                        </span>
                      </span>
                      <Icon
                        name={open ? 'expand_less' : 'expand_more'}
                        size={24}
                        className="shrink-0 text-[var(--ink-muted)]"
                      />
                    </span>
                    <span className="chapter-rule mt-3 block" aria-hidden="true" />
                  </button>
                  {open && (
                    <ol className="px-4 pt-2 pb-4">
                      {steps.map((step, si) => (
                        <li key={si} className="flex gap-3 py-2.5 first:pt-1 last:pb-1">
                          <span className="tnum grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--wine)] text-[13px] font-bold text-white">
                            {si + 1}
                          </span>
                          <div className="min-w-0">
                            <p className="text-[15px] font-bold text-[var(--ink)]">{step.title}</p>
                            <p className="mt-0.5 text-[14px] leading-relaxed text-[var(--ink-muted)]">{step.body}</p>
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                </SpineCard>
              </motion.section>
            );
          })}
        </div>
      )}

      {/* Quick fixes */}
      <SpineCard tone="gold" className="mt-6 p-5">
        <ChapterHeader eyebrow="Troubleshooting" title="Quick fixes" />
        <ul className="space-y-3">
          {TIPS.map((tip, i) => (
            <li key={i} className="flex gap-3">
              <Icon name="check_circle" size={20} className="mt-0.5 shrink-0 text-[var(--success)]" />
              <div>
                <p className="text-[14px] font-bold text-[var(--ink)]">{tip.title}</p>
                <p className="text-[13px] leading-relaxed text-[var(--ink-muted)]">{tip.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </SpineCard>

      <p className="mt-6 pb-8 text-center text-[13px] text-[var(--ink-muted)]">
        Still stuck? Ask your manager or admin for help.
      </p>
    </motion.div>
  );
}
