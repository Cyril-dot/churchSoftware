'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import Icon from '@/components/Icon';

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
};
const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' as const } },
};

const STEPS = ['Setup token', 'Your details', 'Done'] as const;

export default function SetupPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [step, setStep] = useState(0);

  const [token, setToken] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/v1/auth/status')
      .then((r) => r.json())
      .then((body) => {
        if (body?.data?.needsSetup) {
          setAllowed(true);
        } else {
          router.replace('/login');
        }
      })
      .catch(() => router.replace('/login'))
      .finally(() => setChecking(false));
  }, [router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!token.trim()) {
      setError('Please enter the setup token.');
      return;
    }
    if (!name.trim() || !email.trim()) {
      setError('Please enter your name and email.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/v1/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: token.trim(),
          name: name.trim(),
          email: email.trim(),
          password,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error?.message || 'Setup failed. Please try again.');
      setStep(2);
      toast.success('Bookshop set up successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)]">
        <Icon name="progress_activity" size={32} className="animate-spin text-[var(--wine)]" />
        <span className="sr-only">Checking setup status…</span>
      </div>
    );
  }
  if (!allowed) return null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-4 py-10">
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]"
      >
        <div className="relative overflow-hidden bg-[var(--side-bg)] px-6 py-8 sm:px-8">
          <div
            aria-hidden="true"
            className="absolute inset-0 opacity-[0.12]"
            style={{
              backgroundImage: 'radial-gradient(rgba(233,223,201,0.9) 1px, transparent 1px)',
              backgroundSize: '22px 22px',
            }}
          />
          <motion.div variants={item} className="relative">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--gold)] text-[#241A12]">
              <Icon name="menu_book" size={26} />
            </span>
            <h1 className="font-display mt-4 text-2xl text-[var(--side-text)] sm:text-3xl">
              Set up your bookshop
            </h1>
            <p className="mt-1 text-sm text-[var(--side-muted)]">
              Create the first administrator account to get started.
            </p>
          </motion.div>
          {/* stepper */}
          <motion.ol variants={item} className="relative mt-6 flex items-center gap-2" aria-label="Setup progress">
            {STEPS.map((label, i) => (
              <li key={label} className="flex flex-1 items-center gap-2 last:flex-none">
                <span
                  aria-current={step === i ? 'step' : undefined}
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    i < step
                      ? 'bg-[var(--gold)] text-[#241A12]'
                      : i === step
                        ? 'bg-[var(--wine)] text-white'
                        : 'bg-white/15 text-[var(--side-muted)]'
                  }`}
                >
                  {i < step ? <Icon name="check" size={16} /> : i + 1}
                </span>
                <span className={`hidden text-xs font-semibold sm:block ${i <= step ? 'text-[var(--side-text)]' : 'text-[var(--side-muted)]'}`}>
                  {label}
                </span>
                {i < STEPS.length - 1 && <span aria-hidden="true" className="h-px flex-1 bg-white/15" />}
              </li>
            ))}
          </motion.ol>
        </div>

        <div className="px-6 py-6 sm:px-8">
          {step < 2 ? (
            <motion.form variants={item} onSubmit={submit} className="space-y-4">
              <div>
                <label htmlFor="token" className="mb-1.5 block text-sm font-semibold text-[var(--ink)]">
                  Setup token
                </label>
                <input
                  id="token"
                  type="text"
                  autoComplete="off"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Paste the setup token"
                  className="h-12 w-full rounded-[var(--radius-sm)] border border-[var(--border-input)] bg-[var(--surface)] px-3.5 font-mono text-[15px] text-[var(--ink)] placeholder:font-sans placeholder:text-[var(--ink-muted)] focus:border-[var(--focus)] focus:outline-none"
                />
                <p className="mt-1.5 text-xs text-[var(--ink-muted)]">
                  The one-time token shown when the bookshop was first installed.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="name" className="mb-1.5 block text-sm font-semibold text-[var(--ink)]">
                    Full name
                  </label>
                  <input
                    id="name"
                    type="text"
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ama Serwaa"
                    className="h-12 w-full rounded-[var(--radius-sm)] border border-[var(--border-input)] bg-[var(--surface)] px-3.5 text-[15px] text-[var(--ink)] placeholder:text-[var(--ink-muted)] focus:border-[var(--focus)] focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="email" className="mb-1.5 block text-sm font-semibold text-[var(--ink)]">
                    Email address
                  </label>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@church.org"
                    className="h-12 w-full rounded-[var(--radius-sm)] border border-[var(--border-input)] bg-[var(--surface)] px-3.5 text-[15px] text-[var(--ink)] placeholder:text-[var(--ink-muted)] focus:border-[var(--focus)] focus:outline-none"
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="password" className="mb-1.5 block text-sm font-semibold text-[var(--ink)]">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPw ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 8 characters"
                      className="h-12 w-full rounded-[var(--radius-sm)] border border-[var(--border-input)] bg-[var(--surface)] pr-12 pl-3.5 text-[15px] text-[var(--ink)] placeholder:text-[var(--ink-muted)] focus:border-[var(--focus)] focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw((s) => !s)}
                      aria-label={showPw ? 'Hide password' : 'Show password'}
                      className="absolute top-1/2 right-1 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-md text-[var(--ink-muted)] hover:bg-black/5"
                    >
                      <Icon name={showPw ? 'visibility_off' : 'visibility'} size={20} />
                    </button>
                  </div>
                </div>
                <div>
                  <label htmlFor="confirm" className="mb-1.5 block text-sm font-semibold text-[var(--ink)]">
                    Confirm password
                  </label>
                  <input
                    id="confirm"
                    type={showPw ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Repeat password"
                    className="h-12 w-full rounded-[var(--radius-sm)] border border-[var(--border-input)] bg-[var(--surface)] px-3.5 text-[15px] text-[var(--ink)] placeholder:text-[var(--ink-muted)] focus:border-[var(--focus)] focus:outline-none"
                  />
                </div>
              </div>

              {error && (
                <p role="alert" className="flex items-start gap-2 rounded-lg bg-[var(--danger-bg)] px-3 py-2.5 text-sm font-medium text-[var(--danger)]">
                  <Icon name="error" size={18} className="mt-0.5 shrink-0" />
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={busy}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-[var(--wine)] text-[15px] font-semibold text-white transition hover:bg-[var(--wine-hover)] disabled:opacity-60"
              >
                {busy ? (
                  <>
                    <Icon name="progress_activity" size={20} className="animate-spin" />
                    Creating account…
                  </>
                ) : (
                  <>
                    <Icon name="person_add" size={20} />
                    Create admin account
                  </>
                )}
              </button>
              <p className="text-center text-sm text-[var(--ink-muted)]">
                Already set up?{' '}
                <Link href="/login" className="font-semibold text-[var(--wine)] underline underline-offset-2">
                  Sign in
                </Link>
              </p>
            </motion.form>
          ) : (
            <motion.div variants={item} className="py-4 text-center">
              <motion.span
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', damping: 12 }}
                className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[var(--success-bg)] text-[var(--success)]"
              >
                <Icon name="check_circle" size={36} filled />
              </motion.span>
              <h2 className="font-display mt-4 text-2xl text-[var(--ink)]">All set!</h2>
              <p className="mx-auto mt-2 max-w-sm text-[15px] text-[var(--ink-muted)]">
                Your administrator account is ready. Sign in to open the bookshop.
              </p>
              <Link
                href="/login"
                className="mt-6 inline-flex h-12 items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-[var(--wine)] px-8 text-[15px] font-semibold text-white hover:bg-[var(--wine-hover)]"
              >
                <Icon name="login" size={20} />
                Go to sign in
              </Link>
            </motion.div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
