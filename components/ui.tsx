'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import Icon from './Icon';

/* ═══════════════════════════ Motion presets ═══════════════════════════ */

export const listVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
};

export const riseVariants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' as const } },
};

export const fadeVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.25 } },
};

/* ═══════════════════════════ API helper ═══════════════════════════ */

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(body?.error?.message ?? `Request failed (${res.status})`);
  }
  return body.data as T;
}

export function useDebounce<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

/* ═══════════════════════════ Page header ═══════════════════════════ */

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <motion.div
      variants={riseVariants}
      className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
    >
      <div>
        <h1 className="font-display text-[28px] leading-tight text-[var(--ink)] sm:text-[32px]">
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-[15px] text-[var(--ink-muted)]">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </motion.div>
  );
}

/* ═══════════════════════════ Buttons ═══════════════════════════ */

export function PrimaryButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-[var(--wine)] px-5 text-[15px] font-semibold text-white shadow-[0_2px_10px_rgba(107,35,56,0.35)] transition hover:bg-[var(--wine-hover)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${props.className ?? ''}`}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border-input)] bg-[var(--surface)] px-5 text-[15px] font-semibold text-[var(--ink)] transition hover:bg-[var(--surface-alt)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${props.className ?? ''}`}
    >
      {children}
    </button>
  );
}

export function DangerButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-[var(--danger)] px-5 text-[15px] font-semibold text-white transition hover:brightness-95 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${props.className ?? ''}`}
    >
      {children}
    </button>
  );
}

/* ═══════════════════════════ Badge ═══════════════════════════ */

type Tone = 'wine' | 'gold' | 'green' | 'red' | 'gray' | 'blue';

const TONE_CLASSES: Record<Tone, string> = {
  wine: 'bg-[var(--wine-tint)] text-[var(--wine)]',
  gold: 'bg-[var(--warning-bg)] text-[var(--warning)]',
  green: 'bg-[var(--success-bg)] text-[var(--success)]',
  red: 'bg-[var(--danger-bg)] text-[var(--danger)]',
  gray: 'bg-[var(--surface-alt)] text-[var(--ink-muted)]',
  blue: 'bg-[var(--info-bg)] text-[var(--info)]',
};

export function Badge({ tone = 'gray', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-bold whitespace-nowrap ${TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  );
}

/* ═══════════════════════════ Form field ═══════════════════════════ */

export function Field({
  label,
  children,
  hint,
  error,
  htmlFor,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  error?: string | null;
  htmlFor?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-semibold text-[var(--ink)]">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-[var(--ink-muted)]">{hint}</p>}
      {error && (
        <p role="alert" className="text-xs font-semibold text-[var(--danger)]">
          {error}
        </p>
      )}
    </div>
  );
}

export const inputClass =
  'min-h-[44px] w-full rounded-[var(--radius-sm)] border border-[var(--border-input)] bg-white px-3.5 text-[15px] text-[var(--ink)] placeholder:text-[var(--ink-muted)]/60 focus:border-[var(--focus)] focus:outline-none';

/* ═══════════════════════════ Modal ═══════════════════════════ */

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="dialog"
          aria-modal="true"
          aria-label={title}
        >
          <button
            type="button"
            aria-label="Close dialog"
            onClick={onClose}
            className="absolute inset-0 cursor-default bg-black/45"
          />
          <motion.div
            initial={{ opacity: 0, y: 48, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 32, scale: 0.98 }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            className={`relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-[var(--surface)] shadow-2xl sm:rounded-2xl ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'}`}
          >
            <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
              <h2 className="font-display text-lg text-[var(--ink)]">{title}</h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="flex h-11 w-11 items-center justify-center rounded-full text-[var(--ink-muted)] hover:bg-[var(--surface-alt)]"
              >
                <Icon name="close" size={22} />
              </button>
            </div>
            <div className="overflow-y-auto px-5 py-5">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ═══════════════════════════ Sheet (right drawer) ═══════════════════════════ */

export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-50"
          role="dialog"
          aria-modal="true"
          aria-label={title}
        >
          <motion.button
            type="button"
            aria-label="Close panel"
            onClick={onClose}
            className="absolute inset-0 cursor-default bg-black/45"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="absolute top-0 right-0 flex h-full w-full max-w-md flex-col bg-[var(--surface)] shadow-2xl"
          >
            <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
              <h2 className="font-display text-lg text-[var(--ink)]">{title}</h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="flex h-11 w-11 items-center justify-center rounded-full text-[var(--ink-muted)] hover:bg-[var(--surface-alt)]"
              >
                <Icon name="close" size={22} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

