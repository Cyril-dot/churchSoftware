'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion, animate } from 'motion/react';
import { Toaster, toast } from 'sonner';
import Icon from '@/components/Icon';
import ReceiptLogo from '@/components/ReceiptLogo';
import { StampBadge } from '@/components/ui';
import { formatMoney, parseMoney } from '@/lib/money';
import { servedByLine } from '@/lib/cashier';

/* ═══════════════════════ Types ═══════════════════════ */

interface ApiProduct {
  id: string;
  name: string;
  authorOrBrand?: string | null;
  sellingPrice: number;
  priceBishop: number | null;
  priceSonsOfProphet: number | null;
  pricePastorDeji: number | null;
  quantityOnHand: number;
  quantityShop: number;
  sku?: string | null;
  barcode?: string | null;
  coverPhotoUrl?: string | null;
  productType?: string | null;
}

type PriceTier = 'standard' | 'bishop' | 'sons_of_prophet' | 'pastor_deji';

interface CartLine {
  productId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  stock: number;
  priceTier: PriceTier;
}

/* Price lists — Standard is the default; named tiers fall back to sellingPrice when unset. */

/* Tier labels for receipt line stamps. */
const POS_TIER_LABELS: Record<string, string> = {
  bishop: 'Bishop',
  sons_of_prophet: 'Sons of Prophet',
  pastor_deji: 'Pastor Deji',
};
const PRICE_TIERS: { value: PriceTier; label: string; stamp: string }[] = [
  { value: 'standard', label: 'Standard', stamp: 'STD' },
  { value: 'bishop', label: 'Bishop', stamp: 'BISHOP' },
  { value: 'sons_of_prophet', label: 'Sons of Prophet', stamp: 'SONS OF PROPHET' },
  { value: 'pastor_deji', label: 'Pastor Deji', stamp: 'PASTOR DEJI' },
];

const TIER_STAMP: Record<PriceTier, string> = Object.fromEntries(
  PRICE_TIERS.map((t) => [t.value, t.stamp])
) as Record<PriceTier, string>;

function isPriceTier(v: unknown): v is PriceTier {
  return PRICE_TIERS.some((t) => t.value === v);
}

/** Composite identity of a cart line: same product under a different tier is a separate line. */
function lineKey(productId: string, tier: PriceTier): string {
  return `${productId}|${tier}`;
}

/** Price for a product under the given tier — silently falls back to sellingPrice when unset/blank. */
function priceForTier(p: ApiProduct, tier: PriceTier): number {
  const t =
    tier === 'bishop' ? p.priceBishop
    : tier === 'sons_of_prophet' ? p.priceSonsOfProphet
    : tier === 'pastor_deji' ? p.pricePastorDeji
    : null;
  return t ?? p.sellingPrice;
}

/** Blank/empty/non-finite/negative tier values count as "not set". */
function numOrNull(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

interface ReceiptItem {
  name: string;
  quantity: number;
  unit_price: number;
  price_tier?: string;
}

interface SaleReceipt {
  id: string;
  receipt_number: string;
  sold_at: string;
  cashier_name: string;
  items: ReceiptItem[];
  subtotal: number;
  discount: number;
  total: number;
  amount_tendered: number | null;
  payment_method: string;
  payment_reference: string | null;
}

/* Normalize the checkout response into the snake_case SaleReceipt shape.
   Demo mode returns { receipt } (snake_case); the real API returns
   getReceipt's { sale, items, settings } (camelCase). */
function normalizeReceipt(raw: unknown): SaleReceipt | null {
  const r = raw as Record<string, any> | null;
  if (!r) return null;
  if (r.receipt) return r.receipt as SaleReceipt;
  if (r.sale) {
    const s = r.sale as Record<string, any>;
    return {
      id: s.id,
      receipt_number: s.receiptNumber,
      sold_at: s.soldAt,
      cashier_name: s.soldByName ?? '',
      items: ((r.items as any[]) ?? []).map((i) => ({
        name: i.productName,
        quantity: i.quantity,
        unit_price: i.unitPrice,
        price_tier: i.priceTier ?? 'standard',
      })),
      subtotal: s.subtotal ?? 0,
      discount: s.discount ?? 0,
      total: s.total ?? 0,
      amount_tendered: s.amountTendered ?? null,
      payment_method: s.paymentMethod ?? '',
      payment_reference: s.paymentReference ?? null,
    };
  }
  return r as SaleReceipt;
}

type PaymentMethod = 'cash' | 'card' | 'mobile_money' | 'bank_transfer';
type DiscountMode = 'amount' | 'percent';

const PAYMENT_METHODS: { value: PaymentMethod; label: string; icon: string }[] = [
  { value: 'cash', label: 'Cash', icon: 'payments' },
  { value: 'card', label: 'Card', icon: 'credit_card' },
  { value: 'mobile_money', label: 'MoMo', icon: 'smartphone' },
  { value: 'bank_transfer', label: 'Bank', icon: 'account_balance' },
];

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: 'Cash',
  card: 'Card',
  mobile_money: 'Mobile Money',
  bank_transfer: 'Bank Transfer',
};

const CART_KEY = 'bookshop.pos.cart.v1';
const LOW_STOCK_AT = 5;
const QUICK_CASH = [10, 20, 50, 100];

/* Category tiles — colors inspired by the shop's Odoo layout */
const CATEGORY_TILES: { value: string; label: string; bg: string; icon: string }[] = [
  { value: 'bishop_books', label: 'Bishop Books', bg: 'bg-blue-200 text-blue-900', icon: 'menu_book' },
  { value: 'other_authors', label: 'Other Authors', bg: 'bg-violet-200 text-violet-900', icon: 'auto_stories' },
  { value: 'bibles', label: 'Bibles', bg: 'bg-amber-200 text-amber-900', icon: 'book' },
  { value: 'children_books', label: 'Children Books', bg: 'bg-emerald-200 text-emerald-900', icon: 'child_care' },
  { value: 'children_bible', label: 'Children Bible', bg: 'bg-lime-200 text-lime-900', icon: 'family_restroom' },
  { value: 'stationery', label: 'Stationery', bg: 'bg-teal-200 text-teal-900', icon: 'edit_note' },
  { value: 'gift', label: 'Gifts', bg: 'bg-rose-200 text-rose-900', icon: 'card_giftcard' },
  { value: 'apparel', label: 'Apparel', bg: 'bg-orange-200 text-orange-900', icon: 'checkroom' },
  { value: 'media', label: 'Media', bg: 'bg-cyan-200 text-cyan-900', icon: 'album' },
  { value: 'other_items', label: 'Other Items', bg: 'bg-sky-200 text-sky-900', icon: 'category' },
];

/* ═══════════════════════ Helpers ═══════════════════════ */

