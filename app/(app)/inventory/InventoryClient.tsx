'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import type { SessionUser } from '@/lib/auth';
import Icon from '@/components/Icon';
import { formatMoney } from '@/lib/money';
import {
  api,
  useDebounce,
  listVariants,
  riseVariants,
  ChapterHeader,
  StampBadge,
  PrimaryButton,
  SecondaryButton,
  Field,
  inputClass,
  Modal,
  Sheet,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  SkeletonRows,
  LoadMore,
} from '@/components/ui';

/* ═══════════════════════ Types ═══════════════════════ */

interface Product {
  id: string;
  name: string;
  authorOrBrand: string | null;
  sku: string | null;
  barcode: string | null;
  coverPhotoUrl: string | null;
  reference: string | null;
  productType: string;
  categoryId: string | null;
  categoryName: string | null;
  sellingPrice: number;
  priceBishop: number | null;
  priceSonsOfProphet: number | null;
  pricePastorDeji: number | null;
  quantityOnHand: number;
  quantityShop: number;
  quantityWarehouse: number;
  reorderLevel: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  supplierId?: string | null;
  supplierName?: string | null;
  costPrice?: number;
}

interface Category {
  id: string;
  name: string;
}

interface Supplier {
  id: string;
  name: string;
}

/* Matches the API payload shape (camelCase) from
   GET /api/v1/products/:id/movements. */
interface Movement {
  id: string;
  movementType: string;
  quantityChange: number;
  unitCost: number | null;
  referenceType: string | null;
  referenceId: string | null;
  notes: string | null;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: string;
}

interface HistoryEntry extends Movement {
  productName: string;
}

type SortKey = 'name' | 'price' | 'stock';

const PRODUCT_TYPES = [
  { value: 'bishop_books', label: 'Bishop Books' },
  { value: 'other_authors', label: 'Other Authors' },
  { value: 'bibles', label: 'Bibles' },
  { value: 'children_books', label: 'Children Books' },
  { value: 'children_bible', label: 'Children Bible' },
  { value: 'stationery', label: 'Stationery' },
  { value: 'gift', label: 'Gift' },
  { value: 'apparel', label: 'Apparel' },
  { value: 'media', label: 'Media' },
  { value: 'other_items', label: 'Other Items' },
];