/* ═══════════════════════════ Confirm dialog ═══════════════════════════ */

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel = 'Confirm',
  danger,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  body: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  busy?: boolean;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="text-[15px] text-[var(--ink-muted)]">{body}</div>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <SecondaryButton onClick={onClose} disabled={busy}>
          Cancel
        </SecondaryButton>
        {danger ? (
          <DangerButton onClick={onConfirm} disabled={busy}>
            {busy ? 'Working…' : confirmLabel}
          </DangerButton>
        ) : (
          <PrimaryButton onClick={onConfirm} disabled={busy}>
            {busy ? 'Working…' : confirmLabel}
          </PrimaryButton>
        )}
      </div>
    </Modal>
  );
}

/* ═══════════════════════════ Empty state ═══════════════════════════ */

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: string;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <motion.div
      variants={riseVariants}
      className="paper-texture flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-[var(--border-input)] px-6 py-14 text-center"
    >
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--surface-alt)] text-[var(--ink-muted)]">
        <Icon name={icon} size={30} />
      </span>
      <p className="font-display text-lg text-[var(--ink)]">{title}</p>
      {body && <p className="max-w-sm text-sm text-[var(--ink-muted)]">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </motion.div>
  );
}

/* ═══════════════════════════ Error state ═══════════════════════════ */

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <motion.div
      variants={riseVariants}
      className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-[var(--danger)]/30 bg-[var(--danger-bg)] px-6 py-12 text-center"
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-[var(--danger)]">
        <Icon name="error" size={28} />
      </span>
      <p className="font-semibold text-[var(--danger)]">{message}</p>
      <SecondaryButton onClick={onRetry}>
        <Icon name="refresh" size={20} /> Try again
      </SecondaryButton>
    </motion.div>
  );
}

/* ═══════════════════════════ Skeletons ═══════════════════════════ */

