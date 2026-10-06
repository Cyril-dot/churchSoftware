'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import { navForRole, type NavItem } from '@/lib/rbac';
import type { SessionUser } from '@/lib/auth';
import Icon from './Icon';
import CommandPalette from './CommandPalette';
import ChangePasswordDialog from './ChangePasswordDialog';

const ROLE_STYLES: Record<string, string> = {
  admin: 'bg-[var(--wine-tint)] text-[var(--wine)]',
  manager: 'bg-[var(--info-bg)] text-[var(--info)]',
  cashier: 'bg-[var(--success-bg)] text-[var(--success)]',
};

/* Sidebar section eyebrows (presentation-only grouping; nav order comes from rbac.ts) */
const NAV_SECTIONS: { eyebrow: string; hrefs: string[] }[] = [
  { eyebrow: 'Trade', hrefs: ['/sell', '/sales'] },
  {
    eyebrow: 'Manage',
    hrefs: ['/inventory', '/purchases', '/deposits', '/reports', '/users', '/settings', '/guide'],
  },
];

/* Mobile bottom-tab priority order (filtered by what the role can see) */
const PRIMARY_TAB_ORDER = ['/sell', '/dashboard', '/inventory', '/deposits'];

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + '/');
}

function formatCrumb(seg: string): string {
  const clean = decodeURIComponent(seg);
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clean) ||
    /^\d+$/.test(clean)
  ) {
    return 'Details';
  }
  return clean.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/* ── Sidebar / rail nav link ─────────────────────────────────── */
function SidebarNavLink({
  item,
  active,
  collapsed,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
}) {
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      title={collapsed ? item.label : undefined}
      className={`relative flex h-11 items-center gap-3 rounded-lg text-[15px] font-medium transition-colors duration-150 ${
        collapsed ? 'justify-center px-0' : 'px-3'
      } ${
        active
          ? 'bg-[var(--wine)] text-white shadow-[0_2px_10px_rgba(107,35,56,0.45)]'
          : 'text-[var(--side-muted)] hover:bg-white/[0.06] hover:text-[var(--side-text)]'
      }`}
    >
      {active && (
        <span
          aria-hidden="true"
          className="absolute inset-y-[7px] left-0 w-[3px] rounded-full bg-[var(--gold)]"
        />
      )}
      <Icon name={item.icon} size={22} filled={active} />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  );
}

/* ── User menu (avatar dropdown / sidebar popover) ───────────── */
function UserMenu({
  user,
  onChangePassword,
  onSignOut,
  variant,
}: {
  user: SessionUser;
  onChangePassword: () => void;
  onSignOut: () => void;
  variant: 'topbar' | 'sidebar';
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open ]);

  const roleStyle = ROLE_STYLES[user.role] ?? ROLE_STYLES.cashier;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${user.name}`}
        className={
          variant === 'topbar'
            ? 'flex h-11 min-w-[44px] items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] pr-1.5 pl-1.5 hover:border-[var(--border-input)]'
            : 'flex h-12 w-full items-center gap-3 rounded-lg px-2 text-left hover:bg-white/[0.06]'
        }
      >
        <span
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--wine)] text-[13px] font-bold text-white"
        >
          {initials(user.name)}
        </span>
        {variant === 'topbar' ? (
          <>
            <span className="hidden text-left leading-tight xl:block">
              <span className="block max-w-[140px] truncate text-sm font-semibold text-[var(--ink)]">
                {user.name}
              </span>
              <span className="block text-xs text-[var(--ink-muted)] capitalize">{user.role}</span>
            </span>
            <Icon name="expand_more" size={20} className="hidden text-[var(--ink-muted)] sm:block" />
          </>
        ) : (
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-sm font-semibold text-[var(--side-text)]">
              {user.name}
            </span>
            <span className="block text-xs text-[var(--side-muted)] capitalize">{user.role}</span>
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <>
            <button
              type="button"
              aria-hidden="true"
              tabIndex={-1}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-40 cursor-default bg-transparent"
            />
            <motion.div
              role="menu"
              aria-label="Account"
              initial={{ opacity: 0, y: variant === 'topbar' ? -6 : 6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: variant === 'topbar' ? -6 : 6, scale: 0.98 }}
              transition={{ duration: 0.16, ease: 'easeOut' }}
              className={`absolute z-50 w-64 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-xl ${
                variant === 'topbar' ? 'top-full right-0 mt-2' : 'bottom-full left-0 mb-2'
              }`}
            >
              <div className="border-b border-[var(--border)] px-4 py-3">
                <p className="truncate text-sm font-bold text-[var(--ink)]">{user.name}</p>
                <p className="truncate text-xs text-[var(--ink-muted)]">{user.email}</p>
                <span
                  className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[11px] font-bold tracking-wide uppercase ${roleStyle}`}
                >
                  {user.role}
                </span>
              </div>
              <div className="p-1.5">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    onChangePassword();
                  }}
                  className="flex min-h-[44px] w-full items-center gap-3 rounded-lg px-3 text-[15px] font-medium text-[var(--ink)] hover:bg-black/5"
                >
                  <Icon name="lock_reset" size={20} className="text-[var(--ink-muted)]" />
                  Change password
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    onSignOut();
                  }}
                  className="flex min-h-[44px] w-full items-center gap-3 rounded-lg px-3 text-[15px] font-medium text-[var(--danger)] hover:bg-[var(--danger-bg)]"
                >
                  <Icon name="logout" size={20} />
                  Sign out
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Stock-alert bell ──────────────────────────────────────────
   Gold dot lights up when at least one active product is at or
   below its reorder level. Silent on fetch failure (no dot). */