function loadCart(): CartLine[] {
  try {
    const raw = localStorage.getItem(CART_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    /* Normalize legacy carts (no priceTier) and merge any duplicate lines. */
    const byKey = new Map<string, CartLine>();
    for (const item of parsed) {
      const tier: PriceTier = isPriceTier(item.priceTier) ? item.priceTier : 'standard';
      const line: CartLine = {
        productId: String(item.productId ?? ''),
        name: String(item.name ?? 'Item'),
        unitPrice: Number(item.unitPrice ?? 0),
        quantity: Number(item.quantity ?? 1),
        stock: Number(item.stock ?? 0),
        priceTier: tier,
      };
      const key = lineKey(line.productId, tier);
      const existing = byKey.get(key);
      if (existing) {
        existing.quantity += line.quantity;
        continue;
      }
      byKey.set(key, line);
    }
    return [...byKey.values()];
  } catch {
    return [];
  }
}

async function apiGetProducts(search: string, signal: AbortSignal): Promise<ApiProduct[]> {
  const params = new URLSearchParams({ limit: '60' });
  if (search.trim()) params.set('search', search.trim());
  const res = await fetch(`/api/v1/products?${params}`, { signal });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message ?? `Search failed (${res.status})`);
  }
  const body = await res.json();
  const items = body?.data?.items ?? [];
  /* Normalize: real API returns camelCase, demo returns snake_case */
  return items.map((p: Record<string, unknown>) => ({
    id: String(p.id),
    name: String(p.name),
    authorOrBrand: (p.authorOrBrand ?? p.author_or_brand ?? null) as string | null,
    sellingPrice: Number(p.sellingPrice ?? p.selling_price ?? 0),
    /* Tier prices come back camelCase from the API, snake_case in demo mode. */
    priceBishop: numOrNull(p.priceBishop ?? p.price_bishop),
    priceSonsOfProphet: numOrNull(p.priceSonsOfProphet ?? p.price_sons_of_prophet),
    pricePastorDeji: numOrNull(p.pricePastorDeji ?? p.price_pastor_deji),
    quantityOnHand: Number(p.quantityOnHand ?? p.quantity_on_hand ?? 0),
    quantityShop: Number(p.quantityShop ?? p.quantity_shop ?? p.quantityOnHand ?? p.quantity_on_hand ?? 0),
    sku: (p.sku ?? null) as string | null,
    barcode: (p.barcode ?? null) as string | null,
    coverPhotoUrl: (p.coverPhotoUrl ?? p.cover_photo_url ?? null) as string | null,
    productType: (p.productType ?? p.product_type ?? null) as string | null,
  }));
}

/* ═══════════════════════ Small components ═══════════════════════ */

function Stepper({ value, onChange, max }: { value: number; onChange: (v: number) => void; max: number }) {
  const btn = 'w-7 h-7 rounded-full grid place-items-center transition active:scale-90 disabled:opacity-25';
  return (
    <div className="flex items-center gap-0.5 rounded-full bg-ink/[0.05] border border-border p-0.5">
      <button
        type="button"
        aria-label="Decrease quantity"
        onClick={() => onChange(Math.max(1, value - 1))}
        disabled={value <= 1}
        className={`${btn} text-ink hover:bg-white`}
      >
        <Icon name="remove" size={15} />
      </button>
      <span className="tnum min-w-6 text-center text-[14px] font-black" aria-live="polite">{value}</span>
      <button
        type="button"
        aria-label="Increase quantity"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        className={`${btn} bg-wine text-white shadow-sm hover:bg-wine-hover`}
      >
        <Icon name="add" size={15} />
      </button>
    </div>
  );
}

/** Animated money value — counts toward the target unless reduced motion is on. */
function AnimatedMoney({ value, className }: { value: number; className?: string }) {
  const reduceMotion = useReducedMotion();
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);

  useEffect(() => {
    if (reduceMotion) return; // display derived directly below
    const from = prevRef.current;
    prevRef.current = value;
    if (from === value) return;
    const controls = animate(from, value, {
      duration: 0.35,
      ease: 'easeOut',
      onUpdate: (v) => setDisplay(v),
    });
    return () => controls.stop();
  }, [value, reduceMotion]);

  const shown = reduceMotion ? value : display;
  return <span className={`tnum ${className ?? ''}`}>{formatMoney(shown)}</span>;
}

/* ═══════════════════════ POS page ═══════════════════════ */

/* ── Generated book covers ───────────────────────────────────────
   Products without a photo get a designed typographic jacket —
   themed by product type, like a real book on the shelf. */
interface CoverTheme { bg: string; ink: string; accent: string; sub: string; }
const COVER_THEMES: Record<string, CoverTheme> = {
  bibles:         { bg: 'linear-gradient(150deg,#7A2A44 0%,#3D1424 70%)', ink: '#F7ECD4', accent: '#E3C878', sub: '#D9B15A' },
  childrenbible:  { bg: 'linear-gradient(150deg,#8A3B2E 0%,#4A1E14 70%)', ink: '#FBEFD8', accent: '#F2C879', sub: '#E8A85C' },
  bishop:         { bg: 'linear-gradient(150deg,#5A3A1E 0%,#2A1A08 70%)', ink: '#F7ECD4', accent: '#F0C878', sub: '#D9A85C' },
  books:          { bg: 'linear-gradient(150deg,#6B4A1F 0%,#33200A 70%)', ink: '#FBF0D8', accent: '#F2C879', sub: '#D9A85C' },
  children:       { bg: 'linear-gradient(150deg,#B25A2A 0%,#5E2C12 70%)', ink: '#FFF3DF', accent: '#FFD98A', sub: '#F0B25E' },
  stationery:     { bg: 'linear-gradient(150deg,#2F6B4F 0%,#14301F 70%)', ink: '#EAF7E4', accent: '#C8E8A8', sub: '#9FD08F' },
  gift:           { bg: 'linear-gradient(150deg,#6B3A63 0%,#331A38 70%)', ink: '#F5E4F5', accent: '#E0AEE0', sub: '#C08FC0' },
  apparel:        { bg: 'linear-gradient(150deg,#3D3D4A 0%,#1B1B22 70%)', ink: '#ECECF2', accent: '#B8B8D9', sub: '#8F8FB8' },
  media:          { bg: 'linear-gradient(150deg,#2E3E63 0%,#161D38 70%)', ink: '#E6ECFA', accent: '#A8BEE8', sub: '#7F97C9' },
  other:          { bg: 'linear-gradient(150deg,#5E5E33 0%,#2B2B14 70%)', ink: '#F2F2DC', accent: '#E0E08A', sub: '#BFBF5C' },
};
function coverThemeFor(productType: string | null | undefined): CoverTheme {
  const t = (productType || '').toLowerCase();
  if (t.includes('children') && t.includes('bible')) return COVER_THEMES.childrenbible;
  if (t.includes('bible')) return COVER_THEMES.bibles;
  if (t.includes('bishop')) return COVER_THEMES.bishop;
  if (t.includes('children')) return COVER_THEMES.children;
  if (t.includes('stationery')) return COVER_THEMES.stationery;
  if (t.includes('gift')) return COVER_THEMES.gift;
  if (t.includes('apparel')) return COVER_THEMES.apparel;
  if (t.includes('media')) return COVER_THEMES.media;
  if (t.includes('book') || t.includes('author')) return COVER_THEMES.books;
  return COVER_THEMES.other;
}

function BookCover({ product, compact }: { product: ApiProduct; compact?: boolean }) {
  if (product.coverPhotoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={product.coverPhotoUrl} alt="" className="absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-[1.04]" loading="lazy" />;
  }
  const theme = coverThemeFor(product.productType);
  return (
    <div
      className="absolute inset-0 flex flex-col overflow-hidden p-3 transition duration-300 group-hover:scale-[1.04]"
      style={{ background: theme.bg }}
      aria-hidden="true"
    >
      {/* spine */}
      <div className="absolute inset-y-0 left-0 w-[10px] bg-gradient-to-r from-black/50 via-black/15 to-transparent" />
      <div className="absolute inset-y-0 left-[10px] w-px bg-white/20" />
      {/* paper grain */}
      <div className="paper-texture absolute inset-0 opacity-40" />
      {/* ornament */}
      <div className="relative mt-0.5 flex justify-center pl-2">
        <span
          className="grid h-8 w-8 place-items-center rounded-full border-2"
          style={{ borderColor: theme.accent, color: theme.accent }}
        >
          <Icon name="auto_stories" size={16} />
        </span>
      </div>
      <div className="flex-1" />
      {/* title block — full title, clamped */}
      <div className="relative pl-2.5">
        <p
          className={`font-display font-bold leading-[1.15] ${compact ? 'text-[13px] line-clamp-2' : 'text-[15px] line-clamp-4'}`}
          style={{ color: theme.ink }}
        >
          {product.name}
        </p>
        {product.authorOrBrand && (
          <p className="mt-1 truncate text-[10px] font-bold tracking-[0.18em] uppercase" style={{ color: theme.sub }}>
            {product.authorOrBrand}
          </p>
        )}
        <div className="mt-2 h-[2px] w-10 rounded-full" style={{ background: theme.accent }} />
      </div>
    </div>
  );
}