export function SkeletonRows({ rows = 6 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className={`flex items-center gap-4 px-5 py-4 ${i > 0 ? 'border-t border-[var(--border)]' : ''}`}
        >
          <div className="h-10 w-10 animate-pulse rounded-lg bg-[var(--surface-alt)]" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-2/3 animate-pulse rounded bg-[var(--surface-alt)]" />
            <div className="h-3 w-1/3 animate-pulse rounded bg-[var(--surface-alt)]" />
          </div>
          <div className="h-4 w-16 animate-pulse rounded bg-[var(--surface-alt)]" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonCards({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <div className="h-11 w-11 animate-pulse rounded-xl bg-[var(--surface-alt)]" />
          <div className="mt-4 h-8 w-2/3 animate-pulse rounded bg-[var(--surface-alt)]" />
          <div className="mt-2 h-4 w-1/2 animate-pulse rounded bg-[var(--surface-alt)]" />
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════ Stat card ═══════════════════════════ */

export function StatCard({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: string;
  label: string;
  value: ReactNode;
  sub?: string;
  tone: 'wine' | 'gold' | 'green' | 'red';
}) {
  const tones = {
    wine: 'bg-[var(--wine-tint)] text-[var(--wine)]',
    gold: 'bg-[var(--warning-bg)] text-[var(--warning)]',
    green: 'bg-[var(--success-bg)] text-[var(--success)]',
    red: 'bg-[var(--danger-bg)] text-[var(--danger)]',
  } as const;
  return (
    <motion.div
      variants={riseVariants}
      className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow)]"
    >
      <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${tones[tone]}`}>
        <Icon name={icon} size={24} />
      </span>
      <p className="font-display mt-4 text-[28px] leading-none text-[var(--ink)]">{value}</p>
      <p className="mt-1.5 text-sm font-semibold text-[var(--ink-muted)]">{label}</p>
      {sub && <p className="mt-0.5 text-xs text-[var(--ink-muted)]">{sub}</p>}
    </motion.div>
  );
}

/* ═══════════════════════════ Parchment & Ink components ═══════════════════════════ */

/**
 * ChapterHeader — small-caps eyebrow + Fraunces heading + hairline rule.
 * Use for page sections ("Chapter One — Today's trade").
 */
export function ChapterHeader({
  eyebrow,
  title,
  number,
  action,
}: {
  eyebrow: string;
  title: string;
  number?: number | string;
  action?: ReactNode;
}) {
  return (
    <motion.div variants={riseVariants} className="mb-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="chapter-eyebrow">{eyebrow}</p>
          <h2 className="chapter-title">
            {number != null && <span className="chapter-number">{number}.</span>}
            {title}
          </h2>
        </div>
        {action}
      </div>
      <div className="chapter-rule" aria-hidden="true" />
    </motion.div>
  );
}

/* Stamp-like status badges — RECEIVED, BANKED, LOW, OUT, PENDING… */
type StampTone = 'wine' | 'gold' | 'olive' | 'slate' | 'danger' | 'brass';

const STAMP_CLASSES: Record<StampTone, string> = {
  wine: 'stamp stamp-wine',
  gold: 'stamp stamp-gold',
  olive: 'stamp stamp-olive',
  slate: 'stamp stamp-slate',
  danger: 'stamp stamp-danger',
  brass: 'stamp stamp-brass',
};

export function StampBadge({ tone = 'slate', children }: { tone?: StampTone; children: ReactNode }) {
  return <span className={STAMP_CLASSES[tone]}>{children}</span>;
}

/**
 * SpineCard — card with a 3px book-spine accent rule on the left.
 * tone picks the spine color: wine | gold | olive | slate | brass | terracotta
 */
export function SpineCard({
  tone = 'wine',
  children,
  className = '',
}: {
  tone?: 'wine' | 'gold' | 'olive' | 'slate' | 'brass' | 'terracotta';
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div variants={riseVariants} className={`spine-card spine-${tone} p-5 ${className}`}>
      {children}
    </motion.div>
  );
}

/**
 * KpiCard — dashboard KPI with accent spine, tabular numerals,
 * and an optional delta vs a previous period.
 */
export function KpiCard({
  icon,
  label,
  value,
  delta,
  deltaUp,
  tone = 'wine',
}: {
  icon: string;
  label: string;
  value: ReactNode;
  delta?: string;
  deltaUp?: boolean | null;
  tone?: 'wine' | 'gold' | 'olive' | 'slate';
}) {
  const toneIcon =
    tone === 'wine'
      ? 'bg-[var(--wine-tint)] text-[var(--wine)]'
      : tone === 'gold'
        ? 'bg-[var(--warning-bg)] text-[var(--warning)]'
        : tone === 'olive'
          ? 'bg-[var(--olive-bg)] text-[var(--olive)]'
          : 'bg-[var(--surface-alt)] text-[var(--ink-muted)]';
  return (
    <motion.div variants={riseVariants} className={`spine-card spine-${tone} p-4 sm:p-5`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${toneIcon}`}>
          <Icon name={icon} size={22} />
        </span>
        {delta && deltaUp != null && (
          <span
            className={`tnum inline-flex items-center gap-1 text-[12px] font-bold ${
              deltaUp ? 'text-[var(--olive)]' : 'text-[var(--danger)]'
            }`}
          >
            <Icon name={deltaUp ? 'trending_up' : 'trending_down'} size={16} />
            {delta}
          </span>
        )}
      </div>
      <p className="tnum font-display mt-3 text-[26px] leading-none text-[var(--ink)] sm:text-[30px]">
        {value}
      </p>
      <p className="mt-1.5 text-[13px] font-semibold text-[var(--ink-muted)]">{label}</p>
    </motion.div>
  );
}

/**
 * AttentionPanel — "Needs attention" list with icon, label, count,
 * and a cross-link to the fixing page (Planning Center lesson).
 */
export function AttentionPanel({
  items,
}: {
  items: { icon: string; label: string; detail?: string; href: string; tone?: StampTone }[];
}) {
  if (items.length === 0) {
    return (
      <div className="paper-texture flex flex-col items-center gap-2 rounded-2xl border border-[var(--border)] px-6 py-10 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--olive-bg)] text-[var(--olive)]">
          <Icon name="check_circle" size={28} />
        </span>
        <p className="font-display text-lg text-[var(--ink)]">All clear</p>
        <p className="text-sm text-[var(--ink-muted)]">Nothing needs your attention right now.</p>
      </div>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {items.map((it) => (
        <li key={it.label}>
          <a
            href={it.href}
            className="group flex min-h-[56px] items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 transition hover:border-[var(--wine)]/50 hover:shadow-[var(--shadow)] active:scale-[0.99]"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--warning-bg)] text-[var(--warning)]">
              <Icon name={it.icon} size={22} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-bold text-[var(--ink)]">{it.label}</span>
              {it.detail && (
                <span className="block truncate text-[13px] text-[var(--ink-muted)]">{it.detail}</span>
              )}
            </span>
            <Icon
              name="arrow_forward"
              size={20}
              className="shrink-0 text-[var(--ink-muted)] transition group-hover:translate-x-0.5 group-hover:text-[var(--wine)]"
            />
          </a>
        </li>
      ))}
    </ul>
  );
}

/* ═══════════════════════════ Pagination / load-more ═══════════════════════════ */

export function LoadMore({
  onLoad,
  loading,
  label = 'Load more',
}: {
  onLoad: () => void;
  loading: boolean;
  label?: string;
}) {
  return (
    <div className="mt-4 flex justify-center">
      <SecondaryButton onClick={onLoad} disabled={loading}>
        {loading ? (
          <>Loading…</>
        ) : (
          <>
            <Icon name="expand_more" size={20} /> {label}
          </>
        )}
      </SecondaryButton>
    </div>
  );
}