function StockBell({ lowStockHref }: { lowStockHref: string }) {
  const [attention, setAttention] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/v1/products?lowStock=true&limit=1')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d && Array.isArray(d.items)) {
          setAttention(d.items.length > 0);
        }
      })
      .catch(() => {
        /* no dot */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Link
      href={lowStockHref}
      title="Stock alerts"
      aria-label={
        attention ? 'Stock alerts: some items are running low' : 'Stock alerts: stock levels look fine'
      }
      className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--ink-muted)] transition-colors hover:border-[var(--border-input)] hover:text-[var(--ink)]"
    >
      <Icon name="notifications" size={20} />
      {attention && (
        <span
          aria-hidden="true"
          className="absolute top-2 right-2.5 h-2.5 w-2.5 rounded-full bg-[var(--gold)] ring-2 ring-[var(--surface)]"
        />
      )}
    </Link>
  );
}

/* ── Connection indicator ────────────────────────────────────── */
function ConnectionPill() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    setOnline(typeof navigator !== 'undefined' ? navigator.onLine : true);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  return (
    <span
      role="status"
      aria-label={online ? 'Online' : 'Offline'}
      title={online ? 'Connected' : 'No connection — changes will not sync'}
      className={`hidden items-center gap-2 rounded-full border px-3 py-1.5 sm:flex ${
        online ? 'border-[var(--border)] bg-[var(--surface)]' : 'border-[var(--warning)] bg-[var(--warning-bg)]'
      }`}
    >
      <span className="relative flex h-2 w-2">
        {online && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--success)] opacity-60" />
        )}
        <span
          className={`relative inline-flex h-2 w-2 rounded-full ${
            online ? 'bg-[var(--success)]' : 'bg-[var(--warning)]'
          }`}
        />
      </span>
      <span className="text-xs font-semibold text-[var(--ink-muted)]">
        {online ? 'Online' : 'Offline'}
      </span>
    </span>
  );
}

