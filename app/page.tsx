'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/Icon';

const INK = '#2B2350';

const ROLES = [
  {
    role: 'Admin', email: 'admin@church.org', icon: 'shield_person',
    desc: 'Users, settings, reports — the whole shop in your hands.',
    bg: '#FF6B8A',
  },
  {
    role: 'Manager', email: 'manager@church.org', icon: 'supervisor_account',
    desc: 'Inventory, purchases and sales. The daily engine room.',
    bg: '#FFB020',
  },
  {
    role: 'Cashier', email: 'cashier@church.org', icon: 'point_of_sale',
    desc: 'The counter view — speedy POS and your own sales.',
    bg: '#45A8FF',
  },
];

const FEATURES = [
  { icon: 'point_of_sale', title: 'Bouncy POS', desc: 'Fly-to-cart magic, change calculator, 4 payment ways, printable receipts.', bg: '#FF6B8A' },
  { icon: 'inventory_2', title: 'Happy inventory', desc: 'Low-stock nudges, full audit trail, CSV in and out.', bg: '#8B7CFF' },
  { icon: 'bar_chart', title: 'Honest reports', desc: 'Real revenue and profit from cost-at-sale, daily charts, cash-up.', bg: '#2FD597' },
  { icon: 'security', title: 'Vault-grade auth', desc: 'httpOnly sessions, instant lockout, rate-limited login, roles.', bg: '#FFB020' },
  { icon: 'cloud_done', title: 'Truly serverless', desc: 'Vercel + Neon Postgres. Atomic sales in a single DB call.', bg: '#45A8FF' },
  { icon: 'phone_android', title: 'Pocket friendly', desc: 'Sidebar to icon rail to bottom nav. Made for the stall tablet.', bg: '#FF6B8A' },
];

const BUBBLES = [
  { size: 120, x: '6%', y: '12%', c: '#FFD9E3', d: '7s', delay: '0s' },
  { size: 70, x: '88%', y: '8%', c: '#D9F2FF', d: '9s', delay: '1s' },
  { size: 90, x: '82%', y: '62%', c: '#FFF0C9', d: '8s', delay: '0.5s' },
  { size: 56, x: '12%', y: '68%', c: '#DFF9EF', d: '6s', delay: '1.4s' },
  { size: 44, x: '48%', y: '4%', c: '#E6E1FF', d: '10s', delay: '0.8s' },
];

const STRIP = ['Point of Sale', 'Inventory', 'Reports', 'Purchases', 'Receipts', 'Serverless'];

