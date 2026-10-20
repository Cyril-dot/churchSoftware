// Demo mode API dispatcher — serves mock data when DATABASE_URL is not set.
// This lets anyone preview and test the full app without a Neon database.

import { NextRequest, NextResponse } from 'next/server';
import {
  DEMO_USERS, DEMO_PRODUCTS, DEMO_SALES, DEMO_SETTINGS, DEMO_CATEGORIES, DEMO_SUPPLIERS,
  DEMO_DEPOSIT_ACCOUNTS, DEMO_DEPOSITS, DEMO_DELIVERY_ORDERS, DEMO_CREDIT_SALES, DEMO_TODOS,
  type DemoDeposit, type DemoDeliveryOrder, type DemoCreditSale, type DemoTodo,
} from './demo-data';
import { lowStockReason } from './low-stock';
import { creditStatus } from './credit';

const DEMO_MOMO = {
  balance: 1240.5,
  entries: [
    /* Auto-deduction for the seeded, already-received PO-DEMO-001
       (10 × GH₵85 = GH₵850 by MoMo) — keeps the ledger consistent with
       the purchase's paymentDeductedAt. Balance before: 2090.50. */
    {
      id: 'momo-seed-1',
      entryType: 'withdrawal',
      amount: 850,
      balanceAfter: 1240.5,
      reference: 'PO-DEMO-001',
      notes: 'Payment for Purchase PO-DEMO-001 (Invoice INV-SUP-1001) — auto-deducted on receive.',
      createdBy: 'demo-manager',
      createdByName: 'Kwame Mensah',
      createdAt: new Date(Date.now() - 5 * 86400_000).toISOString(),
    },
  ] as Array<{
    id: string; entryType: string; amount: number; balanceAfter: number;
    reference: string | null; notes: string | null;
    createdBy: string; createdByName: string; createdAt: string;
  }>,
};

const DEMO_CASHOUTS: Array<{
  id: string; referenceNumber: string; amount: number; cashedAt: string;
  cashedBy: string; cashedByName: string; notes: string | null; createdAt: string;
}> = [];

/* ── New-feature demo stores (seeded copies; mutated in-memory) ── */

const DEMO_DELIVERIES: DemoDeliveryOrder[] = DEMO_DELIVERY_ORDERS.map((o) => ({
  ...o,
  items: o.items.map((i) => ({ ...i })),
}));
let demoDeliverySeq = DEMO_DELIVERIES.length;

interface DemoCreditLive extends DemoCreditSale {
  total: number;
}

const DEMO_CREDIT: DemoCreditLive[] = DEMO_CREDIT_SALES.map((c) => ({
  ...c,
  total: c.items.reduce((s, i) => s + i.quantity * i.unit_price, 0),
  items: c.items.map((i) => ({ ...i })),
  payments: c.payments.map((p) => ({ ...p })),
}));
let demoCreditSeq = DEMO_CREDIT.length;

const DEMO_TODOS_LIVE: DemoTodo[] = DEMO_TODOS.map((t) => ({ ...t }));

/* Deposits: one seeded dataset; account summaries and the timeline are both
   computed from this store, and POST appends to it. */
const DEMO_DEPOSITS_LIVE: DemoDeposit[] = DEMO_DEPOSITS.map((d) => ({ ...d }));
let demoDepositSeq = DEMO_DEPOSITS_LIVE.length;

const toDemoDeposit = (d: DemoDeposit) => ({
  id: d.id,
  referenceNumber: d.reference_number,
  depositAccountId: d.deposit_account_id,
  depositAccountName: DEMO_DEPOSIT_ACCOUNTS.find((a) => a.id === d.deposit_account_id)?.name ?? 'Account',
  amount: d.amount,
  depositedOn: d.deposited_on,
  depositedBy: d.deposited_by,
  depositedByName: d.deposited_by_name,
  notes: d.notes,
  createdAt: d.created_at,
});

interface DemoMovement {
  id: string; productId: string; productName: string; sku: string | null;
  movementType: string; quantityChange: number; unitCost: number | null;
  referenceType: string | null; notes: string | null;
  createdByName: string | null; createdAt: string;
}

const DEMO_MOVEMENTS: DemoMovement[] = DEMO_SALES.flatMap((s) =>
  s.items.map((i, idx) => {
    const p = DEMO_PRODUCTS.find((x) => x.name === i.name);
    return {
      id: `mov-${s.id}-${idx}`,
      productId: p?.id ?? '',
      productName: i.name,
      sku: p?.sku ?? null,
      movementType: 'sale',
      quantityChange: -i.quantity,
      unitCost: p?.cost_price ?? null,
      referenceType: 'sale',
      notes: null,
      createdByName: s.cashier_name,
      createdAt: s.sold_at,
    };
  })
).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