/* ── App shell ─────────────────────────────────────────────────── */
export default function AppShell({
  user,
  children,
}: {
  user: SessionUser;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const nav = useMemo(() => navForRole(user.role), [user.role]);
  const [collapsed, setCollapsed] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const title = useMemo(() => {
    const found = nav.find((n) => isActive(pathname, n.href));
    if (found) return found.label;
    const seg = pathname.split('/').filter(Boolean).pop();
    return seg
      ? seg.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
      : 'Church Bookshop';
  }, [pathname, nav]);

  /* Sidebar sections: Home ungrouped on top, then Trade / Manage eyebrows. */
  const sections = useMemo(() => {
    const byHref = new Map(nav.map((n) => [n.href, n]));
    const used = new Set<string>();
    const out: { eyebrow: string | null; items: NavItem[] }[] = [];
    const home = byHref.get('/dashboard');
    if (home) {
      out.push({ eyebrow: null, items: [home] });
      used.add(home.href);
    }
    for (const s of NAV_SECTIONS) {
      const items: NavItem[] = [];
      for (const href of s.hrefs) {
        const item = byHref.get(href);
        if (item) {
          items.push(item);
          used.add(href);
        }
      }
      if (items.length > 0) out.push({ eyebrow: s.eyebrow, items });
    }
    const rest = nav.filter((n) => !used.has(n.href));
    if (rest.length > 0) out.push({ eyebrow: null, items: rest });
    return out;
  }, [nav]);

  /* Mobile bottom tabs: Sell · Home · Items · Deposits (+ More sheet). */
  const primaryTabs = useMemo(
    () =>
      PRIMARY_TAB_ORDER.map((href) => nav.find((n) => n.href === href)).filter(
        (n): n is NavItem => Boolean(n),
      ),
    [nav],
  );
  const moreTabs = useMemo(
    () => nav.filter((n) => !primaryTabs.includes(n)),
    [nav, primaryTabs],
  );

  const settingsItem = useMemo(() => nav.find((n) => n.href === '/settings'), [nav]);
  const guideItem = useMemo(() => nav.find((n) => n.href === '/guide'), [nav]);
  const canViewInventory = useMemo(() => nav.some((n) => n.href === '/inventory'), [nav]);
  const lowStockHref = canViewInventory ? '/inventory?filter=low' : '/dashboard';

  /* Breadcrumbs for drill-down pages (Home / Section / Detail). */
  const crumbs = useMemo(() => {
    const activeNav = nav.find((n) => isActive(pathname, n.href));
    if (activeNav && pathname === activeNav.href) return null;
    const items: { label: string; href: string | null }[] = [
      { label: 'Home', href: '/dashboard' },
    ];
    if (activeNav) {
      if (activeNav.href !== '/dashboard') {
        items.push({ label: activeNav.label, href: activeNav.href });
      }
      const rest = pathname.slice(activeNav.href.length).split('/').filter(Boolean);
      for (const seg of rest) items.push({ label: formatCrumb(seg), href: null });
      return items;
    }
    const segs = pathname.split('/').filter(Boolean);
    if (segs.length < 2) return null;
    for (const seg of segs.slice(1)) items.push({ label: formatCrumb(seg), href: null });
    return items;
  }, [pathname, nav]);

  const signOut = useCallback(async () => {
    try {
      await fetch('/api/v1/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
    } finally {
      router.push('/login');
      router.refresh();
    }
  }, [router]);

  // ⌘K / Ctrl+K toggles the command palette.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Close the mobile "More" sheet on navigation or Escape.
  useEffect(() => setMoreOpen(false), [pathname]);
  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMoreOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [moreOpen]);

  const collapseButton = (iconOnly: boolean) => (
    <button
      type="button"
      onClick={() => setCollapsed((c) => !c)}
      aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      aria-pressed={collapsed}
      title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      className={
        iconOnly
          ? 'flex h-11 w-11 items-center justify-center rounded-lg text-[var(--side-muted)] hover:bg-white/[0.06] hover:text-[var(--side-text)]'
          : 'flex h-11 min-w-[44px] flex-1 items-center justify-center gap-2 rounded-lg text-[var(--side-muted)] hover:bg-white/[0.06] hover:text-[var(--side-text)]'
      }
    >
      <Icon name={collapsed ? 'chevron_right' : 'chevron_left'} size={22} />
      {!iconOnly && !collapsed && <span className="text-sm font-medium">Collapse</span>}
    </button>
  );

  const shortcutLink = (item: NavItem) => (
    <Link
      key={item.href}
      href={item.href}
      aria-label={item.label}
      title={item.label}
      aria-current={isActive(pathname, item.href) ? 'page' : undefined}
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition-colors duration-150 ${
        isActive(pathname, item.href)
          ? 'bg-[var(--wine)] text-white'
          : 'text-[var(--side-muted)] hover:bg-white/[0.06] hover:text-[var(--side-text)]'
      }`}
    >
      <Icon name={item.icon} size={22} filled={isActive(pathname, item.href)} />
    </Link>
  );

  return (
    <div className="flex min-h-screen bg-[var(--bg)] text-[var(--ink)]">
      <a
        href="#main-content"
        className="sr-only z-[100] rounded-lg bg-[var(--wine)] px-4 py-2 font-semibold text-white focus:not-sr-only focus:fixed focus:top-4 focus:left-4"
      >
        Skip to content
      </a>

      {/* ── Desktop sidebar (≥1024px), collapsible ── */}
      <motion.aside
        initial={false}
        animate={{ width: collapsed ? 80 : 264 }}
        transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
        className="relative sticky top-0 z-40 hidden h-screen shrink-0 flex-col overflow-hidden bg-[var(--side-bg)] lg:flex"
        aria-label="Sidebar"
      >
        {/* warm top glow over the deep coffee base */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-[radial-gradient(120%_100%_at_50%_0%,rgba(217,177,90,0.16),transparent_70%)]"
        />

        <div className={`relative flex h-16 shrink-0 items-center gap-3 ${collapsed ? 'justify-center px-2' : 'px-4'}`}>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--gold)] text-[#241A12]">
            <Icon name="menu_book" size={24} />
          </span>
          {!collapsed && (
            <span className="min-w-0">
              <span className="font-display block truncate text-[18px] leading-tight text-[var(--side-text)]">
                Church Bookshop
              </span>
              <span className="block text-[10px] font-semibold tracking-[0.18em] text-[var(--side-muted)] uppercase">
                Point of sale
              </span>
            </span>
          )}
        </div>

        <nav aria-label="Primary" className="relative flex-1 overflow-y-auto px-3 py-2">
          {sections.map((section, si) => (
            <div key={section.eyebrow ?? `top-${si}`} className={si > 0 ? 'mt-1' : ''}>
              {section.eyebrow &&
                (collapsed ? (
                  <div aria-hidden="true" className="mx-2 my-2 h-px bg-white/10" />
                ) : (
                  <p
                    aria-hidden="true"
                    className="px-3 pt-3 pb-1.5 text-[10px] font-bold tracking-[0.22em] text-[var(--side-muted)] uppercase"
                  >
                    {section.eyebrow}
                  </p>
                ))}
              <div className="space-y-1">
                {section.items.map((item) => (
                  <SidebarNavLink
                    key={item.href}
                    item={item}
                    active={isActive(pathname, item.href)}
                    collapsed={collapsed}
                  />
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="relative shrink-0 space-y-2 border-t border-white/10 p-3">
          {collapsed ? (
            <div className="flex flex-col items-center gap-1">
              {collapseButton(true)}
              {settingsItem && shortcutLink(settingsItem)}
              {guideItem && shortcutLink(guideItem)}
              <div className="flex w-full justify-center" title={user.name}>
                <UserMenu user={user} onChangePassword={() => setPwOpen(true)} onSignOut={signOut} variant="sidebar" />
              </div>
            </div>
          ) : (
            <>
              <UserMenu user={user} onChangePassword={() => setPwOpen(true)} onSignOut={signOut} variant="sidebar" />
              <div className="flex items-center gap-1">
                {collapseButton(false)}
                {settingsItem && shortcutLink(settingsItem)}
                {guideItem && shortcutLink(guideItem)}
              </div>
            </>
          )}
        </div>
      </motion.aside>

      {/* ── Tablet icon rail (640–1023px) ── */}
      <aside
        className="sticky top-0 z-40 hidden h-screen w-[72px] shrink-0 flex-col items-center bg-[var(--side-bg)] py-4 md:flex lg:hidden"
        aria-label="Icon navigation"
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--gold)] text-[#241A12]">
          <Icon name="menu_book" size={24} />
        </span>
        <nav aria-label="Primary" className="mt-4 flex w-full flex-1 flex-col items-center gap-1 overflow-y-auto px-2">
          {nav.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                aria-label={item.label}
                title={item.label}
                className={`relative flex h-12 w-12 items-center justify-center rounded-xl transition-colors duration-150 ${
                  active
                    ? 'bg-[var(--wine)] text-white shadow-[0_2px_10px_rgba(107,35,56,0.45)]'
                    : 'text-[var(--side-muted)] hover:bg-white/[0.06] hover:text-[var(--side-text)]'
                }`}
              >
                {active && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-y-2 -left-2 w-[3px] rounded-full bg-[var(--gold)]"
                  />
                )}
                <Icon name={item.icon} size={24} filled={active} />
              </Link>
            );
          })}
        </nav>
        <div className="mt-2 flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={() => setPwOpen(true)}
            aria-label="Change password"
            title="Change password"
            className="flex h-12 w-12 items-center justify-center rounded-xl text-[var(--side-muted)] hover:bg-white/[0.06] hover:text-[var(--side-text)]"
          >
            <Icon name="lock_reset" size={22} />
          </button>
          <button
            type="button"
            onClick={signOut}
            aria-label="Sign out"
            title="Sign out"
            className="flex h-12 w-12 items-center justify-center rounded-xl text-[var(--side-muted)] hover:bg-white/[0.06] hover:text-[var(--side-text)]"
          >
            <Icon name="logout" size={22} />
          </button>
        </div>
      </aside>

      {/* ── Main column ── */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--bg)]/90 backdrop-blur">
          <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-2 px-4 sm:gap-3 sm:px-6 lg:px-8">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--wine)] text-white lg:hidden">
              <Icon name="menu_book" size={22} />
            </span>
            <h1 className="font-display min-w-0 truncate text-xl text-[var(--ink)] sm:text-[22px]">
              {title}
            </h1>
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              aria-label="Open command palette (Control K)"
              className="flex h-11 min-w-[44px] items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 text-[var(--ink-muted)] hover:border-[var(--border-input)] hover:text-[var(--ink)]"
            >
              <Icon name="search" size={20} />
              <span className="hidden text-sm md:inline">Search…</span>
              <kbd className="hidden items-center rounded-md border border-[var(--border)] bg-[var(--surface-alt)] px-1.5 py-0.5 text-[11px] font-bold text-[var(--ink-muted)] md:inline-flex">
                ⌘K
              </kbd>
            </button>
            <StockBell lowStockHref={lowStockHref} />
            <ConnectionPill />
            <div className="hidden md:block">
              <UserMenu user={user} onChangePassword={() => setPwOpen(true)} onSignOut={signOut} variant="topbar" />
            </div>
            <button
              type="button"
              onClick={signOut}
              aria-label="Sign out"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--ink-muted)] hover:text-[var(--danger)] md:hidden"
            >
              <Icon name="logout" size={20} />
            </button>
          </div>
        </header>

        {/* Page content with transitions */}
        <AnimatePresence mode="wait" initial={false}>
          <motion.main
            key={pathname}
            id="main-content"
            tabIndex={-1}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="mx-auto w-full max-w-7xl flex-1 px-4 pt-6 pb-32 sm:px-6 md:pb-12 lg:px-8"
          >
            {crumbs && crumbs.length > 1 && (
              <nav aria-label="Breadcrumb" className="mb-5">
                <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px]">
                  {crumbs.map((c, i) => {
                    const last = i === crumbs.length - 1;
                    return (
                      <li key={`${c.label}-${i}`} className="flex min-w-0 items-center gap-1.5">
                        {i > 0 && (
                          <Icon name="chevron_right" size={15} className="shrink-0 text-[var(--ink-muted)]" />
                        )}
                        {c.href && !last ? (
                          <Link
                            href={c.href}
                            className="truncate text-[var(--ink-muted)] hover:text-[var(--wine)] hover:underline"
                          >
                            {c.label}
                          </Link>
                        ) : (
                          <span
                            aria-current={last ? 'page' : undefined}
                            className={`truncate ${last ? 'font-semibold text-[var(--ink)]' : 'text-[var(--ink-muted)]'}`}
                          >
                            {c.label}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ol>
              </nav>
            )}
            {children}
          </motion.main>
        </AnimatePresence>
      </div>

      {/* ── Mobile bottom tab bar (<640px… actually <md) ── */}
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border)] bg-[var(--surface)] md:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="grid" style={{ gridTemplateColumns: `repeat(${primaryTabs.length + (moreTabs.length ? 1 : 0)}, minmax(0,1fr))` }}>
          {primaryTabs.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className="relative flex min-h-[60px] flex-col items-center justify-center gap-1 px-1"
              >
                <Icon
                  name={item.icon}
                  size={24}
                  filled={active}
                  className={active ? 'text-[var(--wine)]' : 'text-[var(--ink-muted)]'}
                />
                <span className={`text-[11px] leading-none font-semibold ${active ? 'text-[var(--wine)]' : 'text-[var(--ink-muted)]'}`}>
                  {item.label}
                </span>
                {active ? (
                  <motion.span
                    layoutId="mobile-tab-dot"
                    aria-hidden="true"
                    className="h-1.5 w-1.5 rounded-full bg-[var(--gold)]"
                    transition={{ duration: 0.22, ease: 'easeOut' }}
                  />
                ) : (
                  <span aria-hidden="true" className="h-1.5 w-1.5" />
                )}
              </Link>
            );
          })}
          {moreTabs.length > 0 && (
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
              className="flex min-h-[60px] flex-col items-center justify-center gap-1 px-1"
            >
              <Icon name="more_horiz" size={24} className="text-[var(--ink-muted)]" />
              <span className="text-[11px] leading-none font-semibold text-[var(--ink-muted)]">More</span>
              <span aria-hidden="true" className="h-1.5 w-1.5" />
            </button>
          )}
        </div>
      </nav>

      {/* ── Mobile "More" bottom sheet ── */}
      <AnimatePresence>
        {moreOpen && (
          <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="More options">
            <motion.button
              type="button"
              aria-label="Close menu"
              className="absolute inset-0 bg-black/45"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMoreOpen(false)}
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="absolute inset-x-0 bottom-0 max-h-[82vh] overflow-y-auto rounded-t-3xl bg-[var(--surface)] px-4 pt-2"
              style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}
            >
              <div aria-hidden="true" className="mx-auto mt-1 mb-3 h-1 w-10 rounded-full bg-[var(--border)]" />
              <div className="mb-3 flex items-center gap-3 rounded-xl bg-[var(--surface-alt)] p-3">
                <span
                  aria-hidden="true"
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--wine)] text-sm font-bold text-white"
                >
                  {initials(user.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-bold text-[var(--ink)]">{user.name}</p>
                  <p className="truncate text-xs text-[var(--ink-muted)] capitalize">{user.role}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setMoreOpen(false)}
                  aria-label="Close menu"
                  className="flex h-11 w-11 items-center justify-center rounded-full text-[var(--ink-muted)] hover:bg-black/5"
                >
                  <Icon name="close" size={22} />
                </button>
              </div>
              <nav aria-label="More pages" className="space-y-1">
                {moreTabs.map((item) => {
                  const active = isActive(pathname, item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      className={`flex min-h-[52px] items-center gap-3 rounded-xl px-3 text-[16px] font-medium ${
                        active ? 'bg-[var(--wine-tint)] text-[var(--wine)]' : 'text-[var(--ink)] hover:bg-black/5'
                      }`}
                    >
                      <Icon name={item.icon} size={24} className={active ? '' : 'text-[var(--ink-muted)]'} />
                      {item.label}
                      {active && (
                        <span className="ml-auto h-2 w-2 rounded-full bg-[var(--gold)]" aria-hidden="true" />
                      )}
                    </Link>
                  );
                })}
              </nav>
              <div className="mt-3 space-y-1 border-t border-[var(--border)] pt-3">
                <button
                  type="button"
                  onClick={() => {
                    setMoreOpen(false);
                    setPwOpen(true);
                  }}
                  className="flex min-h-[52px] w-full items-center gap-3 rounded-xl px-3 text-[16px] font-medium text-[var(--ink)] hover:bg-black/5"
                >
                  <Icon name="lock_reset" size={24} className="text-[var(--ink-muted)]" />
                  Change password
                </button>
                <button
                  type="button"
                  onClick={signOut}
                  className="flex min-h-[52px] w-full items-center gap-3 rounded-xl px-3 text-[16px] font-medium text-[var(--danger)] hover:bg-[var(--danger-bg)]"
                >
                  <Icon name="logout" size={24} />
                  Sign out
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} nav={nav} onSignOut={signOut} />
      <ChangePasswordDialog open={pwOpen} onClose={() => setPwOpen(false)} />
    </div>
  );
}
