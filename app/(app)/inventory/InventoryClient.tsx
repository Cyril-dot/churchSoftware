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
  PageHeader,
  PrimaryButton,
  SecondaryButton,
  Badge,
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
  productType: string;
  categoryId: string | null;
  categoryName: string | null;
  sellingPrice: number;
  quantityOnHand: number;
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

interface Movement {
  id: string;
  movement_type: string;
  quantity_change: number;
  unit_cost: number | null;
  reference_type: string | null;
  reference_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
}

type SortKey = 'name' | 'price' | 'stock';

const PRODUCT_TYPES = ['book', 'stationery', 'gift', 'apparel', 'media', 'other'];

const MOVEMENT_TONES: Record<string, 'green' | 'red' | 'gold' | 'blue' | 'gray'> = {
  sale: 'red',
  purchase: 'green',
  adjustment: 'blue',
  damage: 'red',
  return: 'gold',
  void: 'gold',
};

const MOVEMENT_LABELS: Record<string, string> = {
  sale: 'Sale',
  purchase: 'Purchase',
  adjustment: 'Adjustment',
  damage: 'Damage',
  return: 'Return',
  void: 'Voided sale',
};

/* ═══════════════════════ Item form ═══════════════════════ */

interface ItemFormState {
  name: string;
  authorOrBrand: string;
  sku: string;
  productType: string;
  categoryId: string;
  supplierId: string;
  costPrice: string;
  sellingPrice: string;
  reorderLevel: string;
  quantityOnHand: string;
}

const EMPTY_FORM: ItemFormState = {
  name: '',
  authorOrBrand: '',
  sku: '',
  productType: 'book',
  categoryId: '',
  supplierId: '',
  costPrice: '',
  sellingPrice: '',
  reorderLevel: '0',
  quantityOnHand: '0',
};