export default function LandingPage() {
  const router = useRouter();
  const [loggingIn, setLoggingIn] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function demoLogin(email: string) {
    setLoggingIn(email);
    setError('');
    try {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'password123' }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error?.message || 'Login failed');
      }
      router.push('/dashboard');
    } catch (e: any) {
      setError(e.message);
      setLoggingIn(null);
    }
  }

  return (
    <div
      className="min-h-screen overflow-x-clip"
      style={{ background: '#FFF8EF', color: INK, fontFamily: 'var(--font-bubbly-sans)' }}>
      {/* ── Floating bubbles (pure CSS) ── */}
      <div className="fixed inset-0 pointer-events-none" aria-hidden>
        {BUBBLES.map((b, i) => (
          <div
            key={i}
            className="absolute rounded-full bubbly-float"
            style={{
              width: b.size, height: b.size, left: b.x, top: b.y,
              background: b.c, animationDuration: b.d, animationDelay: b.delay,
            }}
          />
        ))}
      </div>

      {/* ── Nav ── */}
      <nav className="relative max-w-6xl mx-auto px-5 py-5 flex items-center justify-between bubbly-rise">
        <div className="flex items-center gap-3">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center text-white"
            style={{ background: '#FF6B8A', boxShadow: '0 6px 0 #d14a68' }}>
            <Icon name="church" size={28} filled />
          </div>
          <div style={{ fontFamily: 'var(--font-bubbly-display)' }}>
            <div className="text-xl leading-none font-semibold">Holy Hill Chapel</div>
            <div className="text-xs font-bold opacity-60 tracking-wide">BOOKSHOP</div>
          </div>
        </div>
        <button
          onClick={() => router.push('/login')}
          className="bubbly-card px-6 py-3 rounded-full font-extrabold text-sm min-h-[48px]"
          style={{ background: INK, color: '#FFF8EF', boxShadow: '0 5px 0 rgba(43,35,80,.25)' }}>
          Sign in
        </button>
      </nav>

      {/* ── Hero ── */}
      <header className="relative max-w-6xl mx-auto px-5 pt-10 pb-14 text-center">
        <div className="bubbly-rise" style={{ animationDelay: '0.05s' }}>
          <span
            className="inline-flex items-center gap-2 px-5 py-2 rounded-full text-xs font-extrabold tracking-widest uppercase"
            style={{ background: '#fff', border: `3px solid ${INK}`, boxShadow: `0 4px 0 ${INK}` }}>
            <Icon name="cloud_done" size={16} filled /> Pure serverless · Vercel + Neon
          </span>
        </div>

        <h1
          className="bubbly-rise mt-7 leading-[1.02] font-semibold"
          style={{ fontFamily: 'var(--font-bubbly-display)', fontSize: 'clamp(2.6rem, 7vw, 4.6rem)', animationDelay: '0.12s' }}>
          The bookshop,
          <br />
          <span style={{ color: '#FF6B8A' }}>but make it fun.</span>
        </h1>

        <p
          className="bubbly-rise mt-5 max-w-xl mx-auto text-lg font-semibold opacity-70"
          style={{ animationDelay: '0.2s' }}>
          A full rebuild with a bouncy POS, cheerful reports and serious security.
          Jump in with one tap — no database, no setup.
        </p>

        {/* ── Bubbly role buttons ── */}
        <div className="mt-10 grid sm:grid-cols-3 gap-5 max-w-4xl mx-auto text-left">
          {ROLES.map((r, i) => (
            <button
              key={r.email}
              onClick={() => demoLogin(r.email)}
              disabled={loggingIn !== null}
              className="bubbly-rise bubbly-card p-6 text-left min-h-[48px] bg-white disabled:opacity-70"
              style={{
                borderRadius: 28,
                border: `3px solid ${INK}`,
                boxShadow: `0 8px 0 ${INK}`,
                animationDelay: `${0.28 + i * 0.1}s`,
              }}>
              <div
                className="bubbly-bob w-16 h-16 rounded-full flex items-center justify-center text-white mb-4"
                style={{ background: r.bg, border: `3px solid ${INK}`, animationDelay: `${i * 0.5}s` }}>
                {loggingIn === r.email
                  ? <span className="animate-spin"><Icon name="progress_activity" size={30} filled /></span>
                  : <Icon name={r.icon} size={30} filled />}
              </div>
              <div
                className="text-xl font-semibold"
                style={{ fontFamily: 'var(--font-bubbly-display)' }}>
                Try as {r.role}
              </div>
              <div className="text-sm font-semibold opacity-60 mt-1">{r.desc}</div>
              <div
                className="inline-flex items-center gap-1 mt-3 px-4 py-2 rounded-full text-xs font-extrabold text-white"
                style={{ background: r.bg }}>
                <Icon name="play_arrow" size={14} filled /> Jump in
              </div>
            </button>
          ))}
        </div>

        {error && (
          <p className="mt-5 font-extrabold" style={{ color: '#E5484D' }}>{error}</p>
        )}
        <p className="bubbly-rise mt-5 text-xs font-bold opacity-50" style={{ animationDelay: '0.6s' }}>
          Demo mode — sample data, nothing is saved. Add Neon for the real thing.
        </p>
      </header>

      {/* ── Marquee strip (pure CSS) ── */}
      <div
        className="relative py-4 overflow-hidden my-4"
        style={{ background: INK, transform: 'rotate(-1deg)' }}>
        <div className="bubbly-marquee-track flex gap-8 whitespace-nowrap w-max">
          {[...STRIP, ...STRIP, ...STRIP, ...STRIP].map((s, i) => (
            <span
              key={i}
              className="flex items-center gap-8 text-sm font-extrabold tracking-widest uppercase"
              style={{ color: '#FFF8EF', fontFamily: 'var(--font-bubbly-display)' }}>
              {s} <Icon name="star" size={16} filled />
            </span>
          ))}
        </div>
      </div>

      {/* ── Features ── */}
      <section className="relative max-w-6xl mx-auto px-5 py-16">
        <h2
          className="bubbly-rise text-center text-3xl sm:text-4xl font-semibold mb-10"
          style={{ fontFamily: 'var(--font-bubbly-display)' }}>
          Everything bubbles <span style={{ color: '#8B7CFF' }}>beautifully</span>
        </h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map((f, i) => (
            <div
              key={f.title}
              className="bubbly-rise bubbly-card p-6 bg-white"
              style={{
                borderRadius: 24, border: `3px solid ${INK}`, boxShadow: `0 6px 0 ${INK}`,
                animationDelay: `${(i % 3) * 0.08}s`,
              }}>
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center text-white mb-4"
                style={{ background: f.bg, border: `3px solid ${INK}` }}>
                <Icon name={f.icon} size={28} filled />
              </div>
              <h3
                className="text-lg font-semibold"
                style={{ fontFamily: 'var(--font-bubbly-display)' }}>
                {f.title}
              </h3>
              <p className="text-sm font-semibold opacity-60 mt-1">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="relative max-w-4xl mx-auto px-5 pb-20">
        <div
          className="bubbly-rise p-10 sm:p-14 text-center text-white"
          style={{ background: '#8B7CFF', borderRadius: 36, border: `3px solid ${INK}`, boxShadow: `0 10px 0 ${INK}` }}>
          <div
            className="bubbly-bob w-20 h-20 mx-auto rounded-full bg-white flex items-center justify-center mb-5"
            style={{ border: `3px solid ${INK}` }}>
            <Icon name="celebration" size={38} filled style={{ color: '#8B7CFF' }} />
          </div>
          <h2
            className="text-3xl sm:text-4xl font-semibold"
            style={{ fontFamily: 'var(--font-bubbly-display)' }}>
            Ready to play shop?
          </h2>
          <p className="mt-3 font-semibold opacity-80 max-w-md mx-auto">
            Pick a role above and bounce through the POS, inventory and reports with sample data.
          </p>
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="bubbly-card mt-7 px-8 py-4 rounded-full font-extrabold min-h-[52px] inline-flex items-center gap-2"
            style={{ background: '#fff', color: INK, border: `3px solid ${INK}`, boxShadow: `0 6px 0 ${INK}` }}>
            <Icon name="arrow_upward" size={20} filled /> Pick your role
          </button>
        </div>
      </section>

      <footer
        className="text-center py-8 text-sm font-bold opacity-60"
        style={{ borderTop: `3px solid ${INK}` }}>
        Holy Hill Chapel Bookshop · Bubbly demo on Vercel + Neon
      </footer>
    </div>
  );
}
