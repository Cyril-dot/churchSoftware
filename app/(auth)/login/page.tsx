'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'motion/react';
import Icon from '@/components/Icon';

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
};
const item = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: 'easeOut' as const } },
};

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[var(--bg)]">
          <Icon name="progress_activity" size={32} className="animate-spin text-[var(--wine)]" />
          <span className="sr-only">Loading sign in…</span>
        </div>
      }
    >
      <LoginInner />
    </Suspense>
  );
}

function LoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') || '/dashboard';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [needsSetup, setNeedsSetup] = useState(false);

  useEffect(() => {
    fetch('/api/v1/auth/status')
      .then((r) => r.json())
      .then((body) => {
        if (body?.data?.needsSetup) setNeedsSetup(true);
      })
      .catch(() => {});
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error?.message || 'Sign in failed. Please try again.');
      router.push(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen bg-[var(--bg)] lg:grid-cols-[1.05fr_1fr]">
      {/* ── Brand panel ── */}
      <div className="relative hidden overflow-hidden bg-[var(--side-bg)] lg:block">
        {/* ambient blobs */}
        <motion.div
          aria-hidden="true"
          className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-[var(--wine)] opacity-60 blur-[110px]"
          animate={{ x: [0, 40, 0], y: [0, 30, 0] }}
          transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          aria-hidden="true"
          className="absolute -right-24 -bottom-24 h-[28rem] w-[28rem] rounded-full bg-[var(--gold)] opacity-25 blur-[130px]"
          animate={{ x: [0, -36, 0], y: [0, -24, 0] }}
          transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
        />
        {/* dot pattern */}
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-[0.13]"
          style={{
            backgroundImage: 'radial-gradient(rgba(233,223,201,0.9) 1px, transparent 1px)',
            backgroundSize: '26px 26px',
          }}
        />
        {/* gold rule frame */}
        <div aria-hidden="true" className="absolute inset-6 rounded-2xl border border-[var(--gold)]/30" />

        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="relative flex h-full flex-col justify-between p-12 xl:p-16"
        >
          <motion.div variants={item} className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--gold)] text-[#241A12]">
              <Icon name="menu_book" size={28} />
            </span>
            <span>
              <span className="font-display block text-xl text-[var(--side-text)]">Church Bookshop</span>
              <span className="block text-[11px] font-semibold tracking-[0.2em] text-[var(--side-muted)] uppercase">
                Point of sale
              </span>
            </span>
          </motion.div>

          <div>
            <motion.p
              variants={item}
              className="mb-4 inline-flex items-center gap-2 rounded-full border border-[var(--gold)]/40 px-3 py-1 text-xs font-semibold tracking-widest text-[var(--side-accent)] uppercase"
            >
              <Icon name="sparkles" size={14} />
              Serve with joy
            </motion.p>
            <motion.h1
              variants={item}
              className="font-display max-w-md text-4xl leading-[1.12] text-[var(--side-text)] xl:text-5xl"
            >
              Every sale, every shelf, <span className="text-[var(--side-accent)]">beautifully kept.</span>
            </motion.h1>
            <motion.ul variants={item} className="mt-8 space-y-4">
              {[
                { icon: 'point_of_sale', text: 'Fast checkout with receipts in seconds' },
                { icon: 'inventory_2', text: 'Live stock levels and low-stock alerts' },
                { icon: 'bar_chart', text: 'Daily revenue and profit at a glance' },
              ].map((f) => (
                <li key={f.text} className="flex items-center gap-3 text-[15px] text-[var(--side-text)]">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-[var(--side-accent)]">
                    <Icon name={f.icon} size={20} />
                  </span>
                  {f.text}
                </li>
              ))}
            </motion.ul>
          </div>

          <motion.p variants={item} className="font-display max-w-sm text-sm leading-relaxed text-[var(--side-muted)] italic">
            “Let all things be done decently and in order.” — 1 Cor 14:40
          </motion.p>
        </motion.div>
      </div>

      {/* ── Form panel ── */}
      <div className="flex items-center justify-center px-4 py-10 sm:px-8">
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="w-full max-w-md"
        >
          <motion.div variants={item} className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--wine)] text-white">
              <Icon name="menu_book" size={24} />
            </span>
            <span className="font-display text-xl text-[var(--ink)]">Church Bookshop</span>
          </motion.div>

          <motion.div variants={item}>
            <h2 className="font-display text-3xl text-[var(--ink)]">Welcome back</h2>
            <p className="mt-1.5 text-[15px] text-[var(--ink-muted)]">
              Sign in to open the till and manage the shop.
            </p>
          </motion.div>

          <motion.form variants={item} onSubmit={submit} className="mt-8 space-y-5" noValidate={false}>
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-semibold text-[var(--ink)]">
                Email address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@church.org"
                className="h-12 w-full rounded-[var(--radius-sm)] border border-[var(--border-input)] bg-[var(--surface)] px-3.5 text-[15px] text-[var(--ink)] placeholder:text-[var(--ink-muted)] focus:border-[var(--focus)] focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm font-semibold text-[var(--ink)]">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPw ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Your password"
                  className="h-12 w-full rounded-[var(--radius-sm)] border border-[var(--border-input)] bg-[var(--surface)] pr-12 pl-3.5 text-[15px] text-[var(--ink)] placeholder:text-[var(--ink-muted)] focus:border-[var(--focus)] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((s) => !s)}
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                  aria-pressed={showPw}
                  className="absolute top-1/2 right-1 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-md text-[var(--ink-muted)] hover:bg-black/5"
                >
                  <Icon name={showPw ? 'visibility_off' : 'visibility'} size={20} />
                </button>
              </div>
            </div>

            {error && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                role="alert"
                className="flex items-start gap-2 rounded-lg bg-[var(--danger-bg)] px-3 py-2.5 text-sm font-medium text-[var(--danger)]"
              >
                <Icon name="error" size={18} className="mt-0.5 shrink-0" />
                {error}
              </motion.p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-[var(--wine)] text-[15px] font-semibold text-white shadow-[0_4px_16px_rgba(107,35,56,0.35)] transition hover:bg-[var(--wine-hover)] disabled:opacity-60"
            >
              {busy ? (
                <>
                  <Icon name="progress_activity" size={20} className="animate-spin" />
                  Signing in…
                </>
              ) : (
                <>
                  <Icon name="login" size={20} />
                  Sign in
                </>
              )}
            </button>
          </motion.form>

          {needsSetup && (
            <motion.p variants={item} className="mt-6 rounded-xl border border-[var(--gold)]/50 bg-[var(--warning-bg)] px-4 py-3 text-sm text-[var(--warning)]">
              First time here?{' '}
              <Link href="/setup" className="font-bold underline underline-offset-2">
                Set up your bookshop
              </Link>{' '}
              to create the first admin account.
            </motion.p>
          )}

          <motion.p variants={item} className="mt-8 text-center text-xs text-[var(--ink-muted)]">
            Protected by role-based access · Sessions expire after 8 hours
          </motion.p>
        </motion.div>
      </div>
    </div>
  );
}