export function productTypeLabel(value: string | null | undefined): string {
  if (!value) return 'Other';
  return PRODUCT_TYPES.find((t) => t.value === value)?.label
    ?? value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

type StampTone = 'wine' | 'gold' | 'olive' | 'slate' | 'danger' | 'brass';

const MOVEMENT_TONES: Record<string, StampTone> = {
  sale: 'danger',
  purchase_receipt: 'olive',
  transfer_in: 'olive',
  transfer_out: 'gold',
  adjustment: 'brass',
  damage: 'danger',
  return: 'gold',
  void: 'slate',
};

const MOVEMENT_LABELS: Record<string, string> = {
  sale: 'Sale',
  purchase_receipt: 'Purchase',
  transfer_in: 'Transfer in',
  transfer_out: 'Transfer out',
  adjustment: 'Adjustment',
  damage: 'Damage',
  return: 'Return',
  void: 'Voided sale',
};

const SPINE_FOR_STAMP: Record<StampTone, string> = {
  wine: 'spine-wine',
  gold: 'spine-gold',
  olive: 'spine-olive',
  slate: 'spine-slate',
  danger: 'spine-terracotta',
  brass: 'spine-brass',
};

function movementLabel(t: string): string {
  return MOVEMENT_LABELS[t] ?? t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/* ═══════════════════════ Item form ═══════════════════════ */

interface ItemFormState {
  name: string;
  authorOrBrand: string;
  sku: string;
  barcode: string;
  reference: string;
  coverPhotoUrl: string;
  productType: string;
  categoryId: string;
  supplierId: string;
  costPrice: string;
  sellingPrice: string;
  priceBishop: string;
  priceSonsOfProphet: string;
  pricePastorDeji: string;
  reorderLevel: string;
  quantityShop: string;
  quantityWarehouse: string;
}

const EMPTY_FORM: ItemFormState = {
  name: '',
  authorOrBrand: '',
  sku: '',
  barcode: '',
  reference: '',
  coverPhotoUrl: '',
  productType: 'bishop_books',
  categoryId: '',
  supplierId: '',
  costPrice: '',
  sellingPrice: '',
  priceBishop: '',
  priceSonsOfProphet: '',
  pricePastorDeji: '',
  reorderLevel: '0',
  quantityShop: '0',
  quantityWarehouse: '0',
};

function toForm(p: Product): ItemFormState {
  return {
    name: p.name,
    authorOrBrand: p.authorOrBrand ?? '',
    sku: p.sku ?? '',
    barcode: p.barcode ?? '',
    reference: p.reference ?? '',
    coverPhotoUrl: p.coverPhotoUrl ?? '',
    productType: p.productType,
    categoryId: p.categoryId ?? '',
    supplierId: p.supplierId ?? '',
    costPrice: String(p.costPrice ?? ''),
    sellingPrice: String(p.sellingPrice),
    priceBishop: p.priceBishop == null ? '' : String(p.priceBishop),
    priceSonsOfProphet: p.priceSonsOfProphet == null ? '' : String(p.priceSonsOfProphet),
    pricePastorDeji: p.pricePastorDeji == null ? '' : String(p.pricePastorDeji),
    reorderLevel: String(p.reorderLevel),
    quantityShop: String(p.quantityShop),
    quantityWarehouse: String(p.quantityWarehouse),
  };
}

/* Margin % shown to managers/admins on the product card. */
function marginPct(p: Product, canViewCost: boolean): number | null {
  if (!canViewCost || p.sellingPrice <= 0) return null;
  const cost = p.costPrice ?? 0;
  return Math.round(((p.sellingPrice - cost) / p.sellingPrice) * 100);
}

/* Compact read-only tier-price strip for the product card.
   Only shows tiers that differ from the standard price — a blank tier
   falls back to standard at sale time, so equal tiers are noise. */
function TierStrip({ p }: { p: Product }) {
  const tiers = [
    { label: 'Bishop', value: p.priceBishop },
    { label: 'S.P.', value: p.priceSonsOfProphet },
    { label: 'Deji', value: p.pricePastorDeji },
  ].filter(
    (t): t is { label: string; value: number } =>
      t.value != null && t.value !== p.sellingPrice
  );
  if (tiers.length === 0) return null;
  return (
    <p className="tnum mt-0.5 text-[11px] font-semibold text-[var(--ink-muted)]">
      {tiers.map((t) => `${t.label} ${formatMoney(t.value)}`).join(' · ')}
    </p>
  );
}

/* ── Sort button (module scope: not recreated during render) ── */
function SortButton({
  k,
  label,
  sortKey,
  sortDir,
  onCycle,
}: {
  k: SortKey;
  label: string;
  sortKey: SortKey;
  sortDir: 'asc' | 'desc';
  onCycle: (k: SortKey) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onCycle(k)}
      className={`inline-flex min-h-[44px] items-center gap-1 rounded-full px-3 text-sm font-semibold transition ${
        sortKey === k
          ? 'bg-[var(--wine-tint)] text-[var(--wine)]'
          : 'text-[var(--ink-muted)] hover:bg-[var(--surface-alt)]'
      }`}
      aria-label={`Sort by ${label}${sortKey === k ? (sortDir === 'asc' ? ', ascending' : ', descending') : ''}`}
    >
      {label}
      {sortKey === k && (
        <Icon name={sortDir === 'asc' ? 'arrow_upward' : 'arrow_downward'} size={16} />
      )}
    </button>
  );
}

/* ── Row actions (module scope) ── */
function ItemActions({
  p,
  onMovements,
  onAdjust,
  onTransfer,
  onEdit,
  onArchive,
  onRestore,
}: {
  p: Product;
  onMovements: (p: Product) => void;
  onAdjust: (p: Product) => void;
  onTransfer: (p: Product) => void;
  onEdit: (p: Product) => void;
  onArchive: (p: Product) => void;
  onRestore: (p: Product) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => onMovements(p)}
        aria-label={`Stock history for ${p.name}`}
        title="Stock history"
        className="flex h-11 w-11 items-center justify-center rounded-xl text-[var(--ink-muted)] transition hover:bg-[var(--wine-tint)] hover:text-[var(--wine)]"
      >
        <Icon name="history" size={20} />
      </button>
      <button
        type="button"
        onClick={() => onTransfer(p)}
        aria-label={`Move stock for ${p.name}`}
        title="Move between shop & warehouse"
        className="flex h-11 w-11 items-center justify-center rounded-xl text-[var(--ink-muted)] transition hover:bg-[var(--wine-tint)] hover:text-[var(--wine)]"
      >
        <Icon name="swap_horiz" size={20} />
      </button>
      <button
        type="button"
        onClick={() => onAdjust(p)}
        aria-label={`Adjust stock for ${p.name}`}
        title="Adjust stock"
        className="flex h-11 w-11 items-center justify-center rounded-xl text-[var(--ink-muted)] transition hover:bg-[var(--wine-tint)] hover:text-[var(--wine)]"
      >
        <Icon name="tune" size={20} />
      </button>
      <button
        type="button"
        onClick={() => onEdit(p)}
        aria-label={`Edit ${p.name}`}
        title="Edit"
        className="flex h-11 w-11 items-center justify-center rounded-xl text-[var(--ink-muted)] transition hover:bg-[var(--wine-tint)] hover:text-[var(--wine)]"
      >
        <Icon name="edit" size={20} />
      </button>
      {p.active ? (
        <button
          type="button"
          onClick={() => onArchive(p)}
          aria-label={`Archive ${p.name}`}
          title="Archive"
          className="flex h-11 w-11 items-center justify-center rounded-xl text-[var(--ink-muted)] transition hover:bg-[var(--danger-bg)] hover:text-[var(--danger)]"
        >
          <Icon name="archive" size={20} />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => onRestore(p)}
          aria-label={`Restore ${p.name}`}
          title="Restore"
          className="flex h-11 w-11 items-center justify-center rounded-xl text-[var(--success)] transition hover:bg-[var(--success-bg)]"
        >
          <Icon name="unarchive" size={20} />
        </button>
      )}
    </div>
  );
}