function pushMovement(m: Omit<DemoMovement, 'id' | 'createdAt'> & { createdAt?: string }) {
  DEMO_MOVEMENTS.unshift({
    ...m,
    id: `mov-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    createdAt: m.createdAt ?? new Date().toISOString(),
  });
}

interface DemoPurchase {
  id: string; referenceNumber: string; invoiceNumber: string | null;
  paymentMethod: 'cash' | 'momo';
  supplierId: string; supplierName: string | null;
  status: 'draft' | 'ordered' | 'received' | 'cancelled';
  orderedAt: string | null; receivedAt: string | null; cancelledAt: string | null;
  notes: string | null; createdBy: string; createdByName: string | null;
  createdAt: string; paymentDeductedAt: string | null;
  items: Array<{
    id: string; productId: string; productName: string; sku: string | null;
    quantityOrdered: number; quantityReceived: number; unitCost: number;
  }>;
}

const DEMO_PURCHASES: DemoPurchase[] = [
  {
    id: 'po-1',
    referenceNumber: 'PO-DEMO-001',
    invoiceNumber: 'INV-SUP-1001',
    paymentMethod: 'momo',
    supplierId: 'sup-8',
    supplierName: 'Ghana Bible Society',
    status: 'received',
    orderedAt: new Date(Date.now() - 6 * 86400_000).toISOString(),
    receivedAt: new Date(Date.now() - 5 * 86400_000).toISOString(),
    cancelledAt: null,
    notes: 'Bibles restock.',
    createdBy: 'demo-manager',
    createdByName: 'Kwame Mensah',
    createdAt: new Date(Date.now() - 6 * 86400_000).toISOString(),
    paymentDeductedAt: new Date(Date.now() - 5 * 86400_000).toISOString(),
    items: [
      { id: 'poi-1', productId: 'p1', productName: 'KJV Study Bible (Large Print)', sku: 'BIB-001', quantityOrdered: 10, quantityReceived: 10, unitCost: 85 },
    ],
  },
  {
    id: 'po-2',
    referenceNumber: 'PO-DEMO-002',
    invoiceNumber: null,
    paymentMethod: 'cash',
    supplierId: 'sup-6',
    supplierName: 'AG Bookshop Head Office',
    status: 'draft',
    orderedAt: null,
    receivedAt: null,
    cancelledAt: null,
    notes: null,
    createdBy: 'demo-admin',
    createdByName: 'Ama Serwaa',
    createdAt: new Date(Date.now() - 1 * 86400_000).toISOString(),
    paymentDeductedAt: null,
    items: [
      { id: 'poi-2', productId: 'p7', productName: 'The Purpose Driven Life', sku: 'CL-001', quantityOrdered: 40, quantityReceived: 0, unitCost: 20 },
      { id: 'poi-3', productId: 'p11', productName: 'Hymnal — Songs of Praise', sku: 'MUS-001', quantityOrdered: 25, quantityReceived: 0, unitCost: 15 },
    ],
  },
];

const DEMO_COOKIE = 'bookshop_demo_session';

function ok(data: unknown, status = 200) {
  return NextResponse.json({ data }, { status });
}

function getDemoUser(req: NextRequest) {
  const id = req.cookies.get(DEMO_COOKIE)?.value;
  return DEMO_USERS.find((u) => u.id === id) || null;
}

function requireDemoUser(req: NextRequest) {
  const user = getDemoUser(req);
  if (!user) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Please sign in.' } }, { status: 401 });
  }
  return user;
}

export async function demoDispatch(req: NextRequest): Promise<NextResponse> {
  const path = req.nextUrl.pathname;
  const method = req.method;

  // ── Auth ──
  if (path === '/api/v1/auth/status' && method === 'GET') {
    return ok({ needsSetup: false, demoMode: true });
  }
  if (path === '/api/v1/auth/login' && method === 'POST') {
    const body = await req.json().catch(() => ({}));
    const user = DEMO_USERS.find((u) => u.email === (body.email || '').toLowerCase());
    // Demo password is "password123" for all, but accept anything for easy testing
    if (!user) {
      return NextResponse.json(
        { error: { code: 'INVALID', message: 'Invalid email or password.' } },
        { status: 401 }
      );
    }
    const res = ok({ user });
    res.cookies.set(DEMO_COOKIE, user.id, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 28800 });
    return res;
  }
  if (path === '/api/v1/auth/logout' && method === 'POST') {
    const res = ok({});
    res.cookies.delete(DEMO_COOKIE);
    return res;
  }
  if (path === '/api/v1/auth/me' && method === 'GET') {
    const user = getDemoUser(req);
    if (!user) return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Please sign in.' } }, { status: 401 });
    return ok({ id: user.id, name: user.name, email: user.email, role: user.role });
  }

  // All routes below need auth
  const user = requireDemoUser(req);
  if (user instanceof NextResponse) return user;

  // ── Products ──
  if (path === '/api/v1/products' && method === 'GET') {
    const search = (req.nextUrl.searchParams.get('search') || '').toLowerCase();
    const lowStock = req.nextUrl.searchParams.get('lowStock') === '1';
    let items = DEMO_PRODUCTS.filter((p) => p.active);
    if (search) items = items.filter((p) => p.name.toLowerCase().includes(search));
    if (lowStock)
      items = items.filter(
        (p) =>
          lowStockReason({
            productType: p.product_type,
            categoryName: p.category,
            quantityShop: p.quantity_shop,
            quantityWarehouse: p.quantity_warehouse,
            quantityOnHand: p.quantity_on_hand,
            reorderLevel: p.reorder_level,
          }) != null
      );
    // Return camelCase to match the real API contract
    const toCamel = (p: (typeof DEMO_PRODUCTS)[number]) => ({
      id: p.id,
      name: p.name,
      authorOrBrand: p.author_or_brand,
      sku: p.sku,
      barcode: p.barcode,
      coverPhotoUrl: p.cover_photo_url,
      reference: (p as unknown as Record<string, unknown>).reference as string | null ?? null,
      productType: p.product_type,
      categoryId: null,
      categoryName: p.category,
      supplierId: null,
      supplierName: null,
      costPrice: p.cost_price,
      sellingPrice: p.selling_price,
      priceBishop: (p as unknown as Record<string, unknown>).price_bishop as number | null ?? p.selling_price,
      priceSonsOfProphet: (p as unknown as Record<string, unknown>).price_sons_of_prophet as number | null ?? p.selling_price,
      pricePastorDeji: (p as unknown as Record<string, unknown>).price_pastor_deji as number | null ?? p.selling_price,
      quantityOnHand: p.quantity_on_hand,
      quantityShop: p.quantity_shop,
      quantityWarehouse: p.quantity_warehouse,
      reorderLevel: p.reorder_level,
      active: p.active,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    // Strip cost for cashier
    const mapped = items.map((p) => {
      const c = toCamel(p);
      if (user.role === 'cashier') {
        const { costPrice, ...rest } = c;
        return rest;
      }
      return c;
    });
    return ok({ items: mapped, nextCursor: null });
  }

  // ── Categories ──
  if (path === '/api/v1/categories' && method === 'GET') {
    return ok({ items: DEMO_CATEGORIES.map((name, i) => ({ id: `cat-${i}`, name })) });
  }

  // ── Sales ──
  if (path === '/api/v1/sales' && method === 'GET') {
    let sales = DEMO_SALES;
    if (user.role === 'cashier') sales = sales.filter((s) => s.sold_by === user.id);
    const fromParam = req.nextUrl.searchParams.get('from');
    const toParam = req.nextUrl.searchParams.get('to');
    if (fromParam) sales = sales.filter((s) => s.sold_at >= fromParam);
    if (toParam) sales = sales.filter((s) => s.sold_at <= toParam);
    const methodParam = req.nextUrl.searchParams.get('paymentMethod');
    if (methodParam) sales = sales.filter((s) => s.payment_method === methodParam);
    const statusParam = req.nextUrl.searchParams.get('status');
    if (statusParam) sales = sales.filter((s) => s.status === statusParam);
    // Return camelCase to match the real API contract
    const mapped = sales.slice(0, 50).map((s) => ({
      id: s.id,
      receiptNumber: s.receipt_number,
      paymentMethod: s.payment_method,
      subtotal: s.subtotal,
      discount: s.discount,
      total: s.total,
      amountTendered: s.amount_tendered,
      soldBy: s.sold_by,
      soldByName: s.cashier_name,
      soldAt: s.sold_at,
      status: s.status,
      itemCount: s.items.length,
      items: s.items.map((i) => ({
        name: i.name,
        quantity: i.quantity,
        unitPrice: i.unit_price,
      })),
    }));
    return ok({ items: mapped, nextCursor: null });
  }
  if (path === '/api/v1/sales' && method === 'POST') {
    const body = await req.json().catch(() => ({}));
    const TIER_COL: Record<string, string> = {
      bishop: 'price_bishop',
      sons_of_prophet: 'price_sons_of_prophet',
      pastor_deji: 'price_pastor_deji',
    };
    const items = (body.items || []).map((it: any) => {
      const p = DEMO_PRODUCTS.find((x) => x.id === it.productId);
      const tierCol = TIER_COL[it.priceTier as string];
      const tierPrice = tierCol
        ? ((p as unknown as Record<string, unknown>)?.[tierCol] as number | null)
        : null;
      return {
        name: p?.name || 'Unknown',
        quantity: it.quantity,
        unit_price: tierPrice ?? p?.selling_price ?? 0,
        price_tier: it.priceTier || 'standard',
      };
    });
    const subtotal = items.reduce((s: number, i: any) => s + i.quantity * i.unit_price, 0);
    const discount = body.discount || 0;
    const receipt = {
      id: `sale-demo-${Date.now()}`,
      receipt_number: `R-${String(2000 + DEMO_SALES.length).padStart(6, '0')}`,
      sold_at: new Date().toISOString(),
      cashier_name: user.name,
      items,
      subtotal,
      discount,
      total: subtotal - discount,
      amount_tendered: body.amountTendered ?? null,
      payment_method: body.paymentMethod,
      payment_reference: body.paymentReference || null,
    };
    return ok({ receipt }, 201);
  }

  // ── Sale receipt detail (demo: map stored demo sale to getReceipt shape) ──
  if (method === 'GET' && path.startsWith('/api/v1/sales/')) {
    const id = path.slice('/api/v1/sales/'.length);
    if (id && !id.includes('/')) {
      const s = DEMO_SALES.find((x) => x.id === id);
      if (!s || (user.role === 'cashier' && s.sold_by !== user.id)) {
        return NextResponse.json(
          { error: { code: 'NOT_FOUND', message: 'That sale no longer exists.' } },
          { status: 404 },
        );
      }
      return ok({
        sale: {
          id: s.id,
          receiptNumber: s.receipt_number,
          paymentMethod: s.payment_method,
          subtotal: s.subtotal,
          discount: s.discount,
          total: s.total,
          amountTendered: s.amount_tendered,
          change: s.amount_tendered != null ? s.amount_tendered - s.total : null,
          paymentReference: null,
          note: null,
          status: s.status,
          soldBy: s.sold_by,
          soldByName: s.cashier_name,
          soldAt: s.sold_at,
          voidedAt: null,
          voidedBy: null,
          voidedByName: null,
          voidReason: null,
        },
        items: s.items.map((it: any, i: number) => ({
          id: `${s.id}-i${i}`,
          productId: '',
          productName: it.name,
          quantity: it.quantity,
          unitPrice: it.unit_price,
          unitCost: null,
          lineTotal: it.unit_price * it.quantity,
          priceTier: it.price_tier ?? 'standard',
        })),
        settings: {
          shopName: DEMO_SETTINGS.shop_name,
          currencyCode: DEMO_SETTINGS.currency_code,
          currencySymbol: DEMO_SETTINGS.currency_symbol,
          receiptFooter: DEMO_SETTINGS.receipt_footer,
          timezone: DEMO_SETTINGS.timezone,
        },
      });
    }
  }

  // ── Reports ──
  if (path === '/api/v1/reports/summary' && method === 'GET') {
    const revenue = DEMO_SALES.reduce((s, x) => s + x.total, 0);
    const cogs = DEMO_SALES.reduce(
      (s, x) => s + x.items.reduce((a, i) => {
        const p = DEMO_PRODUCTS.find((p) => p.name === i.name);
        return a + i.quantity * (p?.cost_price || 0);
      }, 0), 0);
    return ok({
      revenue, transactions: DEMO_SALES.length,
      discounts: DEMO_SALES.reduce((s, x) => s + x.discount, 0),
      cogs, grossProfit: revenue - cogs,
    });
  }
  if (path === '/api/v1/reports/sales-by-day' && method === 'GET') {
    const byDay: Record<string, { revenue: number; n: number }> = {};
    for (const s of DEMO_SALES) {
      const day = s.sold_at.slice(0, 10);
      byDay[day] = byDay[day] || { revenue: 0, n: 0 };
      byDay[day].revenue += s.total;
      byDay[day].n++;
    }
    return ok(Object.entries(byDay).sort().slice(-7).map(([day, v]) => ({ day, ...v })));
  }
  if (path === '/api/v1/reports/by-payment' && method === 'GET') {
    const by: Record<string, { amount: number; n: number }> = {};
    for (const s of DEMO_SALES) {
      by[s.payment_method] = by[s.payment_method] || { amount: 0, n: 0 };
      by[s.payment_method].amount += s.total;
      by[s.payment_method].n++;
    }
    return ok(Object.entries(by).map(([payment_method, v]) => ({ payment_method, ...v })));
  }
  if (path === '/api/v1/reports/top-items' && method === 'GET') {
    const by: Record<string, { units: number; revenue: number }> = {};
    for (const s of DEMO_SALES) {
      for (const i of s.items) {
        by[i.name] = by[i.name] || { units: 0, revenue: 0 };
        by[i.name].units += i.quantity;
        by[i.name].revenue += i.quantity * i.unit_price;
      }
    }
    return ok(Object.entries(by).map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.units - a.units).slice(0, 10));
  }

  // ── Settings ──
  if (path === '/api/v1/settings' && method === 'GET') {
    // Return camelCase to match the real API contract
    return ok({
      shopName: DEMO_SETTINGS.shop_name,
      currencyCode: DEMO_SETTINGS.currency_code,
      currencySymbol: DEMO_SETTINGS.currency_symbol,
      receiptFooter: DEMO_SETTINGS.receipt_footer,
      timezone: DEMO_SETTINGS.timezone,
      updatedAt: null,
    });
  }

  // ── Users (admin demo) ──
  if (path === '/api/v1/users' && method === 'GET') {
    return ok({ items: DEMO_USERS.map((u) => ({ ...u, active: true, last_login_at: new Date().toISOString() })) });
  }

  // ── Suppliers ──
  if (path === '/api/v1/suppliers' && method === 'GET') {
    return ok({ items: DEMO_SUPPLIERS.map((name, i) => ({ id: `sup-${i}`, name, active: true })) });
  }

  // ── Deposit accounts ──
  if (path === '/api/v1/deposit-accounts' && method === 'GET') {
    return ok({
      items: DEMO_DEPOSIT_ACCOUNTS.map((a) => {
        const mine = DEMO_DEPOSITS_LIVE.filter((d) => d.deposit_account_id === a.id);
        return {
          id: a.id,
          name: a.name,
          bankName: a.bank_name,
          accountNumber: a.account_number,
          active: true,
          totalDeposited: Math.round(mine.reduce((s, d) => s + d.amount, 0) * 100) / 100,
          depositCount: mine.length,
          lastDepositOn: mine.length
            ? mine.map((d) => d.deposited_on).sort().at(-1) ?? null
            : null,
          createdAt: new Date().toISOString(),
        };
      }),
    });
  }
  if (path === '/api/v1/deposits' && method === 'GET') {
    const accountId = req.nextUrl.searchParams.get('accountId');
    const limit = Math.min(100, Math.max(1, parseInt(req.nextUrl.searchParams.get('limit') || '50', 10) || 50));
    let items = DEMO_DEPOSITS_LIVE.slice().sort((a, b) => b.created_at.localeCompare(a.created_at));
    if (accountId) items = items.filter((d) => d.deposit_account_id === accountId);
    return ok({ items: items.slice(0, limit).map(toDemoDeposit), nextCursor: null });
  }
  if (path === '/api/v1/deposits' && method === 'POST') {
    const body = await req.json().catch(() => ({}));
    const acct = DEMO_DEPOSIT_ACCOUNTS.find((a) => a.id === body.depositAccountId);
    if (!acct) {
      return NextResponse.json({ error: { code: 'INVALID_ACCOUNT', message: 'That deposit account does not exist.' } }, { status: 400 });
    }
    demoDepositSeq += 1;
    const deposit: DemoDeposit = {
      id: `dep-${demoDepositSeq}`,
      reference_number: `D-${String(demoDepositSeq).padStart(6, '0')}`,
      deposit_account_id: acct.id,
      amount: body.amount ?? 0,
      deposited_on: body.depositedOn ?? new Date().toISOString().slice(0, 10),
      deposited_by: user.id,
      deposited_by_name: user.name,
      notes: body.notes ?? null,
      created_at: new Date().toISOString(),
    };
    DEMO_DEPOSITS_LIVE.unshift(deposit);
    return ok(toDemoDeposit(deposit), 201);
  }

  // ── Product transfer (demo: in-memory) ──
  const transferMatch = path.match(/^\/api\/v1\/products\/([^/]+)\/transfer$/);
  if (transferMatch && method === 'POST') {
    const body = await req.json().catch(() => ({}));
    const p = DEMO_PRODUCTS.find((x) => x.id === transferMatch[1]);
    if (!p) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Not found.' } }, { status: 404 });
    const qty = body.quantity || 0;
    const from = body.from === 'warehouse' ? 'quantity_warehouse' : 'quantity_shop';
    const to = body.to === 'warehouse' ? 'quantity_warehouse' : 'quantity_shop';
    if (p[from] < qty) {
      return NextResponse.json({ error: { code: 'INSUFFICIENT_STOCK', message: 'Not enough stock.' } }, { status: 400 });
    }
    p[from] -= qty;
    p[to] += qty;
    return ok({ transferred: qty, from: body.from, to: body.to });
  }

  // ── MoMo balance (demo: in-memory) ──
  if (path === '/api/v1/momo' && method === 'GET') {
    if (user.role === 'cashier') {
      return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Not allowed.' } }, { status: 403 });
    }
    return ok({
      balance: DEMO_MOMO.balance,
      entries: DEMO_MOMO.entries.slice().reverse(),
    });
  }
  if (path === '/api/v1/momo' && method === 'POST') {
    if (user.role === 'cashier') {
      return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Not allowed.' } }, { status: 403 });
    }
    const body = await req.json().catch(() => ({}));
    const type = body.entryType;
    const amount = Number(body.amount) || 0;
    if (!['top_up', 'withdrawal', 'set_balance', 'sale', 'cashout'].includes(type)) {
      return NextResponse.json({ error: { code: 'INVALID', message: 'Invalid entry type.' } }, { status: 400 });
    }
    let next = DEMO_MOMO.balance;
    if (type === 'top_up' || type === 'sale') next += amount;
    else if (type === 'withdrawal' || type === 'cashout') {
      if (amount > next) {
        return NextResponse.json({ error: { code: 'INSUFFICIENT', message: 'Insufficient MoMo balance.' } }, { status: 400 });
      }
      next -= amount;
    } else next = amount;
    const entry = {
      id: `momo-${Date.now()}`,
      entryType: type,
      amount,
      balanceAfter: next,
      reference: body.reference ?? null,
      notes: body.notes ?? null,
      createdBy: user.id,
      createdByName: user.name,
      createdAt: new Date().toISOString(),
    };
    DEMO_MOMO.balance = next;
    DEMO_MOMO.entries.push(entry);
    return ok({ entry }, 201);
  }

  // ── Cash-outs (demo: in-memory) ──
  if (path === '/api/v1/cashouts' && method === 'GET') {
    if (user.role === 'cashier') {
      return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Not allowed.' } }, { status: 403 });
    }
    return ok({ items: DEMO_CASHOUTS.slice().reverse(), nextCursor: null });
  }
  if (path === '/api/v1/cashouts' && method === 'POST') {
    if (user.role !== 'admin') {
      return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Only admins can record cash-outs.' } }, { status: 403 });
    }
    const body = await req.json().catch(() => ({}));
    const amount = Number(body.amount) || 0;
    if (amount <= 0) {
      return NextResponse.json({ error: { code: 'INVALID', message: 'Amount must be positive.' } }, { status: 400 });
    }
    const cashout = {
      id: `co-${Date.now()}`,
      referenceNumber: `C-${String(DEMO_CASHOUTS.length + 1).padStart(6, '0')}`,
      amount,
      cashedAt: body.cashedAt || new Date().toISOString(),
      cashedBy: user.id,
      cashedByName: user.name,
      notes: body.notes ?? null,
      createdAt: new Date().toISOString(),
    };
    DEMO_CASHOUTS.push(cashout);
    return ok({ cashout }, 201);
  }

  // ── Delivery orders (demo: in-memory) ──
  const mgrOnly = () =>
    user.role === 'cashier'
      ? NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Not allowed.' } }, { status: 403 })
      : null;

  const toDelivery = (o: DemoDeliveryOrder) => ({
    id: o.id,
    invoiceNumber: o.invoice_number,
    customerName: o.customer_name,
    contactName: o.contact_name,
    phone: o.phone,
    address: o.address,
    status: o.status,
    total: o.items.reduce((s, i) => s + i.quantity * i.unit_price, 0),
    notes: o.notes,
    itemCount: o.items.length,
    createdBy: o.created_by,
    createdByName: o.created_by_name,
    createdAt: o.created_at,
    deliveredAt: o.delivered_at,
    deliveredByName: o.delivered_by_name,
  });

  if (path === '/api/v1/deliveries' && method === 'GET') {
    const denied = mgrOnly();
    if (denied) return denied;
    let items = DEMO_DELIVERIES.slice();
    const fromParam = req.nextUrl.searchParams.get('from');
    const toParam = req.nextUrl.searchParams.get('to');
    const statusParam = req.nextUrl.searchParams.get('status');
    if (fromParam) items = items.filter((o) => o.created_at >= fromParam);
    if (toParam) items = items.filter((o) => o.created_at <= toParam);
    if (statusParam) items = items.filter((o) => o.status === statusParam);
    items.sort((a, b) => b.created_at.localeCompare(a.created_at));
    return ok({ items: items.map(toDelivery), nextCursor: null });
  }
  if (path === '/api/v1/deliveries' && method === 'POST') {
    const denied = mgrOnly();
    if (denied) return denied;
    const body = await req.json().catch(() => ({}));
    const lines: Array<{ productId: string; quantity: number; unitPrice: number }> = body.items || [];
    if (!body.customerName || lines.length === 0) {
      return NextResponse.json({ error: { code: 'VALIDATION', message: 'Customer name and at least one item are required.' } }, { status: 400 });
    }
    for (const l of lines) {
      const p = DEMO_PRODUCTS.find((x) => x.id === l.productId);
      if (!p) return NextResponse.json({ error: { code: 'INVALID_PRODUCT', message: 'One or more products do not exist.' } }, { status: 400 });
      if (p.quantity_warehouse < l.quantity) {
        return NextResponse.json({ error: { code: 'INSUFFICIENT_STOCK', message: `Only ${p.quantity_warehouse} of “${p.name}” in the warehouse.` } }, { status: 400 });
      }
    }
    demoDeliverySeq++;
    const order: DemoDeliveryOrder = {
      id: `del-${Date.now()}`,
      invoice_number: `INV-${String(demoDeliverySeq).padStart(6, '0')}`,
      customer_name: body.customerName,
      contact_name: body.contactName ?? null,
      phone: body.phone ?? null,
      address: body.address ?? null,
      status: 'pending',
      notes: body.notes ?? null,
      created_by: user.id,
      created_by_name: user.name,
      created_at: new Date().toISOString(),
      delivered_at: null,
      delivered_by_name: null,
      items: lines.map((l) => {
        const p = DEMO_PRODUCTS.find((x) => x.id === l.productId)!;
        p.quantity_warehouse -= l.quantity;
        p.quantity_on_hand -= l.quantity;
        pushMovement({
          productId: p.id, productName: p.name, sku: p.sku, movementType: 'delivery',
          quantityChange: -l.quantity, unitCost: p.cost_price, referenceType: 'delivery_order',
          notes: `Warehouse delivery INV-${String(demoDeliverySeq).padStart(6, '0')}`,
          createdByName: user.name,
        });
        return { product_id: p.id, name: p.name, quantity: l.quantity, unit_price: l.unitPrice };
      }),
    };
    DEMO_DELIVERIES.unshift(order);
    return ok(toDelivery(order), 201);
  }
  const deliveryMatch = path.match(/^\/api\/v1\/deliveries\/([^/]+)(\/deliver)?$/);
  if (deliveryMatch && method === 'GET') {
    const denied = mgrOnly();
    if (denied) return denied;
    const o = DEMO_DELIVERIES.find((x) => x.id === deliveryMatch[1]);
    if (!o) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'That delivery order no longer exists.' } }, { status: 404 });
    return ok({
      ...toDelivery(o),
      items: o.items.map((i, idx) => ({
        id: `${o.id}-i${idx}`,
        productId: i.product_id,
        productName: i.name,
        sku: DEMO_PRODUCTS.find((p) => p.id === i.product_id)?.sku ?? null,
        quantity: i.quantity,
        unitPrice: i.unit_price,
        lineTotal: i.quantity * i.unit_price,
      })),
      settings: {
        shopName: DEMO_SETTINGS.shop_name,
        currencyCode: DEMO_SETTINGS.currency_code,
        currencySymbol: DEMO_SETTINGS.currency_symbol,
        receiptFooter: DEMO_SETTINGS.receipt_footer,
        timezone: DEMO_SETTINGS.timezone,
      },
    });
  }
  if (deliveryMatch && deliveryMatch[2] && method === 'POST') {
    const denied = mgrOnly();
    if (denied) return denied;
    const o = DEMO_DELIVERIES.find((x) => x.id === deliveryMatch[1]);
    if (!o) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'That delivery order no longer exists.' } }, { status: 404 });
    if (o.status === 'delivered') {
      return NextResponse.json({ error: { code: 'ALREADY_DELIVERED', message: 'This order has already been marked delivered.' } }, { status: 409 });
    }
    o.status = 'delivered';
    o.delivered_at = new Date().toISOString();
    o.delivered_by_name = user.name;
    return ok({ id: o.id, delivered: true });
  }

  // ── Credit customers (demo: in-memory) ──
  const creditPaid = (c: DemoCreditLive) => c.payments.reduce((s, p) => s + p.amount, 0);
  const toCredit = (c: DemoCreditLive) => {
    const paid = creditPaid(c);
    const st = creditStatus(c.total, paid, c.due_date);
    return {
      id: c.id,
      referenceNumber: c.reference_number,
      churchName: c.church_name,
      contactName: c.contact_name,
      phone: c.phone,
      location: c.location,
      takenOn: c.taken_on,
      dueDate: c.due_date,
      total: c.total,
      paid,
      balance: st.balance,
      status: st.status,
      overdue: st.overdue,
      notes: c.notes,
      itemCount: c.items.length,
      createdBy: c.created_by,
      createdByName: c.created_by_name,
      createdAt: c.created_at,
    };
  };

  if (path === '/api/v1/credit' && method === 'GET') {
    const denied = mgrOnly();
    if (denied) return denied;
    let items = DEMO_CREDIT.map(toCredit);
    const statusParam = req.nextUrl.searchParams.get('status');
    if (statusParam === 'overdue') items = items.filter((i) => i.overdue);
    else if (statusParam) items = items.filter((i) => i.status === statusParam);
    const outstanding = items.filter((i) => i.balance > 0);
    return ok({
      items,
      summary: {
        outstandingCount: outstanding.length,
        outstandingTotal: Math.round(outstanding.reduce((s, i) => s + i.balance, 0) * 100) / 100,
        overdueCount: items.filter((i) => i.overdue).length,
      },
      nextCursor: null,
    });
  }
  if (path === '/api/v1/credit' && method === 'POST') {
    const denied = mgrOnly();
    if (denied) return denied;
    const body = await req.json().catch(() => ({}));
    const lines: Array<{ productId: string; quantity: number; unitPrice: number }> = body.items || [];
    if (!body.churchName || !body.contactName || lines.length === 0) {
      return NextResponse.json({ error: { code: 'VALIDATION', message: 'Church, contact name and at least one item are required.' } }, { status: 400 });
    }
    for (const l of lines) {
      const p = DEMO_PRODUCTS.find((x) => x.id === l.productId);
      if (!p) return NextResponse.json({ error: { code: 'INVALID_PRODUCT', message: 'One or more products do not exist.' } }, { status: 400 });
      if (p.quantity_shop < l.quantity) {
        return NextResponse.json({ error: { code: 'INSUFFICIENT_STOCK', message: `Only ${p.quantity_shop} of “${p.name}” in the shop.` } }, { status: 400 });
      }
    }
    demoCreditSeq++;
    const ref = `CR-${String(demoCreditSeq).padStart(6, '0')}`;
    const sale: DemoCreditLive = {
      id: `cred-${Date.now()}`,
      reference_number: ref,
      church_name: body.churchName,
      contact_name: body.contactName,
      phone: body.phone ?? null,
      location: body.location ?? null,
      taken_on: body.takenOn ?? new Date().toISOString().slice(0, 10),
      due_date: body.dueDate ?? null,
      notes: body.notes ?? null,
      created_by: user.id,
      created_by_name: user.name,
      created_at: new Date().toISOString(),
      total: lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0),
      items: lines.map((l) => {
        const p = DEMO_PRODUCTS.find((x) => x.id === l.productId)!;
        p.quantity_shop -= l.quantity;
        p.quantity_on_hand -= l.quantity;
        pushMovement({
          productId: p.id, productName: p.name, sku: p.sku, movementType: 'credit_sale',
          quantityChange: -l.quantity, unitCost: p.cost_price, referenceType: 'credit_sale',
          notes: `Credit sale ${ref} — ${body.churchName}`, createdByName: user.name,
        });
        return { product_id: p.id, name: p.name, quantity: l.quantity, unit_price: l.unitPrice };
      }),
      payments: [],
    };
    DEMO_CREDIT.unshift(sale);
    return ok(toCredit(sale), 201);
  }
  const creditPayMatch = path.match(/^\/api\/v1\/credit\/([^/]+)\/payments$/);
  if (creditPayMatch && method === 'POST') {
    const denied = mgrOnly();
    if (denied) return denied;
    const c = DEMO_CREDIT.find((x) => x.id === creditPayMatch[1]);
    if (!c) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'That credit record no longer exists.' } }, { status: 404 });
    const body = await req.json().catch(() => ({}));
    const amount = Number(body.amount) || 0;
    const paid = creditPaid(c);
    const { balance } = creditStatus(c.total, paid, null);
    if (balance <= 0) {
      return NextResponse.json({ error: { code: 'ALREADY_SETTLED', message: 'This credit is already fully settled.' } }, { status: 409 });
    }
    if (amount <= 0 || amount > balance) {
      return NextResponse.json({ error: { code: 'OVERPAYMENT', message: `Payment exceeds the outstanding balance of ${balance.toFixed(2)}.` } }, { status: 400 });
    }
    const payment = {
      id: `cpay-${Date.now()}`,
      amount,
      paid_on: body.paidOn ?? new Date().toISOString().slice(0, 10),
      payment_method: body.paymentMethod ?? null,
      notes: body.notes ?? null,
      received_by_name: user.name,
    };
    c.payments.push(payment);
    const newPaid = Math.round((paid + amount) * 100) / 100;
    const st = creditStatus(c.total, newPaid, c.due_date);
    return ok({ id: payment.id, amount, paidOn: payment.paid_on, paid: newPaid, balance: st.balance, status: st.status, overdue: st.overdue }, 201);
  }
  const creditMatch = path.match(/^\/api\/v1\/credit\/([^/]+)$/);
  if (creditMatch && method === 'GET') {
    const denied = mgrOnly();
    if (denied) return denied;
    const c = DEMO_CREDIT.find((x) => x.id === creditMatch[1]);
    if (!c) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'That credit record no longer exists.' } }, { status: 404 });
    return ok({
      ...toCredit(c),
      items: c.items.map((i, idx) => ({
        id: `${c.id}-i${idx}`,
        productId: i.product_id,
        productName: i.name,
        sku: DEMO_PRODUCTS.find((p) => p.id === i.product_id)?.sku ?? null,
        quantity: i.quantity,
        unitPrice: i.unit_price,
        lineTotal: i.quantity * i.unit_price,
      })),
      payments: c.payments.map((p) => ({
        id: p.id,
        amount: p.amount,
        paidOn: p.paid_on,
        paymentMethod: p.payment_method,
        notes: p.notes,
        receivedBy: c.created_by,
        receivedByName: p.received_by_name,
        createdAt: c.created_at,
      })),
    });
  }

  // ── To-dos (demo: in-memory, shared list) ──
  const toTodo = (t: DemoTodo) => ({
    id: t.id,
    title: t.title,
    notes: t.notes,
    dueDate: t.due_date,
    completed: t.completed,
    completedAt: t.completed_at,
    createdBy: t.created_by,
    createdByName: t.created_by_name,
    createdAt: t.created_at,
  });
  if (path === '/api/v1/todos' && method === 'GET') {
    const items = DEMO_TODOS_LIVE.slice().sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      return b.created_at.localeCompare(a.created_at);
    });
    return ok({ items: items.map(toTodo), nextCursor: null });
  }
  if (path === '/api/v1/todos' && method === 'POST') {
    const body = await req.json().catch(() => ({}));
    if (!body.title?.trim()) {
      return NextResponse.json({ error: { code: 'VALIDATION', message: 'A title is required.' } }, { status: 400 });
    }
    const todo: DemoTodo = {
      id: `todo-${Date.now()}`,
      title: body.title.trim(),
      notes: body.notes ?? null,
      due_date: body.dueDate ?? null,
      completed: false,
      completed_at: null,
      created_by: user.id,
      created_by_name: user.name,
      created_at: new Date().toISOString(),
    };
    DEMO_TODOS_LIVE.unshift(todo);
    return ok(toTodo(todo), 201);
  }
  const todoMatch = path.match(/^\/api\/v1\/todos\/([^/]+)$/);
  if (todoMatch && method === 'PATCH') {
    const t = DEMO_TODOS_LIVE.find((x) => x.id === todoMatch[1]);
    if (!t) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'That task no longer exists.' } }, { status: 404 });
    const body = await req.json().catch(() => ({}));
    if (body.title !== undefined) t.title = body.title;
    if (body.notes !== undefined) t.notes = body.notes;
    if (body.dueDate !== undefined) t.due_date = body.dueDate;
    if (body.completed !== undefined) {
      t.completed = !!body.completed;
      t.completed_at = t.completed ? new Date().toISOString() : null;
    }
    return ok(toTodo(t));
  }
  if (todoMatch && method === 'DELETE') {
    const idx = DEMO_TODOS_LIVE.findIndex((x) => x.id === todoMatch[1]);
    if (idx < 0) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'That task no longer exists.' } }, { status: 404 });
    DEMO_TODOS_LIVE.splice(idx, 1);
    return ok({ id: todoMatch[1], deleted: true });
  }

  // ── Purchases (demo: in-memory) ──
  const purchaseTotal = (p: DemoPurchase) =>
    p.items.reduce((s, i) => s + i.quantityOrdered * i.unitCost, 0);
  const toPurchaseRow = (p: DemoPurchase) => ({
    id: p.id,
    referenceNumber: p.referenceNumber,
    invoiceNumber: p.invoiceNumber,
    paymentMethod: p.paymentMethod,
    supplierId: p.supplierId,
    supplierName: p.supplierName,
    status: p.status,
    orderedAt: p.orderedAt,
    receivedAt: p.receivedAt,
    cancelledAt: p.cancelledAt,
    notes: p.notes,
    createdBy: p.createdBy,
    createdByName: p.createdByName,
    itemCount: p.items.length,
    totalCost: purchaseTotal(p),
    createdAt: p.createdAt,
  });

  if (path === '/api/v1/purchases' && method === 'GET') {
    const denied = mgrOnly();
    if (denied) return denied;
    let items = DEMO_PURCHASES.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const statusParam = req.nextUrl.searchParams.get('status');
    if (statusParam) items = items.filter((p) => p.status === statusParam);
    return ok({ items: items.map(toPurchaseRow), nextCursor: null });
  }
  if (path === '/api/v1/purchases' && method === 'POST') {
    const denied = mgrOnly();
    if (denied) return denied;
    const body = await req.json().catch(() => ({}));
    const supIdx = parseInt(String(body.supplierId ?? '').replace('sup-', ''), 10);
    const supplierName = DEMO_SUPPLIERS[supIdx] ?? null;
    const lines: Array<{ productId: string; quantityOrdered: number; unitCost: number }> = body.items || [];
    if (!supplierName || lines.length === 0) {
      return NextResponse.json({ error: { code: 'VALIDATION', message: 'Supplier and at least one item are required.' } }, { status: 400 });
    }
    const purchase: DemoPurchase = {
      id: `po-${Date.now()}`,
      referenceNumber: body.referenceNumber || `PO-${Date.now().toString(36).toUpperCase()}`,
      invoiceNumber: body.invoiceNumber ?? null,
      paymentMethod: body.paymentMethod === 'momo' ? 'momo' : 'cash',
      supplierId: body.supplierId,
      supplierName,
      status: 'draft',
      orderedAt: null,
      receivedAt: null,
      cancelledAt: null,
      notes: body.notes ?? null,
      createdBy: user.id,
      createdByName: user.name,
      createdAt: new Date().toISOString(),
      paymentDeductedAt: null,
      items: lines.map((l, i) => {
        const p = DEMO_PRODUCTS.find((x) => x.id === l.productId);
        return {
          id: `poi-${Date.now()}-${i}`,
          productId: l.productId,
          productName: p?.name ?? 'Unknown',
          sku: p?.sku ?? null,
          quantityOrdered: l.quantityOrdered,
          quantityReceived: 0,
          unitCost: l.unitCost,
        };
      }),
    };
    DEMO_PURCHASES.unshift(purchase);
    return ok(toPurchaseRow(purchase), 201);
  }
  const purchaseMatch = path.match(/^\/api\/v1\/purchases\/([^/]+)(\/receive|\/cancel|\/order)?$/);
  if (purchaseMatch && method === 'GET' && !purchaseMatch[2]) {
    const denied = mgrOnly();
    if (denied) return denied;
    const p = DEMO_PURCHASES.find((x) => x.id === purchaseMatch[1]);
    if (!p) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'That purchase order no longer exists.' } }, { status: 404 });
    return ok({ ...toPurchaseRow(p), items: p.items });
  }
  if (purchaseMatch && purchaseMatch[2] === '/receive' && method === 'POST') {
    const denied = mgrOnly();
    if (denied) return denied;
    const p = DEMO_PURCHASES.find((x) => x.id === purchaseMatch[1]);
    if (!p) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'That purchase order no longer exists.' } }, { status: 404 });
    if (p.status !== 'draft' && p.status !== 'ordered') {
      return NextResponse.json({ error: { code: 'PURCHASE_NOT_RECEIVABLE', message: 'This order cannot be received.' } }, { status: 409 });
    }
    p.status = 'received';
    p.receivedAt = new Date().toISOString();
    for (const it of p.items) {
      it.quantityReceived = it.quantityOrdered;
      const prod = DEMO_PRODUCTS.find((x) => x.id === it.productId);
      if (prod) {
        prod.quantity_warehouse += it.quantityOrdered;
        prod.quantity_on_hand += it.quantityOrdered;
        pushMovement({
          productId: prod.id, productName: prod.name, sku: prod.sku, movementType: 'purchase_receipt',
          quantityChange: it.quantityOrdered, unitCost: it.unitCost, referenceType: 'purchase',
          notes: null, createdByName: user.name,
        });
      }
    }
    // Auto-deduct the payment (guarded by paymentDeductedAt)
    let deducted = false;
    const total = purchaseTotal(p);
    if (!p.paymentDeductedAt && total > 0) {
      const label = `Purchase ${p.referenceNumber}${p.invoiceNumber ? ` (Invoice ${p.invoiceNumber})` : ''}`;
      if (p.paymentMethod === 'momo') {
        let next = Math.round((DEMO_MOMO.balance - total) * 100) / 100;
        let notes = `Payment for ${label} — auto-deducted on receive.`;
        if (next < 0) {
          notes += ` MoMo balance was only ${DEMO_MOMO.balance.toFixed(2)}; shortfall of ${Math.abs(next).toFixed(2)} not covered.`;
          next = 0;
        }
        DEMO_MOMO.entries.push({
          id: `momo-${Date.now()}`, entryType: 'withdrawal', amount: total, balanceAfter: next,
          reference: p.referenceNumber, notes, createdBy: user.id, createdByName: user.name,
          createdAt: new Date().toISOString(),
        });
        DEMO_MOMO.balance = next;
      } else {
        DEMO_CASHOUTS.push({
          id: `co-${Date.now()}`,
          referenceNumber: `C-${String(DEMO_CASHOUTS.length + 1).padStart(6, '0')}`,
          amount: total, cashedAt: new Date().toISOString(), cashedBy: user.id,
          cashedByName: user.name,
          notes: `Payment for ${label} — auto-deducted on receive.`,
          createdAt: new Date().toISOString(),
        });
      }
      p.paymentDeductedAt = new Date().toISOString();
      deducted = true;
    }
    return ok({ id: p.id, received: true, paymentDeducted: deducted, paymentMethod: p.paymentMethod, paymentAmount: total });
  }
  if (purchaseMatch && purchaseMatch[2] === '/order' && method === 'POST') {
    const denied = mgrOnly();
    if (denied) return denied;
    const p = DEMO_PURCHASES.find((x) => x.id === purchaseMatch[1]);
    if (!p) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'That purchase order no longer exists.' } }, { status: 404 });
    if (p.status !== 'draft') {
      return NextResponse.json({ error: { code: 'NOT_ORDERABLE', message: 'Only draft purchase orders can be marked as ordered.' } }, { status: 409 });
    }
    p.status = 'ordered';
    p.orderedAt = new Date().toISOString();
    return ok({ id: p.id, ordered: true });
  }
  if (purchaseMatch && purchaseMatch[2] === '/cancel' && method === 'POST') {
    const denied = mgrOnly();
    if (denied) return denied;
    const p = DEMO_PURCHASES.find((x) => x.id === purchaseMatch[1]);
    if (!p) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'That purchase order no longer exists.' } }, { status: 404 });
    if (p.status !== 'draft' && p.status !== 'ordered') {
      return NextResponse.json({ error: { code: 'NOT_CANCELLABLE', message: 'Only draft or ordered purchase orders can be cancelled.' } }, { status: 409 });
    }
    p.status = 'cancelled';
    p.cancelledAt = new Date().toISOString();
    return ok({ id: p.id, cancelled: true });
  }

  // ── Reports: stock / low stock / movements / daily sales (demo) ──
  const toStockRow = (p: (typeof DEMO_PRODUCTS)[number]) => {
    const reason = lowStockReason({
      productType: p.product_type,
      categoryName: p.category,
      quantityShop: p.quantity_shop,
      quantityWarehouse: p.quantity_warehouse,
      quantityOnHand: p.quantity_on_hand,
      reorderLevel: p.reorder_level,
    });
    return {
      id: p.id,
      name: p.name,
      sku: p.sku,
      categoryName: p.category,
      productType: p.product_type,
      quantityShop: p.quantity_shop,
      quantityWarehouse: p.quantity_warehouse,
      quantityOnHand: p.quantity_on_hand,
      reorderLevel: p.reorder_level,
      sellingPrice: p.selling_price,
      isLow: reason != null,
      lowReason: reason,
    };
  };
  if (path === '/api/v1/reports/stock' && method === 'GET') {
    const denied = mgrOnly();
    if (denied) return denied;
    return ok({ items: DEMO_PRODUCTS.filter((p) => p.active).map(toStockRow) });
  }
  if (path === '/api/v1/reports/low-stock' && method === 'GET') {
    const denied = mgrOnly();
    if (denied) return denied;
    return ok({ items: DEMO_PRODUCTS.filter((p) => p.active).map(toStockRow).filter((r) => r.isLow) });
  }
  if (path === '/api/v1/reports/movements' && method === 'GET') {
    const denied = mgrOnly();
    if (denied) return denied;
    const now = Date.now();
    const fromParam = req.nextUrl.searchParams.get('from') || new Date(now - 30 * 86400_000).toISOString();
    const toParam = req.nextUrl.searchParams.get('to') || new Date(now).toISOString();
    const typeParam = req.nextUrl.searchParams.get('type');
    let items = DEMO_MOVEMENTS.filter((m) => m.createdAt >= fromParam && m.createdAt <= toParam);
    if (typeParam) items = items.filter((m) => m.movementType === typeParam);
    return ok({ items: items.slice(0, 200), from: fromParam, to: toParam });
  }
  if (path === '/api/v1/reports/daily-sales' && method === 'GET') {
    const denied = mgrOnly();
    if (denied) return denied;
    const date = req.nextUrl.searchParams.get('date');
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: { code: 'INVALID_DATE', message: 'Pass ?date=YYYY-MM-DD.' } }, { status: 400 });
    }
    const daySales = DEMO_SALES.filter((s) => s.status === 'completed' && s.sold_at.slice(0, 10) === date);
    const grouped = new Map<string, { name: string; quantity: number; unitPrice: number; lineTotal: number; isBishop: boolean }>();
    for (const s of daySales) {
      for (const i of s.items) {
        const prod = DEMO_PRODUCTS.find((p) => p.name === i.name);
        const isBishop = prod
          ? prod.product_type === 'bishop_books' || prod.category === 'Bishop Books'
          : false;
        const key = `${i.name}|${i.unit_price}`;
        const cur = grouped.get(key) ?? { name: i.name, quantity: 0, unitPrice: i.unit_price, lineTotal: 0, isBishop };
        cur.quantity += i.quantity;
        cur.lineTotal += i.quantity * i.unit_price;
        grouped.set(key, cur);
      }
    }
    const all = [...grouped.values()];
    const bishopItems = all.filter((i) => i.isBishop);
    const otherItems = all.filter((i) => !i.isBishop);
    const sumItems = (arr: typeof all) => Math.round(arr.reduce((s, i) => s + i.lineTotal, 0) * 100) / 100;
    const cashTotal = daySales.filter((s) => s.payment_method === 'cash').reduce((s, x) => s + x.total, 0);
    const momoTotal = daySales.filter((s) => s.payment_method === 'mobile_money').reduce((s, x) => s + x.total, 0);
    const grandTotal = daySales.reduce((s, x) => s + x.total, 0);
    return ok({
      date,
      shopName: DEMO_SETTINGS.shop_name,
      bishop: { items: bishopItems.map((i) => ({ productId: '', ...i })), subtotal: sumItems(bishopItems) },
      other: { items: otherItems.map((i) => ({ productId: '', ...i })), subtotal: sumItems(otherItems) },
      cashTotal: Math.round(cashTotal * 100) / 100,
      momoTotal: Math.round(momoTotal * 100) / 100,
      grandTotal: Math.round(grandTotal * 100) / 100,
      transactions: daySales.length,
    });
  }

  // Fallback: not implemented in demo
  return NextResponse.json(
    { error: { code: 'DEMO_LIMIT', message: 'This action needs a real database. Connect Neon to unlock it.' } },
    { status: 501 }
  );
}

export function isDemoRequest(req: NextRequest): boolean {
  return !process.env.DATABASE_URL;
}
