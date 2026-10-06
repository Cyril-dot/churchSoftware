'use client';

import { useState } from 'react';
import { motion } from 'motion/react';
import Icon from '@/components/Icon';
import { PageHeader, listVariants, riseVariants } from '@/components/ui';
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
    title: 'Making a sale',
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

export default function GuideClient({ role }: { role: Role }) {
  const [tab, setTab] = useState<Role>(role);
  const [openTopic, setOpenTopic] = useState<number | null>(0);
  const topics = topicsFor(tab);

  return (
    <motion.div variants={listVariants} initial="hidden" animate="show" className="mx-auto max-w-3xl">
      <PageHeader
        title="Staff Guide"
        subtitle="Step-by-step help for using the bookshop app"
      />

      {/* Role tabs */}
      <motion.div variants={riseVariants} className="mb-5 grid grid-cols-3 gap-2">
        {TABS.map((t) => {
          const active = tab === t.role;
          return (
            <button
              key={t.role}
              type="button"
              onClick={() => { setTab(t.role); setOpenTopic(0); }}
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

      {/* Topics */}
      <div className="space-y-3">
        {topics.map((topic, i) => {
          const open = openTopic === i;
          return (
            <motion.section
              key={`${tab}-${topic.title}`}
              variants={riseVariants}
              className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]"
            >
              <button
                type="button"
                onClick={() => setOpenTopic(open ? null : i)}
                aria-expanded={open}
                className="flex w-full items-center gap-3 px-4 py-4 text-left active:bg-black/[0.03]"
              >
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[var(--wine-tint)] text-[var(--wine)]">
                  <Icon name={topic.icon} size={24} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-[17px] font-bold text-[var(--ink)]">{topic.title}</span>
                  <span className="block truncate text-[13px] text-[var(--ink-muted)]">{topic.tagline}</span>
                </span>
                <Icon
                  name={open ? 'expand_less' : 'expand_more'}
                  size={24}
                  className="shrink-0 text-[var(--ink-muted)]"
                />
              </button>
              {open && (
                <ol className="border-t border-[var(--border)] px-4 py-4">
                  {topic.steps.map((step, si) => (
                    <li key={si} className="flex gap-3 py-2.5 first:pt-1 last:pb-1">
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--wine)] text-[13px] font-bold text-white tnum">
                        {si + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="font-bold text-[15px] text-[var(--ink)]">{step.title}</p>
                        <p className="mt-0.5 text-[14px] leading-relaxed text-[var(--ink-muted)]">{step.body}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </motion.section>
          );
        })}
      </div>

      {/* Tips */}
      <motion.section variants={riseVariants} className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--surface-alt)] p-4">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold text-[var(--ink)]">
          <Icon name="tips_and_updates" size={22} className="text-[var(--gold)]" />
          Quick fixes
        </h2>
        <ul className="mt-3 space-y-3">
          {TIPS.map((tip, i) => (
            <li key={i} className="flex gap-3">
              <Icon name="check_circle" size={20} className="mt-0.5 shrink-0 text-[var(--success)]" />
              <div>
                <p className="font-bold text-[14px] text-[var(--ink)]">{tip.title}</p>
                <p className="text-[13px] leading-relaxed text-[var(--ink-muted)]">{tip.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </motion.section>

      <p className="mt-6 pb-8 text-center text-[13px] text-[var(--ink-muted)]">
        Still stuck? Ask your manager or admin for help.
      </p>
    </motion.div>
  );
}