/* ── Ledger row for a single stock movement (drawer + history tab) ── */
function MovementRow({ m, productName }: { m: Movement; productName?: string }) {
  const tone = MOVEMENT_TONES[m.movementType] ?? 'slate';
  const positive = m.quantityChange >= 0;
  return (
    <li className={`spine-card ${SPINE_FOR_STAMP[tone]} p-4`}>
      <div className="flex items-start gap-3">
        <span
          className={`tnum shrink-0 pt-0.5 text-lg font-bold ${
            positive ? 'text-[var(--olive)]' : 'text-[var(--danger)]'
          }`}
        >
          {positive ? '+' : ''}{m.quantityChange}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <StampBadge tone={tone}>{movementLabel(m.movementType)}</StampBadge>
            {productName && (
              <span className="truncate text-sm font-bold text-[var(--ink)]">{productName}</span>
            )}
          </div>
          {m.notes && <p className="mt-1.5 text-sm text-[var(--ink-muted)]">{m.notes}</p>}
          <p className="mt-1 text-xs text-[var(--ink-muted)]">
            {m.createdByName ?? 'System'} · {new Date(m.createdAt).toLocaleString('en-GH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
      </div>
    </li>
  );
}

/* ── Chapter tabs ── */
const TABS = [
  { id: 'products', chapter: 'One', label: 'Products', icon: 'inventory_2' },
  { id: 'low', chapter: 'Two', label: 'Low stock', icon: 'warning' },
  { id: 'history', chapter: 'Three', label: 'Stock history', icon: 'history' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function InventoryClient({ user }: { user: SessionUser }) {
  const canViewCost = user.role !== 'cashier';
  const searchParams = useSearchParams();

  /* Chapter tabs — the Low stock tab drives the same server-side
     low-stock filter the old toggle used. */
  const [activeTab, setActiveTab] = useState<TabId>(() =>
    searchParams.get('filter') === 'low' ? 'low' : 'products'
  );
  const lowStockOnly = activeTab === 'low';

  /* Filters */
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const debouncedSearch = useDebounce(search, 300);

  /* Data */
  const [items, setItems] = useState<Product[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  /* Stock-history ledger (aggregated from the per-item movements endpoint) */
  const [historyItems, setHistoryItems] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  /* Sheets / dialogs */
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<ItemFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [formBusy, setFormBusy] = useState(false);

  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustTarget, setAdjustTarget] = useState<Product | null>(null);
  const [adjustChange, setAdjustChange] = useState('');
  const [adjustType, setAdjustType] = useState('adjustment');
  const [adjustNotes, setAdjustNotes] = useState('');
  const [adjustBusy, setAdjustBusy] = useState(false);

  const [transferOpen, setTransferOpen] = useState(false);
  const [transferTarget, setTransferTarget] = useState<Product | null>(null);
  const [transferQty, setTransferQty] = useState('');
  const [transferFrom, setTransferFrom] = useState<'warehouse' | 'shop'>('warehouse');
  const [transferNotes, setTransferNotes] = useState('');
  const [transferBusy, setTransferBusy] = useState(false);

  const [archiveTarget, setArchiveTarget] = useState<Product | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<Product | null>(null);
  const [busy, setBusy] = useState(false);

  const [movementsOpen, setMovementsOpen] = useState(false);
  const [movementsTarget, setMovementsTarget] = useState<Product | null>(null);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [movementsLoading, setMovementsLoading] = useState(false);

  /* ── Fetch ── */
  const buildUrl = useCallback(
    (after?: string | null) => {
      const params = new URLSearchParams({ limit: '50' });
      if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());
      if (categoryId) params.set('categoryId', categoryId);
      if (lowStockOnly) params.set('lowStock', 'true');
      if (showArchived) params.set('includeArchived', 'true');
      if (after) params.set('cursor', after);
      return `/api/v1/products?${params}`;
    },
    [debouncedSearch, categoryId, lowStockOnly, showArchived]
  );

  const fetchItems = useCallback(
    async (after?: string | null) => {
      if (after) setLoadingMore(true);
      else {
        setLoading(true);
        setError(null);
      }
      try {
        const data = await api<{ items: Product[]; nextCursor: string | null }>(
          buildUrl(after ?? undefined)
        );
        setItems((prev) => (after ? [...prev, ...data.items] : data.items));
        setCursor(data.nextCursor);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load items.');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [buildUrl]
  );

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  useEffect(() => {
    api<Category[]>('/api/v1/categories?limit=200')
      .then((d) => setCategories(Array.isArray(d) ? d : []))
      .catch(() => {});
    api<{ items: Supplier[] }>('/api/v1/suppliers?limit=200')
      .then((d) => setSuppliers(d.items ?? []))
      .catch(() => {});
  }, []);

  /* ── Stock-history ledger: same per-item endpoint, merged newest-first ── */
  useEffect(() => {
    if (activeTab !== 'history') return;
    if (items.length === 0) {
      setHistoryItems([]);
      return;
    }
    let cancelled = false;
    setHistoryLoading(true);
    const targets = items.slice(0, 30);
    Promise.all(
      targets.map((p) =>
        api<{ items: Movement[] }>(`/api/v1/products/${p.id}/movements?limit=50`)
          .then((d) => (d.items ?? []).map((m) => ({ ...m, productName: p.name })))
          .catch(() => [] as HistoryEntry[])
      )
    ).then((lists) => {
      if (cancelled) return;
      const merged = lists
        .flat()
        .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
        .slice(0, 120);
      setHistoryItems(merged);
      setHistoryLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [activeTab, items]);

  /* ── Sorting (client-side) ── */
  const sorted = useMemo(() => {
    const arr = [...items];
    const dir = sortDir === 'asc' ? 1 : -1;
    arr.sort((a, b) => {
      if (sortKey === 'name') return a.name.localeCompare(b.name) * dir;
      if (sortKey === 'price') return (a.sellingPrice - b.sellingPrice) * dir;
      return (a.quantityOnHand - b.quantityOnHand) * dir;
    });
    return arr;
  }, [items, sortKey, sortDir]);

  const isLow = (p: Product) => p.quantityOnHand <= p.reorderLevel;

  /* Low-stock count for the tab badge: exact when the server filter is on,
     page-local otherwise. */
  const lowCount = lowStockOnly ? items.length : items.filter(isLow).length;
  const lowCountSuffix = cursor ? '+' : '';

  /* ── Form actions ── */
  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setFormOpen(true);
  };

  const openEdit = (p: Product) => {
    setEditing(p);
    setForm(toForm(p));
    setFormError(null);
    setFormOpen(true);
  };

  const set = (k: keyof ItemFormState) => (v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  const submitForm = async () => {
    if (!form.name.trim()) {
      setFormError('Item name is required.');
      return;
    }
    const selling = parseFloat(form.sellingPrice);
    if (Number.isNaN(selling) || selling < 0) {
      setFormError('Selling price must be a valid non-negative number.');
      return;
    }
    /* Tier prices are optional; blank means "fall back to standard". */
    const badTier = (
      [
        ['Bishop price', form.priceBishop],
        ['Sons of the Prophet price', form.priceSonsOfProphet],
        ['Pastor Deji price', form.pricePastorDeji],
      ] as const
    ).find(([, raw]) => {
      const t = raw.trim();
      return t !== '' && (Number.isNaN(parseFloat(t)) || parseFloat(t) < 0);
    });
    if (badTier) {
      setFormError(`${badTier[0]} must be a valid non-negative number, or left blank.`);
      return;
    }
    const tierOrNull = (raw: string): number | null =>
      raw.trim() === '' ? null : parseFloat(raw);
    setFormBusy(true);
    setFormError(null);
    try {
      const payload = {
        name: form.name.trim(),
        authorOrBrand: form.authorOrBrand.trim() || null,
        sku: form.sku.trim() || null,
        barcode: form.barcode.trim() || null,
        reference: form.reference.trim().slice(0, 40) || null,
        coverPhotoUrl: form.coverPhotoUrl || null,
        productType: form.productType,
        categoryId: form.categoryId || null,
        supplierId: form.supplierId || null,
        costPrice: Math.max(0, parseFloat(form.costPrice) || 0),
        sellingPrice: selling,
        priceBishop: tierOrNull(form.priceBishop),
        priceSonsOfProphet: tierOrNull(form.priceSonsOfProphet),
        pricePastorDeji: tierOrNull(form.pricePastorDeji),
        reorderLevel: Math.max(0, parseInt(form.reorderLevel, 10) || 0),
        ...(editing
          ? {}
          : {
              quantityShop: Math.max(0, parseInt(form.quantityShop, 10) || 0),
              quantityWarehouse: Math.max(0, parseInt(form.quantityWarehouse, 10) || 0),
            }),
      };
      if (editing) {
        await api(`/api/v1/products/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        toast.success('Item updated.');
      } else {
        await api('/api/v1/products', { method: 'POST', body: JSON.stringify(payload) });
        toast.success('Item added.');
      }
      setFormOpen(false);
      fetchItems();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Save failed.');
    } finally {
      setFormBusy(false);
    }
  };

  /* ── Transfer stock (warehouse <-> shop) ── */
  const openTransfer = (p: Product) => {
    setTransferTarget(p);
    setTransferQty('');
    setTransferFrom(p.quantityWarehouse > 0 ? 'warehouse' : 'shop');
    setTransferNotes('');
    setTransferOpen(true);
  };

  const submitTransfer = async () => {
    if (!transferTarget) return;
    const qty = parseInt(transferQty, 10);
    if (Number.isNaN(qty) || qty <= 0) {
      toast.error('Enter a quantity to move.');
      return;
    }
    const to = transferFrom === 'warehouse' ? 'shop' : 'warehouse';
    setTransferBusy(true);
    try {
      await api(`/api/v1/products/${transferTarget.id}/transfer`, {
        method: 'POST',
        body: JSON.stringify({
          quantity: qty,
          from: transferFrom,
          to,
          notes: transferNotes.trim() || undefined,
        }),
      });
      toast.success(`Moved ${qty} from ${transferFrom} to ${to}.`);
      setTransferOpen(false);
      fetchItems();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Transfer failed.');
    } finally {
      setTransferBusy(false);
    }
  };

  /* ── Adjust stock ── */
  const openAdjust = (p: Product) => {
    setAdjustTarget(p);
    setAdjustChange('');
    setAdjustType('adjustment');
    setAdjustNotes('');
    setAdjustOpen(true);
  };

  const submitAdjust = async () => {
    if (!adjustTarget) return;
    const change = parseInt(adjustChange, 10);
    if (Number.isNaN(change) || change === 0) {
      toast.error('Enter a non-zero quantity change.');
      return;
    }
    setAdjustBusy(true);
    try {
      await api(`/api/v1/products/${adjustTarget.id}/adjust`, {
        method: 'POST',
        body: JSON.stringify({
          change,
          type: adjustType,
          notes: adjustNotes.trim() || undefined,
        }),
      });
      toast.success(
        `Stock ${change > 0 ? 'increased' : 'decreased'} by ${Math.abs(change)}.`
      );
      setAdjustOpen(false);
      fetchItems();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Adjustment failed.');
    } finally {
      setAdjustBusy(false);
    }
  };

  /* ── Archive / restore ── */
  const confirmArchive = async () => {
    if (!archiveTarget) return;
    setBusy(true);
    try {
      await api(`/api/v1/products/${archiveTarget.id}`, { method: 'DELETE' });
      toast.success(`"${archiveTarget.name}" archived.`);
      setArchiveTarget(null);
      fetchItems();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Archive failed.');
    } finally {
      setBusy(false);
    }
  };

  const confirmRestore = async () => {
    if (!restoreTarget) return;
    setBusy(true);
    try {
      await api(`/api/v1/products/${restoreTarget.id}/restore`, { method: 'POST' });
      toast.success(`"${restoreTarget.name}" restored.`);
      setRestoreTarget(null);
      fetchItems();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Restore failed.');
    } finally {
      setBusy(false);
    }
  };

  /* ── Movements ── */
  const openMovements = async (p: Product) => {
    setMovementsTarget(p);
    setMovementsOpen(true);
    setMovementsLoading(true);
    try {
      const data = await api<{ items: Movement[] }>(
        `/api/v1/products/${p.id}/movements?limit=50`
      );
      setMovements(data.items ?? []);
    } catch {
      setMovements([]);
    } finally {
      setMovementsLoading(false);
    }
  };

  /* ── CSV export ── */
  const exportCsv = () => {
    const header = ['Name', 'SKU', 'Category', 'Type', 'Cost', 'Price', 'Stock', 'Reorder level', 'Active'];
    const rows = items.map((p) =>
      [
        p.name,
        p.sku ?? '',
        p.categoryName ?? '',
        productTypeLabel(p.productType),
        canViewCost ? String(p.costPrice ?? '') : '',
        String(p.sellingPrice),
        String(p.quantityOnHand),
        String(p.reorderLevel),
        p.active ? 'yes' : 'no',
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(',')
    );
    const blob = new Blob([[header.join(','), ...rows].join('\n')], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inventory-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${items.length} items to CSV.`);
  };

  const cycleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  /* Transfer movement preview (presentation only) */
  const transferQtyNum = parseInt(transferQty, 10);
  const transferQtyValid = !Number.isNaN(transferQtyNum) && transferQtyNum > 0;
  const transferFromStock =
    transferFrom === 'warehouse'
      ? transferTarget?.quantityWarehouse ?? 0
      : transferTarget?.quantityShop ?? 0;
  const transferToStock =
    transferFrom === 'warehouse'
      ? transferTarget?.quantityShop ?? 0
      : transferTarget?.quantityWarehouse ?? 0;
  const transferTo = transferFrom === 'warehouse' ? 'shop' : 'warehouse';

  /* Live margin preview in the pricing section */
  const formSellNum = parseFloat(form.sellingPrice);
  const formCostNum = parseFloat(form.costPrice);
  const formMargin =
    !Number.isNaN(formSellNum) && formSellNum > 0 && canViewCost
      ? Math.round(((formSellNum - (Number.isNaN(formCostNum) ? 0 : formCostNum)) / formSellNum) * 100)
      : null;

  return (
    <motion.div variants={listVariants} initial="hidden" animate="show">
      <ChapterHeader
        eyebrow="Stockroom"
        title="Inventory"
        action={
          <div className="flex flex-col gap-2 sm:flex-row">
            <SecondaryButton onClick={exportCsv} disabled={items.length === 0}>
              <Icon name="download" size={20} /> Export CSV
            </SecondaryButton>
            <PrimaryButton onClick={openCreate}>
              <Icon name="add" size={20} /> Add item
            </PrimaryButton>
          </div>
        }
      />

      {/* ── Chapter tabs ── */}
      <motion.div
        variants={riseVariants}
        role="tablist"
        aria-label="Inventory sections"
        className="mb-5 grid grid-cols-3 gap-2"
      >
        {TABS.map((t) => {
          const selected = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setActiveTab(t.id)}
              className={`min-h-[68px] rounded-2xl border-2 px-2.5 py-2 text-left transition active:scale-[0.98] ${
                selected
                  ? 'border-[var(--wine)] bg-[var(--wine-tint)] shadow-[var(--shadow)]'
                  : 'border-[var(--border)] bg-[var(--surface)] hover:border-[var(--wine)]/40'
              }`}
            >
              <span className="chapter-eyebrow block truncate text-[10px]">
                Chapter {t.chapter}
              </span>
              <span className="mt-1 flex items-center gap-1.5">
                <Icon
                  name={t.icon}
                  size={18}
                  className={selected ? 'text-[var(--wine)]' : 'text-[var(--ink-muted)]'}
                />
                <span className="font-display min-w-0 truncate text-[16px] leading-tight text-[var(--ink)]">
                  {t.label}
                </span>
              </span>
              {t.id === 'low' && (
                <span className="mt-1.5 block">
                  <StampBadge tone="gold">
                    <span className="tnum">
                      {lowCount}
                      {lowCountSuffix}
                    </span>
                  </StampBadge>
                </span>
              )}
            </button>
          );
        })}
      </motion.div>

      {activeTab !== 'history' ? (
        <>
          {/* Filters */}
          <motion.div
            variants={riseVariants}
            className="mb-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow)]"
          >
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="relative flex-1">
                <Icon
                  name="search"
                  size={20}
                  className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-[var(--ink-muted)]"
                />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name, SKU, author…"
                  aria-label="Search items"
                  className={`${inputClass} pl-11`}
                />
              </div>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                aria-label="Filter by category"
                className={`${inputClass} lg:w-52`}
              >
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowArchived((v) => !v)}
                aria-pressed={showArchived}
                className={`inline-flex min-h-[44px] items-center gap-2 rounded-full border px-4 text-sm font-semibold transition ${
                  showArchived
                    ? 'border-[var(--wine)] bg-[var(--wine-tint)] text-[var(--wine)]'
                    : 'border-[var(--border-input)] text-[var(--ink-muted)] hover:bg-[var(--surface-alt)]'
                }`}
              >
                <Icon name="archive" size={18} /> Show archived
              </button>
              <div className="ml-auto flex items-center gap-1">
                <span className="mr-1 text-xs font-semibold text-[var(--ink-muted)] uppercase tracking-wide">
                  Sort
                </span>
                <SortButton k="name" label="Name" sortKey={sortKey} sortDir={sortDir} onCycle={cycleSort} />
                <SortButton k="price" label="Price" sortKey={sortKey} sortDir={sortDir} onCycle={cycleSort} />
                <SortButton k="stock" label="Stock" sortKey={sortKey} sortDir={sortDir} onCycle={cycleSort} />
              </div>
            </div>
          </motion.div>

          {/* Content */}
          {loading ? (
            <SkeletonRows rows={8} />
          ) : error ? (
            <ErrorState message={error} onRetry={() => fetchItems()} />
          ) : sorted.length === 0 ? (
            <EmptyState
              icon="inventory_2"
              title={activeTab === 'low' ? 'No low-stock items' : 'No items found'}
              body={
                activeTab === 'low'
                  ? 'Everything is above its reorder level. Nicely stocked.'
                  : search || categoryId
                    ? 'Try clearing your filters, or add a new item to get started.'
                    : 'Your catalogue is empty. Add your first item to start selling.'
              }
              action={<PrimaryButton onClick={openCreate}><Icon name="add" size={20} /> Add item</PrimaryButton>}
            />
          ) : (
            <>
              <p className="tnum mb-3 text-xs font-semibold text-[var(--ink-muted)]">
                {sorted.length} item{sorted.length === 1 ? '' : 's'} in view
                {cursor ? ' — more below' : ''}
              </p>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {sorted.map((p, i) => {
                  const margin = marginPct(p, canViewCost);
                  const out = p.quantityOnHand === 0;
                  const low = isLow(p) && p.active && !out;
                  const spine = !p.active ? 'spine-slate' : out ? 'spine-terracotta' : low ? 'spine-gold' : 'spine-wine';
                  return (
                    <motion.article
                      key={p.id}
                      variants={riseVariants}
                      custom={i}
                      className={`spine-card ${spine} p-4 ${p.active ? '' : 'opacity-60'}`}
                    >
                      <div className="flex gap-3">
                        {/* Cover thumbnail */}
                        <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--wine-tint)]">
                          {p.coverPhotoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.coverPhotoUrl} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <Icon name="inventory_2" size={28} className="text-[var(--wine)]/60" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-display text-[17px] leading-snug text-[var(--ink)]">
                              {p.name}
                            </p>
                            {!p.active ? (
                              <StampBadge tone="slate">Archived</StampBadge>
                            ) : out ? (
                              <StampBadge tone="danger">Out</StampBadge>
                            ) : low ? (
                              <StampBadge tone="gold">Low</StampBadge>
                            ) : null}
                          </div>
                          <p className="mt-0.5 truncate font-mono text-xs text-[var(--ink-muted)]">
                            {p.barcode ?? p.sku ?? 'No barcode'}
                          </p>
                          {p.authorOrBrand && (
                            <p className="truncate text-xs text-[var(--ink-muted)]">{p.authorOrBrand}</p>
                          )}
                          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5">
                            <StampBadge tone="slate">{productTypeLabel(p.productType)}</StampBadge>
                            {margin != null && (
                              <span className="tnum text-xs font-bold text-[var(--olive)]">
                                {margin}% margin
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 flex items-end justify-between gap-3 border-t border-[var(--border)] pt-3">
                        <div>
                          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--ink-muted)]">
                            Price
                          </p>
                          <p className="tnum text-lg font-bold text-[var(--ink)]">
                            {formatMoney(p.sellingPrice)}
                          </p>
                          <TierStrip p={p} />
                          {canViewCost && (
                            <p className="tnum text-xs text-[var(--ink-muted)]">
                              Cost {formatMoney(p.costPrice ?? 0)}
                            </p>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--ink-muted)]">
                            In stock
                          </p>
                          <p className="tnum text-lg font-bold text-[var(--ink)]">
                            {p.quantityOnHand}
                          </p>
                          <p className="mt-1 flex justify-end gap-1.5">
                            <span className="tnum rounded-full bg-[var(--surface-alt)] px-2.5 py-1 text-[11px] font-bold text-[var(--ink-muted)]">
                              {p.quantityShop} shop
                            </span>
                            <span className="tnum rounded-full bg-[var(--surface-alt)] px-2.5 py-1 text-[11px] font-bold text-[var(--ink-muted)]">
                              {p.quantityWarehouse} whse
                            </span>
                          </p>
                        </div>
                      </div>
                      <div className="mt-1 flex justify-end border-t border-[var(--border)] pt-1">
                        <ItemActions
                          p={p}
                          onMovements={openMovements}
                          onAdjust={openAdjust}
                          onTransfer={openTransfer}
                          onEdit={openEdit}
                          onArchive={setArchiveTarget}
                          onRestore={setRestoreTarget}
                        />
                      </div>
                    </motion.article>
                  );
                })}
              </div>

              {cursor && <LoadMore onLoad={() => fetchItems(cursor)} loading={loadingMore} />}
            </>
          )}
        </>
      ) : (
        <>
          {/* ── Chapter Three — Stock history ledger ── */}
          <p className="mb-3 text-sm text-[var(--ink-muted)]">
            Latest movements across the items in view, newest first.
          </p>
          {loading || historyLoading ? (
            <SkeletonRows rows={6} />
          ) : historyItems.length === 0 ? (
            <EmptyState
              icon="history"
              title="No movements yet"
              body="Stock changes, transfers, purchases and sales will appear here."
            />
          ) : (
            <ul className="flex flex-col gap-2.5">
              {historyItems.map((m) => (
                <MovementRow key={m.id} m={m} productName={m.productName} />
              ))}
            </ul>
          )}
        </>
      )}

      {/* ── Add / Edit sheet ── */}
      <Sheet open={formOpen} onClose={() => setFormOpen(false)} title={editing ? 'Edit item' : 'Add item'}>
        <ChapterHeader
          eyebrow={editing ? 'Update catalogue entry' : 'New catalogue entry'}
          title={editing ? 'Edit item' : 'Add item'}
        />
        <div className="flex flex-col gap-4">
          {formError && (
            <p role="alert" className="rounded-lg bg-[var(--danger-bg)] px-4 py-3 text-sm font-semibold text-[var(--danger)]">
              {formError}
            </p>
          )}

          <p className="chapter-eyebrow">Identity</p>
          <div className="flex gap-4">
            <div className="min-w-0 flex-1">
              <Field label="Name" htmlFor="f-name">
                <input id="f-name" className={inputClass} value={form.name} onChange={(e) => set('name')(e.target.value)} placeholder="Holy Bible — KJV" />
              </Field>
            </div>
            {/* Cover photo — passport-style, top right */}
            <div className="shrink-0">
              <span className="mb-1.5 block text-[13px] font-bold text-[var(--ink)]">Cover photo</span>
              <label
                htmlFor="f-photo"
                className="relative grid h-28 w-24 cursor-pointer place-items-center overflow-hidden rounded-xl border-2 border-dashed border-[var(--border-input)] bg-[var(--surface-alt)] transition hover:border-[var(--wine)]"
              >
                {form.coverPhotoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={form.coverPhotoUrl} alt="Cover preview" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex flex-col items-center gap-1 px-2 text-center">
                    <Icon name="add_a_photo" size={24} className="text-[var(--ink-muted)]" />
                    <span className="text-[11px] font-semibold leading-tight text-[var(--ink-muted)]">Tap to add photo</span>
                  </span>
                )}
                <input
                  id="f-photo"
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 800 * 1024) {
                      setFormError('Photo must be under 800KB. Try a smaller image.');
                      return;
                    }
                    const reader = new FileReader();
                    reader.onload = () => setForm((f) => ({ ...f, coverPhotoUrl: String(reader.result ?? '') }));
                    reader.readAsDataURL(file);
                  }}
                />
              </label>
              {form.coverPhotoUrl && (
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, coverPhotoUrl: '' }))}
                  className="mt-1 min-h-[44px] w-full text-center text-[12px] font-semibold text-[var(--danger)]"
                >
                  Remove
                </button>
              )}
            </div>
          </div>
          <Field label="Author / brand" htmlFor="f-author">
            <input id="f-author" className={inputClass} value={form.authorOrBrand} onChange={(e) => set('authorOrBrand')(e.target.value)} placeholder="e.g. Thomas Nelson" />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="SKU" htmlFor="f-sku">
              <input id="f-sku" className={inputClass} value={form.sku} onChange={(e) => set('sku')(e.target.value)} placeholder="BK-001" />
            </Field>
            <Field label="Barcode" htmlFor="f-barcode" hint="Scan or type the barcode for quick restocking.">
              <input id="f-barcode" className={inputClass} value={form.barcode} onChange={(e) => set('barcode')(e.target.value)} placeholder="e.g. 9780310422353" inputMode="numeric" />
            </Field>
          </div>
          <Field label="Reference (optional)" htmlFor="f-ref" hint="Internal reference — e.g. a publisher or supplier code.">
            <input id="f-ref" className={inputClass} value={form.reference} onChange={(e) => set('reference')(e.target.value)} placeholder="e.g. NEL/KJV/REF-01" maxLength={40} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Type" htmlFor="f-type">
              <select id="f-type" className={inputClass} value={form.productType} onChange={(e) => set('productType')(e.target.value)}>
                {PRODUCT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Category" htmlFor="f-cat">
              <select id="f-cat" className={inputClass} value={form.categoryId} onChange={(e) => set('categoryId')(e.target.value)}>
                <option value="">Uncategorized</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Supplier" htmlFor="f-sup">
            <select id="f-sup" className={inputClass} value={form.supplierId} onChange={(e) => set('supplierId')(e.target.value)}>
              <option value="">None</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </Field>

          <p className="chapter-eyebrow mt-2">Price list</p>
          <div className="grid grid-cols-2 gap-4">
            {canViewCost ? (
              <Field label="Cost price" htmlFor="f-cost">
                <input id="f-cost" className={inputClass} inputMode="decimal" value={form.costPrice} onChange={(e) => set('costPrice')(e.target.value)} placeholder="0.00" />
              </Field>
            ) : null}
            <Field label="Standard price" htmlFor="f-price" hint="Used whenever a tier price is left blank.">
              <input id="f-price" className={inputClass} inputMode="decimal" value={form.sellingPrice} onChange={(e) => set('sellingPrice')(e.target.value)} placeholder="0.00" />
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Bishop price" htmlFor="f-p-bishop" hint="Blank = standard price.">
              <input id="f-p-bishop" className={inputClass} inputMode="decimal" value={form.priceBishop} onChange={(e) => set('priceBishop')(e.target.value)} placeholder="0.00" />
            </Field>
            <Field label="Sons of the Prophet price" htmlFor="f-p-sop" hint="Blank = standard price.">
              <input id="f-p-sop" className={inputClass} inputMode="decimal" value={form.priceSonsOfProphet} onChange={(e) => set('priceSonsOfProphet')(e.target.value)} placeholder="0.00" />
            </Field>
            <Field label="Pastor Deji price" htmlFor="f-p-deji" hint="Blank = standard price.">
              <input id="f-p-deji" className={inputClass} inputMode="decimal" value={form.pricePastorDeji} onChange={(e) => set('pricePastorDeji')(e.target.value)} placeholder="0.00" />
            </Field>
          </div>
          {formMargin != null && (
            <p className="tnum -mt-2 text-sm font-bold text-[var(--olive)]">
              Margin ≈ {formMargin}%
            </p>
          )}

          <p className="chapter-eyebrow mt-2">Stock</p>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Reorder level" htmlFor="f-reorder" hint="Low-stock alert at or below this quantity.">
              <input id="f-reorder" className={inputClass} inputMode="numeric" value={form.reorderLevel} onChange={(e) => set('reorderLevel')(e.target.value)} />
            </Field>
            {editing ? (
              <Field label="Stock (shop / warehouse)">
                <div className={`${inputClass} flex items-center justify-center gap-2 bg-[var(--surface-alt)] font-bold tnum`}>
                  <span>{editing.quantityShop} shop</span>
                  <span className="text-[var(--ink-muted)]">·</span>
                  <span>{editing.quantityWarehouse} whse</span>
                </div>
              </Field>
            ) : (
              <>
                <Field label="Opening stock — shop" htmlFor="f-qty-shop">
                  <input id="f-qty-shop" className={inputClass} inputMode="numeric" value={form.quantityShop} onChange={(e) => set('quantityShop')(e.target.value)} placeholder="0" />
                </Field>
                <Field label="Opening stock — warehouse" htmlFor="f-qty-whse">
                  <input id="f-qty-whse" className={inputClass} inputMode="numeric" value={form.quantityWarehouse} onChange={(e) => set('quantityWarehouse')(e.target.value)} placeholder="0" />
                </Field>
              </>
            )}
          </div>
          <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <SecondaryButton onClick={() => setFormOpen(false)} disabled={formBusy}>Cancel</SecondaryButton>
            <PrimaryButton onClick={submitForm} disabled={formBusy}>
              {formBusy ? 'Saving…' : editing ? 'Save changes' : 'Add item'}
            </PrimaryButton>
          </div>
        </div>
      </Sheet>

      {/* ── Adjust stock dialog ── */}
      <Modal open={adjustOpen} onClose={() => setAdjustOpen(false)} title={`Adjust stock — ${adjustTarget?.name ?? ''}`}>
        <div className="flex flex-col gap-4">
          <div className="paper-texture flex items-center justify-between rounded-2xl border border-[var(--brass)]/40 px-4 py-3">
            <span className="text-sm font-semibold text-[var(--ink-muted)]">Current stock</span>
            <span className="tnum text-xl font-bold text-[var(--wine)]">{adjustTarget?.quantityOnHand}</span>
          </div>
          <Field label="Quantity change" htmlFor="a-change" hint="Use a negative number to reduce stock, e.g. -3.">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setAdjustChange((v) => String((parseInt(v || '0', 10) || 0) - 1))}
                aria-label="Decrease change by one"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--border-input)] transition hover:border-[var(--wine)] hover:text-[var(--wine)]"
              >
                <Icon name="remove" size={20} />
              </button>
              <input
                id="a-change"
                className={`${inputClass} tnum text-center text-lg font-bold`}
                inputMode="numeric"
                value={adjustChange}
                onChange={(e) => setAdjustChange(e.target.value.replace(/[^-\d]/g, ''))}
                placeholder="+ / -"
              />
              <button
                type="button"
                onClick={() => setAdjustChange((v) => String((parseInt(v || '0', 10) || 0) + 1))}
                aria-label="Increase change by one"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--border-input)] transition hover:border-[var(--wine)] hover:text-[var(--wine)]"
              >
                <Icon name="add" size={20} />
              </button>
            </div>
          </Field>
          <Field label="Type" htmlFor="a-type">
            <select id="a-type" className={inputClass} value={adjustType} onChange={(e) => setAdjustType(e.target.value)}>
              <option value="adjustment">Stock adjustment (recount)</option>
              <option value="damage">Damage / write-off</option>
              <option value="return">Customer return</option>
            </select>
          </Field>
          <Field label="Notes" htmlFor="a-notes">
            <textarea
              id="a-notes"
              className={`${inputClass} min-h-[88px] py-3`}
              value={adjustNotes}
              onChange={(e) => setAdjustNotes(e.target.value)}
              placeholder="Reason for this adjustment…"
              maxLength={1000}
            />
          </Field>
          <div className="mt-1 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <SecondaryButton onClick={() => setAdjustOpen(false)} disabled={adjustBusy}>Cancel</SecondaryButton>
            <PrimaryButton onClick={submitAdjust} disabled={adjustBusy}>
              {adjustBusy ? 'Saving…' : 'Apply adjustment'}
            </PrimaryButton>
          </div>
        </div>
      </Modal>

      {/* ── Transfer stock dialog ── */}
      <Modal open={transferOpen} onClose={() => setTransferOpen(false)} title={`Move stock — ${transferTarget?.name ?? ''}`}>
        <div className="flex flex-col gap-4">
          <Field label="Move from" htmlFor="t-from">
            <div className="grid grid-cols-2 gap-2" id="t-from" role="group" aria-label="Move from">
              {(['warehouse', 'shop'] as const).map((loc) => {
                const selected = transferFrom === loc;
                const stock = loc === 'warehouse'
                  ? transferTarget?.quantityWarehouse ?? 0
                  : transferTarget?.quantityShop ?? 0;
                return (
                  <button
                    key={loc}
                    type="button"
                    onClick={() => setTransferFrom(loc)}
                    aria-pressed={selected}
                    className={`min-h-[76px] rounded-2xl border-2 p-3 text-left transition active:scale-95 ${
                      selected
                        ? 'border-[var(--wine)] bg-[var(--wine-tint)] shadow-[var(--shadow)]'
                        : 'border-[var(--border)] bg-[var(--surface)] hover:border-[var(--wine)]/40'
                    }`}
                  >
                    <span className={`flex items-center gap-2 text-sm font-bold capitalize ${selected ? 'text-[var(--wine)]' : 'text-[var(--ink-muted)]'}`}>
                      <Icon name={loc === 'warehouse' ? 'warehouse' : 'storefront'} size={20} />
                      {loc}
                    </span>
                    <span className="tnum mt-1 block text-2xl font-bold text-[var(--ink)]">{stock}</span>
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
                      in stock
                    </span>
                  </button>
                );
              })}
            </div>
          </Field>
          <p className="-mt-2 flex items-center justify-center gap-2 text-sm font-semibold text-[var(--ink-muted)]">
            <Icon name="arrow_downward" size={18} />
            moving to {transferTo}
          </p>
          <Field label="Quantity to move" htmlFor="t-qty">
            <input
              id="t-qty"
              className={`${inputClass} tnum text-lg font-bold`}
              inputMode="numeric"
              value={transferQty}
              onChange={(e) => setTransferQty(e.target.value)}
              placeholder="e.g. 10"
            />
          </Field>
          {/* Movement preview */}
          <div className="paper-texture rounded-2xl border border-[var(--border)] p-4">
            <p className="chapter-eyebrow">Movement preview</p>
            <div className="mt-2 flex items-center gap-2">
              <div className="flex-1 rounded-xl bg-[var(--surface)] px-3 py-2 text-center">
                <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-muted)] capitalize">
                  {transferFrom}
                </p>
                <p className="tnum text-xl font-bold text-[var(--ink)]">
                  {transferFromStock}
                  <span className="mx-1 text-[var(--ink-muted)]">→</span>
                  {transferQtyValid ? Math.max(0, transferFromStock - transferQtyNum) : '–'}
                </p>
              </div>
              <Icon name="arrow_forward" size={20} className="shrink-0 text-[var(--wine)]" />
              <div className="flex-1 rounded-xl bg-[var(--surface)] px-3 py-2 text-center">
                <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-muted)] capitalize">
                  {transferTo}
                </p>
                <p className="tnum text-xl font-bold text-[var(--olive)]">
                  {transferToStock}
                  <span className="mx-1 text-[var(--ink-muted)]">→</span>
                  {transferQtyValid ? transferToStock + transferQtyNum : '–'}
                </p>
              </div>
            </div>
          </div>
          <Field label="Note (optional)" htmlFor="t-notes">
            <input
              id="t-notes"
              className={inputClass}
              value={transferNotes}
              onChange={(e) => setTransferNotes(e.target.value)}
              placeholder="e.g. Sunday restock"
            />
          </Field>
          <div className="mt-1 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <SecondaryButton onClick={() => setTransferOpen(false)} disabled={transferBusy}>Cancel</SecondaryButton>
            <PrimaryButton onClick={submitTransfer} disabled={transferBusy}>
              {transferBusy ? 'Moving…' : `Move to ${transferTo}`}
            </PrimaryButton>
          </div>
        </div>
      </Modal>

      {/* ── Archive / restore ── */}
      <ConfirmDialog
        open={!!archiveTarget}
        onClose={() => setArchiveTarget(null)}
        onConfirm={confirmArchive}
        title="Archive item?"
        body={<>“{archiveTarget?.name}” will be hidden from sale and search. You can restore it later.</>}
        confirmLabel="Archive"
        danger
        busy={busy}
      />
      <ConfirmDialog
        open={!!restoreTarget}
        onClose={() => setRestoreTarget(null)}
        onConfirm={confirmRestore}
        title="Restore item?"
        body={<>“{restoreTarget?.name}” will be visible in sale and search again.</>}
        confirmLabel="Restore"
        busy={busy}
      />

      {/* ── Movements drawer ── */}
      <Sheet open={movementsOpen} onClose={() => setMovementsOpen(false)} title={`Stock history — ${movementsTarget?.name ?? ''}`}>
        {movementsLoading ? (
          <SkeletonRows rows={5} />
        ) : movements.length === 0 ? (
          <EmptyState icon="history" title="No movements yet" body="Stock changes, purchases and sales will appear here." />
        ) : (
          <ul className="flex flex-col gap-2.5">
            {movements.map((m) => (
              <MovementRow key={m.id} m={m} />
            ))}
          </ul>
        )}
      </Sheet>
    </motion.div>
  );
}