function toForm(p: Product): ItemFormState {
  return {
    name: p.name,
    authorOrBrand: p.authorOrBrand ?? '',
    sku: p.sku ?? '',
    productType: p.productType,
    categoryId: p.categoryId ?? '',
    supplierId: p.supplierId ?? '',
    costPrice: String(p.costPrice ?? ''),
    sellingPrice: String(p.sellingPrice),
    reorderLevel: String(p.reorderLevel),
    quantityOnHand: String(p.quantityOnHand),
  };
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
      className={`inline-flex min-h-[44px] items-center gap-1 rounded-lg px-3 text-sm font-semibold transition ${
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
  onEdit,
  onArchive,
  onRestore,
}: {
  p: Product;
  onMovements: (p: Product) => void;
  onAdjust: (p: Product) => void;
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
        className="flex h-11 w-11 items-center justify-center rounded-lg text-[var(--ink-muted)] hover:bg-[var(--surface-alt)] hover:text-[var(--ink)]"
      >
        <Icon name="history" size={20} />
      </button>
      <button
        type="button"
        onClick={() => onAdjust(p)}
        aria-label={`Adjust stock for ${p.name}`}
        title="Adjust stock"
        className="flex h-11 w-11 items-center justify-center rounded-lg text-[var(--ink-muted)] hover:bg-[var(--surface-alt)] hover:text-[var(--ink)]"
      >
        <Icon name="tune" size={20} />
      </button>
      <button
        type="button"
        onClick={() => onEdit(p)}
        aria-label={`Edit ${p.name}`}
        title="Edit"
        className="flex h-11 w-11 items-center justify-center rounded-lg text-[var(--ink-muted)] hover:bg-[var(--surface-alt)] hover:text-[var(--ink)]"
      >
        <Icon name="edit" size={20} />
      </button>
      {p.active ? (
        <button
          type="button"
          onClick={() => onArchive(p)}
          aria-label={`Archive ${p.name}`}
          title="Archive"
          className="flex h-11 w-11 items-center justify-center rounded-lg text-[var(--ink-muted)] hover:bg-[var(--danger-bg)] hover:text-[var(--danger)]"
        >
          <Icon name="archive" size={20} />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => onRestore(p)}
          aria-label={`Restore ${p.name}`}
          title="Restore"
          className="flex h-11 w-11 items-center justify-center rounded-lg text-[var(--success)] hover:bg-[var(--success-bg)]"
        >
          <Icon name="unarchive" size={20} />
        </button>
      )}
    </div>
  );
}

export default function InventoryClient({ user }: { user: SessionUser }) {
  const canViewCost = user.role !== 'cashier';
  const searchParams = useSearchParams();

  /* Filters */
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(() => searchParams.get('filter') === 'low');
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
    setFormBusy(true);
    setFormError(null);
    try {
      const payload = {
        name: form.name.trim(),
        authorOrBrand: form.authorOrBrand.trim() || null,
        sku: form.sku.trim() || null,
        productType: form.productType,
        categoryId: form.categoryId || null,
        supplierId: form.supplierId || null,
        costPrice: Math.max(0, parseFloat(form.costPrice) || 0),
        sellingPrice: selling,
        reorderLevel: Math.max(0, parseInt(form.reorderLevel, 10) || 0),
        ...(editing ? {} : { quantityOnHand: Math.max(0, parseInt(form.quantityOnHand, 10) || 0) }),
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
        p.productType,
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

  return (
    <motion.div variants={listVariants} initial="hidden" animate="show">
      <PageHeader
        title="Items"
        subtitle={`${items.length} item${items.length === 1 ? '' : 's'} in view`}
        actions={
          <>
            <SecondaryButton onClick={exportCsv} disabled={items.length === 0}>
              <Icon name="download" size={20} /> Export CSV
            </SecondaryButton>
            <PrimaryButton onClick={openCreate}>
              <Icon name="add" size={20} /> Add item
            </PrimaryButton>
          </>
        }
      />

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
            onClick={() => setLowStockOnly((v) => !v)}
            aria-pressed={lowStockOnly}
            className={`inline-flex min-h-[44px] items-center gap-2 rounded-full border px-4 text-sm font-semibold transition ${
              lowStockOnly
                ? 'border-[var(--warning)] bg-[var(--warning-bg)] text-[var(--warning)]'
                : 'border-[var(--border-input)] text-[var(--ink-muted)] hover:bg-[var(--surface-alt)]'
            }`}
          >
            <Icon name="warning" size={18} /> Low stock only
          </button>
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
          title="No items found"
          body={
            search || categoryId || lowStockOnly
              ? 'Try clearing your filters, or add a new item to get started.'
              : 'Your catalogue is empty. Add your first item to start selling.'
          }
          action={<PrimaryButton onClick={openCreate}><Icon name="add" size={20} /> Add item</PrimaryButton>}
        />
      ) : (
        <>
          {/* Desktop table */}
          <motion.div variants={riseVariants} className="hidden overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)] lg:block">
            <table className="w-full min-w-[760px] text-left text-[15px]">
              <thead>
                <tr className="border-b border-[var(--border)] text-[13px] uppercase tracking-wide text-[var(--ink-muted)]">
                  <th scope="col" className="px-5 py-3.5 font-semibold">Item</th>
                  <th scope="col" className="px-5 py-3.5 font-semibold">SKU</th>
                  <th scope="col" className="px-5 py-3.5 font-semibold">Category</th>
                  {canViewCost && <th scope="col" className="px-5 py-3.5 text-right font-semibold">Cost</th>}
                  <th scope="col" className="px-5 py-3.5 text-right font-semibold">Price</th>
                  <th scope="col" className="px-5 py-3.5 text-right font-semibold">Stock</th>
                  <th scope="col" className="px-5 py-3.5 text-right font-semibold"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((p) => (
                  <tr
                    key={p.id}
                    className={`border-b border-[var(--border)] last:border-0 transition-colors hover:bg-[var(--surface-alt)] ${p.active ? '' : 'opacity-60'}`}
                  >
                    <td className="px-5 py-3.5">
                      <p className="font-bold text-[var(--ink)]">{p.name}</p>
                      {p.authorOrBrand && (
                        <p className="text-xs text-[var(--ink-muted)]">{p.authorOrBrand}</p>
                      )}
                      {!p.active && <Badge tone="gray">Archived</Badge>}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-[var(--ink-muted)]">{p.sku ?? '—'}</td>
                    <td className="px-5 py-3.5 text-sm">{p.categoryName ?? '—'}</td>
                    {canViewCost && (
                      <td className="tnum px-5 py-3.5 text-right text-sm text-[var(--ink-muted)]">
                        {formatMoney(p.costPrice ?? 0)}
                      </td>
                    )}
                    <td className="tnum px-5 py-3.5 text-right font-bold">{formatMoney(p.sellingPrice)}</td>
                    <td className="px-5 py-3.5 text-right">
                      <span className="tnum text-sm font-bold">{p.quantityOnHand}</span>
                      {isLow(p) && p.active && (
                        <span className="ml-2"><Badge tone="gold"><Icon name="warning" size={14} /> Low</Badge></span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex justify-end"><ItemActions p={p} onMovements={openMovements} onAdjust={openAdjust} onEdit={openEdit} onArchive={setArchiveTarget} onRestore={setRestoreTarget} /></div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </motion.div>

          {/* Mobile cards */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:hidden">
            {sorted.map((p, i) => (
              <motion.article
                key={p.id}
                variants={riseVariants}
                custom={i}
                className={`rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow)] ${p.active ? '' : 'opacity-60'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-bold text-[var(--ink)]">{p.name}</p>
                    <p className="text-xs text-[var(--ink-muted)]">
                      {p.sku ?? 'No SKU'}{p.categoryName ? ` · ${p.categoryName}` : ''}
                    </p>
                  </div>
                  {isLow(p) && p.active ? (
                    <Badge tone="gold"><Icon name="warning" size={14} /> Low</Badge>
                  ) : !p.active ? (
                    <Badge tone="gray">Archived</Badge>
                  ) : null}
                </div>
                <div className="mt-3 flex items-end justify-between">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">Price</p>
                    <p className="tnum text-lg font-bold">{formatMoney(p.sellingPrice)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">Stock</p>
                    <p className="tnum text-lg font-bold">{p.quantityOnHand}</p>
                  </div>
                </div>
                <div className="mt-2 flex justify-end border-t border-[var(--border)] pt-1">
                  <ItemActions p={p} onMovements={openMovements} onAdjust={openAdjust} onEdit={openEdit} onArchive={setArchiveTarget} onRestore={setRestoreTarget} />
                </div>
              </motion.article>
            ))}
          </div>

          {cursor && <LoadMore onLoad={() => fetchItems(cursor)} loading={loadingMore} />}
        </>
      )}

      {/* ── Add / Edit sheet ── */}
      <Sheet open={formOpen} onClose={() => setFormOpen(false)} title={editing ? 'Edit item' : 'Add item'}>
        <div className="flex flex-col gap-4">
          {formError && (
            <p role="alert" className="rounded-lg bg-[var(--danger-bg)] px-4 py-3 text-sm font-semibold text-[var(--danger)]">
              {formError}
            </p>
          )}
          <Field label="Name" htmlFor="f-name">
            <input id="f-name" className={inputClass} value={form.name} onChange={(e) => set('name')(e.target.value)} placeholder="Holy Bible — KJV" />
          </Field>
          <Field label="Author / brand" htmlFor="f-author">
            <input id="f-author" className={inputClass} value={form.authorOrBrand} onChange={(e) => set('authorOrBrand')(e.target.value)} placeholder="e.g. Thomas Nelson" />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="SKU" htmlFor="f-sku">
              <input id="f-sku" className={inputClass} value={form.sku} onChange={(e) => set('sku')(e.target.value)} placeholder="BK-001" />
            </Field>
            <Field label="Type" htmlFor="f-type">
              <select id="f-type" className={inputClass} value={form.productType} onChange={(e) => set('productType')(e.target.value)}>
                {PRODUCT_TYPES.map((t) => (
                  <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</option>
                ))}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Category" htmlFor="f-cat">
              <select id="f-cat" className={inputClass} value={form.categoryId} onChange={(e) => set('categoryId')(e.target.value)}>
                <option value="">Uncategorized</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Supplier" htmlFor="f-sup">
              <select id="f-sup" className={inputClass} value={form.supplierId} onChange={(e) => set('supplierId')(e.target.value)}>
                <option value="">None</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {canViewCost ? (
              <Field label="Cost price" htmlFor="f-cost">
                <input id="f-cost" className={inputClass} inputMode="decimal" value={form.costPrice} onChange={(e) => set('costPrice')(e.target.value)} placeholder="0.00" />
              </Field>
            ) : null}
            <Field label="Selling price" htmlFor="f-price">
              <input id="f-price" className={inputClass} inputMode="decimal" value={form.sellingPrice} onChange={(e) => set('sellingPrice')(e.target.value)} placeholder="0.00" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Reorder level" htmlFor="f-reorder" hint="Low-stock alert at or below this quantity.">
              <input id="f-reorder" className={inputClass} inputMode="numeric" value={form.reorderLevel} onChange={(e) => set('reorderLevel')(e.target.value)} />
            </Field>
            {editing ? (
              <Field label="Quantity on hand">
                <div className={`${inputClass} flex items-center bg-[var(--surface-alt)] font-bold`}>
                  {editing.quantityOnHand}
                </div>
              </Field>
            ) : (
              <Field label="Opening stock" htmlFor="f-qty">
                <input id="f-qty" className={inputClass} inputMode="numeric" value={form.quantityOnHand} onChange={(e) => set('quantityOnHand')(e.target.value)} />
              </Field>
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
          <div className="flex items-center justify-between rounded-xl bg-[var(--surface-alt)] px-4 py-3">
            <span className="text-sm font-semibold text-[var(--ink-muted)]">Current stock</span>
            <span className="tnum text-xl font-bold">{adjustTarget?.quantityOnHand}</span>
          </div>
          <Field label="Quantity change" htmlFor="a-change" hint="Use a negative number to reduce stock, e.g. -3.">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setAdjustChange((v) => String((parseInt(v || '0', 10) || 0) - 1))}
                aria-label="Decrease change by one"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[var(--border-input)]"
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
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[var(--border-input)]"
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
          <ul className="flex flex-col gap-2">
            {movements.map((m) => (
              <li key={m.id} className="flex items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3.5">
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${m.quantity_change >= 0 ? 'bg-[var(--success-bg)] text-[var(--success)]' : 'bg-[var(--danger-bg)] text-[var(--danger)]'}`}>
                  <Icon name={m.quantity_change >= 0 ? 'add' : 'remove'} size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`tnum text-sm font-bold ${m.quantity_change >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                      {m.quantity_change >= 0 ? '+' : ''}{m.quantity_change}
                    </span>
                    <Badge tone={MOVEMENT_TONES[m.movement_type] ?? 'gray'}>
                      {MOVEMENT_LABELS[m.movement_type] ?? m.movement_type}
                    </Badge>
                  </div>
                  {m.notes && <p className="mt-1 text-sm text-[var(--ink-muted)]">{m.notes}</p>}
                  <p className="mt-1 text-xs text-[var(--ink-muted)]">
                    {m.created_by_name ?? 'System'} · {new Date(m.created_at).toLocaleString('en-GH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Sheet>
    </motion.div>
  );
}