/* ── Stock badge (module level so cards can use it) ─────────────── */
function stockBadge(p: ApiProduct) {
  const inner = (icon: string, label: string) => (
    <span className="inline-flex items-center gap-1">
      <Icon name={icon} size={13} />
      {label}
    </span>
  );
  if (p.quantityOnHand <= 0)
    return <StampBadge tone="danger">{inner('block', 'OUT')}</StampBadge>;
  if (p.quantityOnHand <= LOW_STOCK_AT)
    return <StampBadge tone="gold">{inner('warning', `${p.quantityOnHand} LEFT`)}</StampBadge>;
  return <StampBadge tone="olive">{inner('check_circle', 'IN STOCK')}</StampBadge>;
}

/* ── Product card ──────────────────────────────────────────────── */
function ProductCard({
  p,
  priceTier,
  tiered,
  tierPrice,
  out,
  tillMode,
  onAdd,
}: {
  p: ApiProduct;
  priceTier: PriceTier;
  tiered: boolean;
  tierPrice: number;
  out: boolean;
  tillMode: boolean;
  onAdd: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      disabled={out}
      onClick={onAdd}
      className={`group w-full text-left rounded-2xl bg-surface border border-border shadow-sm flex flex-col overflow-hidden transition-all duration-200 active:scale-[0.97] ${
        out
          ? 'opacity-55 saturate-50'
          : 'hover:-translate-y-1 hover:border-wine/50 hover:shadow-[0_14px_32px_-12px_rgba(107,35,56,0.35)]'
      }`}
      aria-label={`Add ${p.name} to cart, ${formatMoney(tierPrice)}`}
    >
      {/* Cover */}
      <div className={`relative shrink-0 overflow-hidden ${tillMode ? 'aspect-[16/10]' : 'aspect-[4/5]'}`}>
        <BookCover product={p} compact={tillMode} />
        {/* stock stamp */}
        <div className="absolute top-2 left-2">{stockBadge(p)}</div>
        {/* tier ribbon */}
        {priceTier !== 'standard' && (
          <div className="absolute top-2 right-2">
            <StampBadge tone="gold">{TIER_STAMP[priceTier]}</StampBadge>
          </div>
        )}
        {/* out-of-stock veil */}
        {out && (
          <div className="absolute inset-0 grid place-items-center bg-ink/45">
            <span className="rounded-lg border-2 border-white/80 px-3 py-1 text-sm font-black tracking-[0.2em] text-white uppercase">
              Out
            </span>
          </div>
        )}
        {/* hover sheen */}
        {!out && <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-transparent via-transparent to-white/0 transition group-hover:to-white/10" />}
      </div>
      {/* Body */}
      <div className="flex flex-1 flex-col gap-0.5 p-3">
        <p className="truncate text-[15px] font-bold leading-snug text-ink">{p.name}</p>
        {p.authorOrBrand && (
          <p className="truncate text-xs text-ink-muted">{p.authorOrBrand}</p>
        )}
        <div className="mt-auto flex items-end justify-between gap-2 pt-2">
          <div className="min-w-0">
            {priceTier !== 'standard' && (
              <p className="text-[9px] font-black tracking-[0.16em] text-gold uppercase leading-none mb-0.5">
                {TIER_STAMP[priceTier]}
              </p>
            )}
            <p className="tnum font-display text-[22px] font-bold leading-none text-wine">
              {formatMoney(tierPrice)}
            </p>
            {tiered && (
              <p className="tnum mt-0.5 text-[11px] text-ink-muted line-through">
                {formatMoney(p.sellingPrice)}
              </p>
            )}
          </div>
          <span
            className={`grid h-11 w-11 shrink-0 place-items-center rounded-full shadow-md transition-all duration-200 ${
              out
                ? 'bg-surface-alt text-ink-muted'
                : 'bg-wine text-white group-hover:scale-110 group-hover:bg-wine-hover group-hover:shadow-[0_8px_20px_rgba(107,35,56,0.45)]'
            }`}
          >
            <Icon name="add" size={24} />
          </span>
        </div>
      </div>
    </button>
  );
}

export default function SellPage() {
  const reduceMotion = useReducedMotion();

  /* ── search ── */
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [products, setProducts] = useState<ApiProduct[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  /* ── cart (hydrated from localStorage on first render) ── */
  const [cart, setCart] = useState<CartLine[]>(() => {
    if (typeof window === 'undefined') return [];
    return loadCart();
  });
  /* Active price list — applies to newly-added items only; existing lines keep their tier. */
  const [priceTier, setPriceTier] = useState<PriceTier>('standard');
  const [discountMode, setDiscountMode] = useState<DiscountMode>('amount');
  const [discountValue, setDiscountValue] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);

  /* ── payment ── */
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [tendered, setTendered] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [note, setNote] = useState('');

  /* ── ui ── */
  const [mobileTab, setMobileTab] = useState<'browse' | 'cart'>('browse');
  const [checkingOut, setCheckingOut] = useState(false);
  const [receipt, setReceipt] = useState<SaleReceipt | null>(null);
  /* Till mode — POS takes over the whole screen (shell chrome hidden) */
  const [tillMode, setTillMode] = useState(false);
  /* Cart takes half the screen when expanded */
  const [cartWide, setCartWide] = useState(false);
  /* Category tiles can be collapsed to free space */
  const [showCategories, setShowCategories] = useState(true);

  useEffect(() => {
    document.documentElement.classList.toggle('till-mode', tillMode);
    if (tillMode) {
      // True fullscreen where permitted; CSS fallback covers the rest.
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    }
    return () => document.documentElement.classList.remove('till-mode');
  }, [tillMode]);

  /* ESC exits till mode */
  useEffect(() => {
    if (!tillMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setTillMode(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tillMode]);
  /* Current cashier (for the "Served by" line on the receipt) */
  const [cashier, setCashier] = useState<{ name: string; id: string } | null>(null);

  useEffect(() => {
    fetch('/api/v1/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        const u = body?.data;
        if (u?.name) setCashier({ name: String(u.name), id: u.id != null ? String(u.id) : '' });
      })
      .catch(() => { /* offline — ReceiptBody falls back to the sale record's cashier_name */ });
  }, []);
  const [flyDots, setFlyDots] = useState<{ id: number; fromX: number; fromY: number; toX: number; toY: number }[]>([]);
  const [cartBump, setCartBump] = useState(0);
  const idempotencyRef = useRef<string | null>(null);
  const flyId = useRef(0);
  const desktopCartRef = useRef<HTMLDivElement>(null);
  const mobileCartTabRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(cart));
    } catch { /* storage full — cart just won't persist */ }
  }, [cart]);

  /* ── debounce search ── */
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  /* ── run search ── */
  const runSearch = useCallback(async (q: string, signal?: AbortSignal) => {
    setSearching(true);
    setSearchError(null);
    try {
      const items = await apiGetProducts(q, signal ?? new AbortController().signal);
      setProducts(items);
      setHasSearched(true);
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setSearchError(e instanceof Error ? e.message : 'Search failed');
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async data fetch: setStates happen after await, not synchronously
    runSearch(debouncedQuery, ctrl.signal);
    return () => ctrl.abort();
  }, [debouncedQuery, runSearch]);

  /* ── keyboard shortcut: / or Cmd+K focuses search ── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
      if ((e.key === '/' && !typing) || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /* ── totals ── */
  const visibleProducts = useMemo(() => {
    if (!selectedType) return products;
    return products.filter((p) => p.productType === selectedType);
  }, [products, selectedType]);

  const subtotal = useMemo(() => cart.reduce((s, l) => s + l.unitPrice * l.quantity, 0), [cart]);
  const discountAmount = useMemo(() => {
    const v = parseFloat(discountValue) || 0;
    if (v <= 0) return 0;
    if (discountMode === 'percent') return Math.min(subtotal, (subtotal * Math.min(v, 100)) / 100);
    return Math.min(subtotal, v);
  }, [discountValue, discountMode, subtotal]);
  const total = Math.max(0, subtotal - discountAmount);
  const cartCount = useMemo(() => cart.reduce((s, l) => s + l.quantity, 0), [cart]);

  const tenderedNum = parseMoney(tendered);
  const change = Number.isNaN(tenderedNum) ? null : tenderedNum - total;

  /* ── cart ops ── */
  const cartTargetPos = useCallback(() => {
    const candidates = [mobileCartTabRef.current, desktopCartRef.current];
    for (const el of candidates) {
      if (el && el.offsetParent !== null) {
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }
    }
    return { x: window.innerWidth - 60, y: 80 };
  }, []);

  const addToCart = useCallback((p: ApiProduct, fromX?: number, fromY?: number) => {
    if (p.quantityOnHand <= 0) {
      toast.error(`"${p.name}" is out of stock.`);
      return;
    }
    /* Price is locked to the active tier at add time — later tier switches don't reprice lines. */
    const tier = priceTier;
    const unitPrice = priceForTier(p, tier);
    const key = lineKey(p.id, tier);
    setCart((prev) => {
      const existing = prev.find((l) => lineKey(l.productId, l.priceTier) === key);
      if (existing) {
        if (existing.quantity >= p.quantityOnHand) {
          toast.warning(`Only ${p.quantityOnHand} left of "${p.name}".`);
          return prev;
        }
        return prev.map((l) => lineKey(l.productId, l.priceTier) === key ? { ...l, quantity: l.quantity + 1, stock: p.quantityOnHand } : l);
      }
      return [...prev, { productId: p.id, name: p.name, unitPrice, quantity: 1, stock: p.quantityOnHand, priceTier: tier }];
    });
    /* fly-to-cart animation (target measured at tap time) */
    if (fromX != null && fromY != null && !reduceMotion) {
      const target = cartTargetPos();
      const id = ++flyId.current;
      setFlyDots((d) => [...d, { id, fromX, fromY, toX: target.x, toY: target.y }]);
    } else {
      setCartBump((b) => b + 1);
    }
  }, [reduceMotion, cartTargetPos, priceTier]);

  const finishFly = useCallback((id: number) => {
    setFlyDots((d) => d.filter((dot) => dot.id !== id));
    setCartBump((b) => b + 1);
  }, []);

  const setQty = useCallback((key: string, qty: number) => {
    setCart((prev) => prev.map((l) => lineKey(l.productId, l.priceTier) === key ? { ...l, quantity: qty } : l));
  }, []);

  const removeLine = useCallback((key: string) => {
    setCart((prev) => prev.filter((l) => lineKey(l.productId, l.priceTier) !== key));
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
    setDiscountValue('');
    setConfirmClear(false);
    toast.info('Cart cleared.');
  }, []);

  /* ── validation ── */
  const validateCheckout = useCallback((): string | null => {
    if (cart.length === 0) return 'The cart is empty.';
    if (paymentMethod === 'cash') {
      if (tendered.trim() === '' || Number.isNaN(tenderedNum)) return 'Enter the amount tendered.';
      if ((change ?? -1) < 0) return `Tendered amount is short by ${formatMoney(total - tenderedNum)}.`;
    }
    if (paymentMethod === 'mobile_money' && paymentReference.trim() === '') {
      return 'Enter the mobile money transaction ID.';
    }
    return null;
  }, [cart.length, paymentMethod, tendered, tenderedNum, change, total, paymentReference]);

  /* ── checkout ── */
  /* Ref mirror so the toast "Retry" action can re-invoke the latest checkout. */
  const checkoutRef = useRef<() => void>(() => undefined);
  const checkout = useCallback(async () => {
    const problem = validateCheckout();
    if (problem) {
      toast.error(problem);
      return;
    }
    setCheckingOut(true);
    /* One idempotency key per checkout attempt — reused on retry so a flaky
       network can never double-charge. Reset only on New Sale. */
    if (!idempotencyRef.current) {
      idempotencyRef.current = crypto.randomUUID();
    }
    try {
      const res = await fetch('/api/v1/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          /* The sales API accepts productId + quantity + priceTier per line
             (createSaleSchema in app/api/v1/sales/route.ts) and record_sale()
             resolves the tier price server-side (same for demo mode in
             lib/demo-api.ts). */
          items: cart.map((l) => ({ productId: l.productId, quantity: l.quantity, priceTier: l.priceTier })),
          paymentMethod: paymentMethod,
          discount: Math.round(discountAmount * 100) / 100,
          amountTendered: paymentMethod === 'cash' ? Math.round(tenderedNum * 100) / 100 : undefined,
          paymentReference: paymentReference.trim() || undefined,
          note: note.trim() || undefined,
          idempotencyKey: idempotencyRef.current,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        const code = body?.error?.code as string | undefined;
        const message = body?.error?.message as string | undefined;
        if (code === 'INSUFFICIENT_STOCK') {
          toast.error(message ?? 'Not enough stock for one of the items.', { duration: 5000 });
          /* refetch stock so the shelf reflects reality */
          runSearch(debouncedQuery);
        } else if (code === 'TENDERED_TOO_LOW') {
          toast.error('Tendered amount is too low.');
        } else {
          toast.error(message ?? `Sale failed (${res.status}). Nothing was charged.`);
        }
        return;
      }
      const receiptData = normalizeReceipt(body?.data);
      if (!receiptData) {
        toast.error('Sale recorded, but the receipt could not be read.');
        return;
      }
      setReceipt(receiptData);
      setCart([]);
      setDiscountValue('');
      setTendered('');
      setPaymentReference('');
      setNote('');
      setConfirmClear(false);
      toast.success(`Sale ${receiptData.receipt_number} recorded.`);
      /* refresh stock levels in the background */
      runSearch(debouncedQuery);
    } catch {
      toast.error('Network error — your sale was NOT recorded. Check connection and try again.', {
        duration: 6000,
        action: { label: 'Retry', onClick: () => checkoutRef.current() },
      });
    } finally {
      setCheckingOut(false);
    }
  }, [validateCheckout, cart, paymentMethod, discountAmount, tenderedNum, paymentReference, note, runSearch, debouncedQuery]);

  useEffect(() => {
    checkoutRef.current = checkout;
  });

  const newSale = useCallback(() => {
    setReceipt(null);
    idempotencyRef.current = null;
    setMobileTab('browse');
    searchRef.current?.focus();
  }, []);

  /* ── render helpers ── */
  const quickCash = (amount: number | 'exact') => {
    setTendered(amount === 'exact' ? total.toFixed(2) : String(amount));
  };

  return (
    <div className={tillMode ? 'h-dvh flex flex-col overflow-hidden bg-parchment text-ink' : 'min-h-screen bg-parchment text-ink'}>
      <Toaster position="top-center" richColors closeButton />
      {/* Print styles — receipt only */}
      <style>{`
        @page { size: 80mm auto; margin: 3mm; }
        @media print {
          .pos-no-print { display: none !important; }
          .pos-print-only { display: block !important; }
          body { background: #fff !important; }
          [data-sonner-toaster] { display: none !important; }
        }
      `}</style>

      {/* Fly-to-cart dots */}
      <AnimatePresence>
        {flyDots.map((dot) => (
          <motion.span
            key={dot.id}
            className="fixed z-[100] pointer-events-none w-10 h-10 rounded-full bg-wine text-white grid place-items-center shadow-lg"
            style={{ left: 0, top: 0 }}
            initial={{ x: dot.fromX - 20, y: dot.fromY - 20, scale: 1, opacity: 1 }}
            animate={{ x: dot.toX - 20, y: dot.toY - 20, scale: 0.35, opacity: 0.85 }}
            exit={{ opacity: 0, scale: 0.2 }}
            transition={{ duration: 0.55, ease: [0.3, 0.7, 0.4, 1] }}
            onAnimationComplete={() => finishFly(dot.id)}
          >
            <Icon name="menu_book" size={20} />
          </motion.span>
        ))}
      </AnimatePresence>

      {/* ═══ Header ═══ */}
      <header className="pos-no-print sticky top-0 z-30 bg-parchment/95 backdrop-blur border-b border-border">
        <div className="max-w-7xl mx-auto px-4 pt-4 pb-3">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-11 h-11 rounded-xl bg-wine text-white grid place-items-center shrink-0">
              <Icon name="point_of_sale" size={26} />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="font-display text-2xl leading-none">Point of Sale</h1>
              <p className="text-sm text-ink-muted">
                {new Date().toLocaleDateString('en-GH', { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
            </div>
            <motion.div
              key={cartBump}
              ref={desktopCartRef}
              initial={reduceMotion ? false : { scale: 1.35 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 500, damping: 18 }}
              className="hidden lg:flex items-center gap-2 rounded-full bg-wine-tint text-wine font-bold px-4 py-2"
              aria-live="polite"
              aria-label={`${cartCount} items in cart`}
            >
              <Icon name="shopping_cart" size={20} />
              <span className="tnum">{cartCount}</span>
            </motion.div>
            <button
              type="button"
              onClick={() => setTillMode((v) => !v)}
              aria-pressed={tillMode}
              title={tillMode ? 'Exit till mode (Esc)' : 'Till mode — full screen'}
              className={`hidden lg:inline-flex h-11 min-w-[44px] items-center gap-2 rounded-xl border-2 px-3 text-sm font-bold transition active:scale-95 ${
                tillMode
                  ? 'border-wine bg-wine text-white'
                  : 'border-border bg-surface text-ink hover:border-wine/60'
              }`}
            >
              <Icon name={tillMode ? 'fullscreen_exit' : 'fullscreen'} size={20} />
              <span className="hidden xl:inline">{tillMode ? 'Exit till' : 'Till mode'}</span>
            </button>
          </div>

          {/*Mobile tabs */}          <div className="lg:hidden mt-3 grid grid-cols-2 gap-2 p-1 rounded-xl bg-surface-alt border border-border" role="tablist" aria-label="POS views">            {(['browse', 'cart'] as const).map((tab) => (
              <button
                key={tab}
                role="tab"
                aria-selected={mobileTab === tab}
                ref={tab === 'cart' ? mobileCartTabRef : undefined}
                onClick={() => setMobileTab(tab)}
                className={`relative h-12 rounded-lg text-base font-bold flex items-center justify-center gap-2 transition ${
                  mobileTab === tab ? 'text-white' : 'text-ink-muted'
                }`}
              >
                {mobileTab === tab && (
                  <motion.span
                    layoutId="pos-mobile-tab"
                    className="absolute inset-0 rounded-lg bg-wine"
                    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                  />
                )}
                <span className="relative flex items-center gap-2">
                  <Icon name={tab === 'browse' ? 'storefront' : 'shopping_cart'} size={20} />
                  {tab === 'browse' ? 'Browse' : 'Cart'}
                  {tab === 'cart' && cartCount > 0 && (
                    <motion.span
                      key={cartBump}
                      initial={reduceMotion ? false : { scale: 1.5 }}
                      animate={{ scale: 1 }}
                      className="relative tnum min-w-6 h-6 px-1 rounded-full bg-gold text-ink text-sm font-bold grid place-items-center"
                    >
                      {cartCount}
                    </motion.span>
                  )}
                </span>
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* ═══ Main ═══ */}
      <main className={tillMode
        ? 'pos-no-print flex-1 min-h-0'
        : 'pos-no-print max-w-7xl mx-auto px-4 py-4 pb-28 lg:pb-12'
      }>
        <div className={tillMode
          ? (cartWide ? 'h-full lg:grid lg:grid-cols-2' : 'h-full lg:grid lg:grid-cols-[minmax(0,1fr)_440px]')
          : (cartWide ? 'lg:grid lg:grid-cols-2 lg:gap-6 lg:items-start' : 'lg:grid lg:grid-cols-[1fr_380px] lg:gap-6 lg:items-start')
        }>

          {/* ── Product grid ── */}
          <section aria-label="Products" className={`${mobileTab === 'cart' ? 'hidden lg:block' : ''} ${tillMode ? 'h-full min-h-0 overflow-y-auto px-4 py-4 lg:px-6' : ''}`}>
          {/* Search */}
          <div className="relative">
            <Icon name="search" size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search books, Bibles, stationery…"
              aria-label="Search products"
              autoComplete="off"
              className="w-full h-12 rounded-xl bg-surface border-2 border-border-input pl-11 pr-20 text-base placeholder:text-ink-muted/70 focus:border-wine focus:outline-none transition"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
              {searching && <Icon name="progress_activity" size={20} className="text-wine animate-spin" />}
              <kbd className="hidden sm:inline-flex items-center gap-1 rounded-md bg-surface-alt border border-border px-2 py-1 text-xs font-semibold text-ink-muted">
                ⌘K
              </kbd>
            </div>
          </div>

          {/* Category tiles — collapsible */}
          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="chapter-eyebrow shrink-0">Categories</span>
            <button
              type="button"
              onClick={() => setShowCategories((v) => !v)}
              aria-pressed={showCategories}
              aria-expanded={showCategories}
              className="inline-flex h-9 items-center gap-1 rounded-lg px-2 text-xs font-bold text-ink-muted hover:bg-surface-alt hover:text-ink transition"
            >
              <Icon name={showCategories ? 'expand_less' : 'expand_more'} size={18} />
              {showCategories ? 'Hide' : 'Show'}
            </button>
          </div>
          {showCategories && (
          <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-5" role="group" aria-label="Filter by category">
            {CATEGORY_TILES.map((t) => {
              const active = selectedType === t.value;
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setSelectedType(active ? null : t.value)}
                  aria-pressed={active}
                  className={`flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-center font-bold transition active:scale-95 ${t.bg} hover:brightness-95 ${
                    active
                      ? 'ring-[3px] ring-wine ring-offset-2 ring-offset-parchment shadow-md brightness-[0.93]'
                      : ''
                  }`}
                >
                  <Icon name={t.icon} size={22} />
                  <span className="text-[11px] leading-tight sm:text-xs">{t.label}</span>
                </button>
              );
            })}
          </div>
          )}

          {/* Price list selector — tier applies to items added from now on */}
          <div className="mt-3 mb-5 flex items-center gap-2 flex-wrap" role="radiogroup" aria-label="Price list">
            <span className="chapter-eyebrow mr-1 shrink-0">Price list</span>
            {PRICE_TIERS.map((t) => {
              const active = priceTier === t.value;
              return (
                <button
                  key={t.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setPriceTier(t.value)}
                  className={`min-h-[44px] px-4 rounded-full text-sm font-bold border-2 transition active:scale-95 ${
                    active
                      ? 'bg-wine border-wine text-white shadow-md'
                      : 'bg-surface border-border text-ink hover:border-wine/60'
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>


            {searchError ? (
              <div className="rounded-xl bg-danger-bg border border-danger/30 p-6 text-center">
                <Icon name="cloud_off" size={36} className="text-danger mx-auto mb-2" />
                <p className="font-semibold text-danger mb-1">Couldn&apos;t load products</p>
                <p className="text-sm text-ink-muted mb-4">{searchError}</p>
                <button
                  onClick={() => runSearch(debouncedQuery)}
                  className="h-12 px-6 rounded-xl bg-wine text-white font-bold inline-flex items-center gap-2 active:scale-95 transition"
                >
                  <Icon name="refresh" size={20} /> Retry
                </button>
              </div>
            ) : !hasSearched && !searching ? (
              <div className="rounded-xl bg-surface border border-border p-10 text-center">
                <div className="w-16 h-16 rounded-full bg-wine-tint text-wine grid place-items-center mx-auto mb-4">
                  <Icon name="menu_book" size={32} />
                </div>
                <h2 className="font-display text-xl mb-1">Ready to serve</h2>
                <p className="text-ink-muted">Browse the shelves below, or search above.<br />Tap a card to add it to the cart.</p>
              </div>
            ) : visibleProducts.length === 0 && !searching ? (
              <div className="rounded-xl bg-surface border border-border p-10 text-center">
                <Icon name="search_off" size={40} className="text-ink-muted mx-auto mb-3" />
                <h2 className="font-display text-xl mb-1">No matches</h2>
                <p className="text-ink-muted">
                  {selectedType
                    ? 'No items in this category yet.'
                    : `Nothing found for “${debouncedQuery}”. Try another title or author.`}
                </p>
                {selectedType && (
                  <button
                    type="button"
                    onClick={() => setSelectedType(null)}
                    className="mt-4 h-11 px-5 rounded-xl bg-wine text-white font-bold active:scale-95 transition"
                  >
                    Show all items
                  </button>
                )}
              </div>
            ) : (
              <ul className={tillMode ? 'grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3' : 'grid grid-cols-2 md:grid-cols-3 gap-3'} aria-label="Products">
                <AnimatePresence>
                  {visibleProducts.map((p, i) => {
                    const out = p.quantityOnHand <= 0;
                    const tierPrice = priceForTier(p, priceTier);
                    const tiered = priceTier !== 'standard' && tierPrice !== p.sellingPrice;
                    return (
                      <motion.li
                        key={p.id}
                        initial={reduceMotion ? false : { opacity: 0, y: 14 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.96 }}
                        transition={{ duration: 0.25, delay: reduceMotion ? 0 : Math.min(i * 0.035, 0.35) }}
                        layout
                      >
                        <ProductCard
                          p={p}
                          priceTier={priceTier}
                          tiered={tiered}
                          tierPrice={tierPrice}
                          out={out}
                          tillMode={tillMode}
                          onAdd={(e) => addToCart(p, e.clientX, e.clientY)}
                        />
                      </motion.li>
                    );
                  })}
                </AnimatePresence>
              </ul>
            )}
          </section>

          {/* ── Cart / selling dashboard ── */}
          <aside
            aria-label="Cart and checkout"
            className={`${mobileTab === 'browse' ? 'hidden lg:block' : ''} ${tillMode ? 'h-full min-h-0 border-t lg:border-t-0 lg:border-l border-border bg-surface' : 'lg:sticky lg:top-20 lg:h-[calc(100vh-6.5rem)]'}`}
          >
            <div className={tillMode
              ? 'h-full flex flex-col overflow-hidden'
              : 'h-full flex flex-col rounded-2xl bg-surface border border-border shadow-[0_12px_40px_rgba(60,30,20,0.10)] overflow-hidden paper-texture'
            }>
              {/* Cart lines */}
              <div className={tillMode ? 'flex-1 min-h-0 overflow-y-auto p-4 pb-6 lg:p-5 lg:pb-8' : 'flex-1 min-h-0 flex flex-col p-4 lg:p-5 pb-2'}>
                <div className="flex items-center justify-between mb-1 shrink-0">
                  <h2 className="flex items-center gap-2.5">
                    {cart.length > 0 ? (
                      <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-olive opacity-60" />
                        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-olive" />
                      </span>
                    ) : (
                      <Icon name="receipt_long" size={22} className="text-ink-muted" />
                    )}
                    <span className="font-display text-[22px] text-ink">Current sale</span>
                    {cartCount > 0 && <span className="tnum rounded-full bg-wine px-2.5 py-0.5 text-[13px] font-black text-white">{cartCount}</span>}
                  </h2>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setCartWide((v) => !v)}
                      aria-pressed={cartWide}
                      title={cartWide ? 'Narrow cart' : 'Cart takes half the screen'}
                      className="hidden lg:inline-flex h-11 w-11 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-alt hover:text-ink active:scale-95 transition"
                    >
                      <Icon name={cartWide ? 'unfold_less' : 'unfold_more'} size={22} />
                    </button>
                    {cart.length > 0 && (
                    confirmClear ? (
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-danger">Clear cart?</span>
                        <button onClick={clearCart} className="h-11 px-4 rounded-lg bg-danger text-white text-sm font-bold active:scale-95 transition">Yes</button>
                        <button onClick={() => setConfirmClear(false)} className="h-11 px-4 rounded-lg bg-surface-alt border border-border text-sm font-bold active:scale-95 transition">Keep</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmClear(true)}
                        className="h-11 px-3 rounded-lg text-danger text-sm font-bold inline-flex items-center gap-1 hover:bg-danger-bg active:scale-95 transition"
                      >
                        <Icon name="delete" size={18} /> Clear
                      </button>
                    )
                  )}
                  </div>
                </div>

                {cart.length === 0 ? (
                  <div className="flex flex-col items-center px-6 py-12 text-center">
                    <div className="paper-texture mb-5 grid h-20 w-20 place-items-center rounded-[22px] border border-dashed border-border-input bg-surface-alt/60 text-ink-muted">
                      <Icon name="receipt_long" size={38} />
                    </div>
                    <p className="font-display text-xl text-ink">No items yet</p>
                    <p className="mt-1.5 max-w-[230px] text-sm leading-relaxed text-ink-muted">
                      Tap any product on the shelf to start ringing up this sale.
                    </p>
                  </div>
                ) : (
                  <ul className={tillMode ? '-mx-4 px-4' : 'flex-1 min-h-0 overflow-y-auto -mx-4 px-4'}>
                    <AnimatePresence initial={false}>
                      {cart.map((l) => (
                        <motion.li
                          key={lineKey(l.productId, l.priceTier)}
                          layout
                          initial={reduceMotion ? false : { opacity: 0, x: 24 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -24, height: 0, marginTop: 0, marginBottom: 0 }}
                          transition={{ duration: 0.2 }}
                          className="group flex items-start gap-2 overflow-hidden border-b border-dashed border-border-input/70 py-2.5 last:border-b-0"
                        >
                          <div className="min-w-0 flex-1 pt-0.5">
                            <p className="text-[13.5px] font-bold leading-snug text-ink line-clamp-2">{l.name}</p>
                            <p className="tnum mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] text-ink-muted">
                              <span>{formatMoney(l.unitPrice)} <span className="opacity-70">×</span> {l.quantity}</span>
                              {l.priceTier !== 'standard' && (
                                <StampBadge tone="gold">{TIER_STAMP[l.priceTier]}</StampBadge>
                              )}
                            </p>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1">
                            <p className="tnum text-[14px] font-black text-ink">{formatMoney(l.unitPrice * l.quantity)}</p>
                            <Stepper value={l.quantity} max={l.stock} onChange={(v) => setQty(lineKey(l.productId, l.priceTier), v)} />
                          </div>
                          <button
                            onClick={() => removeLine(lineKey(l.productId, l.priceTier))}
                            aria-label={`Remove ${l.name}`}
                            className="grid h-8 w-8 shrink-0 place-items-center self-center rounded-full text-ink-muted/70 transition hover:bg-danger-bg hover:text-danger active:scale-90"
                          >
                            <Icon name="close" size={16} />
                          </button>
                        </motion.li>
                      ))}
                    </AnimatePresence>
                  </ul>
                )}
              </div>

              {/* ── Checkout footer: pinned to bottom ── */}
              <div className={tillMode ? 'shrink-0 border-t-2 border-border bg-surface max-h-[62%] overflow-y-auto' : 'shrink-0 border-t border-border bg-surface max-h-[72%] overflow-y-auto rounded-b-2xl'}>
              {/* Discount */}
              {cart.length > 0 && (
                <div className="p-4 border-b border-border">
                  <div className="flex items-center gap-2">
                    <Icon name="sell" size={20} className="text-ink-muted" />
                    <div className="flex rounded-lg bg-surface-alt border border-border p-0.5" role="group" aria-label="Discount type">
                      {(['amount', 'percent'] as DiscountMode[]).map((m) => (
                        <button
                          key={m}
                          onClick={() => setDiscountMode(m)}
                          aria-pressed={discountMode === m}
                          className={`h-10 px-3 rounded-md text-sm font-bold transition ${discountMode === m ? 'bg-wine text-white' : 'text-ink-muted'}`}
                        >
                          {m === 'amount' ? '₵' : '%'}
                        </button>
                      ))}
                    </div>
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      value={discountValue}
                      onChange={(e) => setDiscountValue(e.target.value)}
                      placeholder={discountMode === 'amount' ? '0.00' : '0'}
                      aria-label={discountMode === 'amount' ? 'Discount amount in cedis' : 'Discount percent'}
                      className="tnum h-11 flex-1 min-w-0 rounded-lg bg-surface border-2 border-border-input px-3 text-lg focus:border-wine focus:outline-none"
                    />
                  </div>
                </div>
              )}

              {/* Totals */}
              <div className="space-y-2 border-b border-dashed border-border-input/70 bg-ink/[0.025] p-4 lg:p-5">
                <div className="tnum flex justify-between text-sm text-ink-muted">
                  <span>Subtotal</span>
                  <AnimatedMoney value={subtotal} className="font-bold text-ink" />
                </div>
                {discountAmount > 0 && (
                  <div className="tnum flex justify-between text-sm font-bold text-olive">
                    <span>Discount{discountMode === 'percent' && discountValue ? ` (${discountValue}%)` : ''}</span>
                    <span>−{formatMoney(discountAmount)}</span>
                  </div>
                )}
                <div className="flex items-baseline justify-between border-t border-dashed border-border-input/70 pt-2.5">
                  <span className="text-[11px] font-black tracking-[0.2em] text-ink-muted uppercase">Total due</span>
                  <AnimatedMoney value={total} className="tnum font-display text-[38px] leading-none font-black text-wine" />
                </div>
              </div>

              {/* Payment */}
              {cart.length > 0 && (
                <div className="p-4 space-y-4">
                  <div>
                    <p className="text-sm font-bold text-ink-muted mb-2 uppercase tracking-wide">Payment method</p>
                    <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Payment method">
                      {PAYMENT_METHODS.map((m) => {
                        const active = paymentMethod === m.value;
                        return (
                          <button
                            key={m.value}
                            role="radio"
                            aria-checked={active}
                            onClick={() => setPaymentMethod(m.value)}
                            className={`min-h-[68px] rounded-2xl flex flex-col items-center justify-center gap-1 text-xs font-bold border-2 transition-all active:scale-95 ${
                              active
                                ? 'bg-wine border-wine text-white shadow-[0_8px_20px_rgba(107,35,56,0.35)] -translate-y-0.5'
                                : 'bg-surface border-border text-ink-muted hover:text-ink hover:border-wine/40 hover:-translate-y-0.5'
                            }`}
                          >
                            <Icon name={m.icon} size={26} />
                            <span>{m.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                      key={paymentMethod}
                      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.18 }}
                    >
                      {paymentMethod === 'cash' && (
                        <div className="space-y-3">
                          <div>
                            <label htmlFor="tendered" className="text-sm font-bold text-ink-muted uppercase tracking-wide">Amount tendered</label>
                            <div className="relative mt-1">
                              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-bold text-ink-muted">₵</span>
                              <input
                                id="tendered"
                                type="number"
                                inputMode="decimal"
                                min="0"
                                value={tendered}
                                onChange={(e) => setTendered(e.target.value)}
                                placeholder="0.00"
                                className="tnum w-full h-16 rounded-xl bg-surface border-2 border-border-input pl-10 pr-4 text-3xl font-bold focus:border-wine focus:outline-none"
                              />
                            </div>
                          </div>
                          <div className="grid grid-cols-5 gap-1.5">
                            <button onClick={() => quickCash('exact')} className="h-12 rounded-lg bg-wine-tint text-wine text-sm font-bold active:scale-95 transition">Exact</button>
                            {QUICK_CASH.map((a) => (
                              <button key={a} onClick={() => quickCash(a)} className="tnum h-12 rounded-lg bg-surface-alt border border-border text-sm font-bold active:scale-95 transition">₵{a}</button>
                            ))}
                          </div>
                          <div className={`rounded-xl p-3 text-center ${change != null && change >= 0 ? 'bg-olive-bg' : 'bg-surface-alt'}`}>
                            <p className="text-xs font-bold uppercase tracking-wide text-ink-muted">Change due</p>
                            <p className={`tnum text-4xl font-bold ${change != null && change >= 0 ? 'text-olive' : 'text-ink-muted'}`}>
                              {change == null ? '—' : formatMoney(Math.max(0, change))}
                            </p>
                            {change != null && change < 0 && (
                              <p className="text-sm font-bold text-danger mt-1">Short by {formatMoney(-change)}</p>
                            )}
                          </div>
                        </div>
                      )}

                      {paymentMethod === 'mobile_money' && (
                        <div>
                          <label htmlFor="momo-ref" className="text-sm font-bold text-ink-muted uppercase tracking-wide">MoMo transaction ID</label>
                          <input
                            id="momo-ref"
                            type="text"
                            value={paymentReference}
                            onChange={(e) => setPaymentReference(e.target.value)}
                            placeholder="e.g. 1234567890"
                            autoComplete="off"
                            className="mt-1 w-full h-14 rounded-xl bg-surface border-2 border-border-input px-4 text-lg focus:border-wine focus:outline-none"
                          />
                          <p className="text-sm text-ink-muted mt-1.5 flex items-center gap-1.5">
                            <Icon name="info" size={16} /> Confirm the MoMo alert on the customer&apos;s phone first.
                          </p>
                        </div>
                      )}

                      {(paymentMethod === 'card' || paymentMethod === 'bank_transfer') && (
                        <div>
                          <label htmlFor="card-ref" className="text-sm font-bold text-ink-muted uppercase tracking-wide">
                            Reference <span className="normal-case font-normal">(optional)</span>
                          </label>
                          <input
                            id="card-ref"
                            type="text"
                            value={paymentReference}
                            onChange={(e) => setPaymentReference(e.target.value)}
                            placeholder="Receipt / approval code"
                            autoComplete="off"
                            className="mt-1 w-full h-14 rounded-xl bg-surface border-2 border-border-input px-4 text-lg focus:border-wine focus:outline-none"
                          />
                        </div>
                      )}
                    </motion.div>
                  </AnimatePresence>

                  <div>
                    <label htmlFor="sale-note" className="text-sm font-bold text-ink-muted uppercase tracking-wide">
                      Note <span className="normal-case font-normal">(optional)</span>
                    </label>
                    <input
                      id="sale-note"
                      type="text"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="e.g. Sunday service bulk buy"
                      maxLength={300}
                      className="mt-1 w-full h-12 rounded-xl bg-surface border-2 border-border-input px-4 focus:border-wine focus:outline-none"
                    />
                  </div>

                  <motion.button
                    onClick={checkout}
                    disabled={checkingOut || cart.length === 0}
                    whileTap={reduceMotion ? undefined : { scale: 0.97 }}
                    className="group relative w-full h-[68px] rounded-2xl bg-gradient-to-b from-[#8A2F47] via-wine to-[#4E1626] text-white text-xl font-black flex items-center justify-center gap-2.5 shadow-[0_12px_32px_rgba(107,35,56,0.45)] disabled:opacity-40 disabled:shadow-none overflow-hidden transition hover:shadow-[0_16px_40px_rgba(107,35,56,0.55)] hover:-translate-y-0.5"
                  >
                    <span className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" aria-hidden="true" />
                    {checkingOut ? (
                      <><Icon name="progress_activity" size={26} className="animate-spin" /> Processing…</>
                    ) : (
                      <><Icon name="payments" size={28} /> Charge <AnimatedMoney value={total} /></>
                    )}
                  </motion.button>
                  <p className="text-center text-xs text-ink-muted flex items-center justify-center gap-1">
                    <Icon name="lock" size={14} /> Sale is recorded atomically — safe to retry on network failure.
                  </p>
                </div>
              )}
              </div>{/* /checkout footer */}
            </div>
          </aside>
        </div>
      </main>

      {/* ═══ Success overlay + receipt ═══ */}
      <AnimatePresence>
        {receipt && (
          <motion.div
            className="pos-no-print fixed inset-0 z-[90] bg-ink/60 backdrop-blur-sm overflow-y-auto"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="dialog"
            aria-modal="true"
            aria-label="Sale complete"
          >
            <div className="min-h-full flex items-start sm:items-center justify-center p-4 py-8">
              <motion.div
                initial={reduceMotion ? false : { scale: 0.92, y: 24, opacity: 0 }}
                animate={{ scale: 1, y: 0, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 320, damping: 28 }}
                className="w-full max-w-md bg-surface rounded-2xl shadow-2xl overflow-hidden"
              >
                {/* Checkmark */}
                <div className="pt-8 pb-2 flex flex-col items-center">
                  <motion.svg
                    width="96" height="96" viewBox="0 0 96 96" fill="none"
                    initial={reduceMotion ? false : { scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 260, damping: 20, delay: 0.1 }}
                    role="img" aria-label="Sale successful"
                  >
                    <motion.circle
                      cx="48" cy="48" r="44"
                      stroke="var(--success)" strokeWidth="6"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ duration: 0.5, ease: 'easeOut', delay: 0.2 }}
                    />
                    <motion.path
                      d="M30 49 l13 13 l24 -27"
                      stroke="var(--success)" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ duration: 0.4, ease: 'easeOut', delay: 0.6 }}
                    />
                  </motion.svg>
                  <h2 className="font-display text-2xl mt-3">Sale complete</h2>
                  <p className="tnum text-ink-muted font-semibold">{receipt.receipt_number}</p>
                </div>

                {/* Receipt preview — styled like a real paper slip */}
                <div className="mx-4 mb-4 rounded-xl border border-border bg-[#FFFDF7] paper-texture p-5 max-h-72 overflow-y-auto shadow-inner">
                  <ReceiptBody receipt={receipt} cashierName={cashier?.name ?? null} cashierId={cashier?.id ?? null} />
                </div>

                <div className="p-4 pt-0 grid grid-cols-1 gap-2">
                  <button
                    onClick={() => window.print()}
                    autoFocus
                    className="h-16 rounded-xl bg-wine text-white text-lg font-bold inline-flex items-center justify-center gap-2 hover:bg-wine-hover active:scale-95 transition shadow-lg"
                  >
                    <Icon name="print" size={26} /> Print Receipt
                  </button>
                  <button
                    onClick={newSale}
                    className="h-12 rounded-xl bg-surface-alt border-2 border-border-input font-bold inline-flex items-center justify-center gap-2 active:scale-95 transition"
                  >
                    <Icon name="add_shopping_cart" size={20} /> New Sale
                  </button>
                </div>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Print-only receipt — sibling of the overlay so print CSS can isolate it */}
      {receipt && (
        <div className="pos-print-only hidden bg-white text-black p-6 max-w-[80mm] mx-auto" aria-hidden="true">
          <ReceiptBody receipt={receipt} print cashierName={cashier?.name ?? null} cashierId={cashier?.id ?? null} />
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════ Receipt ═══════════════════════ */

function ReceiptBody({
  receipt,
  print = false,
  cashierName = null,
  cashierId = null,
}: {
  receipt: SaleReceipt;
  print?: boolean;
  cashierName?: string | null;
  cashierId?: string | null;
}) {
  const change = receipt.amount_tendered != null ? receipt.amount_tendered - receipt.total : null;
  const soldAt = new Date(receipt.sold_at);
  const text = print ? 'text-black' : 'text-ink';
  return (
    <div className={`${text} mx-auto w-full max-w-[300px] font-mono text-[13px] leading-relaxed`}>
      <div className="text-center mb-2">
        <ReceiptLogo />
        <p className="tnum mt-2 font-bold">{receipt.receipt_number}</p>
        <p className="text-xs opacity-70">
          {soldAt.toLocaleDateString('en-GH', { day: 'numeric', month: 'short', year: 'numeric' })}{' '}
          {soldAt.toLocaleTimeString('en-GH', { hour: '2-digit', minute: '2-digit' })}
        </p>
        <p className="mt-1 font-bold text-[15px] break-words">
          {servedByLine(cashierName ?? receipt.cashier_name, cashierId)}
        </p>
      </div>
      <div className="receipt-dash my-2" aria-hidden="true" />
      <ul className="space-y-1">
        {receipt.items.map((it, i) => (
          <li key={i} className="flex justify-between gap-2">
            <span className="flex-1">
              {it.name}
              <span className="tnum opacity-70"> × {it.quantity}</span>
              {it.price_tier && it.price_tier !== 'standard' && (
                <span className="ml-1 rounded border px-1 text-[10px] font-bold uppercase opacity-80">
                  {POS_TIER_LABELS[it.price_tier] ?? it.price_tier}
                </span>
              )}
            </span>
            <span className="tnum font-semibold">{formatMoney(it.unit_price * it.quantity)}</span>
          </li>
        ))}
      </ul>
      <div className="receipt-dash my-2" aria-hidden="true" />
      <dl className="space-y-1">
        <div className="flex justify-between"><dt className="opacity-70">Subtotal</dt><dd className="tnum">{formatMoney(receipt.subtotal)}</dd></div>
        {receipt.discount > 0 && (
          <div className="flex justify-between"><dt className="opacity-70">Discount</dt><dd className="tnum">−{formatMoney(receipt.discount)}</dd></div>
        )}
        <div className="flex justify-between text-base font-bold"><dt>TOTAL</dt><dd className="tnum">{formatMoney(receipt.total)}</dd></div>
        <div className="flex justify-between"><dt className="opacity-70">Paid via</dt><dd className="font-semibold">{PAYMENT_LABELS[receipt.payment_method as PaymentMethod] ?? receipt.payment_method}</dd></div>
        {receipt.amount_tendered != null && (
          <>
            <div className="flex justify-between"><dt className="opacity-70">Tendered</dt><dd className="tnum">{formatMoney(receipt.amount_tendered)}</dd></div>
            <div className="flex justify-between"><dt className="opacity-70">Change</dt><dd className="tnum">{formatMoney(Math.max(0, change ?? 0))}</dd></div>
          </>
        )}
        {receipt.payment_reference && (
          <div className="flex justify-between"><dt className="opacity-70">Reference</dt><dd className="tnum break-all text-right">{receipt.payment_reference}</dd></div>
        )}
      </dl>
      <div className="receipt-dash my-2" aria-hidden="true" />
      <p className="text-center font-display italic">Thank you and God bless you.</p>
    </div>
  );
}
