// Demo mode API dispatcher — serves mock data when DATABASE_URL is not set.
// This lets anyone preview and test the full app without a Neon database.

import { NextRequest, NextResponse } from 'next/server';
import { DEMO_USERS, DEMO_PRODUCTS, DEMO_SALES, DEMO_SETTINGS, DEMO_CATEGORIES, DEMO_SUPPLIERS, DEMO_DEPOSIT_ACCOUNTS } from './demo-data';

const DEMO_MOMO = {
  balance: 1240.5,
  entries: [] as Array<{
    id: string; entryType: string; amount: number; balanceAfter: number;
    reference: string | null; notes: string | null;
    createdBy: string; createdByName: string; createdAt: string;
  }>,
};

const DEMO_CASHOUTS: Array<{
  id: string; referenceNumber: string; amount: number; cashedAt: string;
  cashedBy: string; cashedByName: string; notes: string | null; createdAt: string;
}> = [];

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
    if (lowStock) items = items.filter((p) => p.quantity_on_hand <= p.reorder_level);
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
      items: DEMO_DEPOSIT_ACCOUNTS.map((a) => ({
        ...a, active: true, totalDeposited: 1250 + Math.random() * 500,
        depositCount: 3, lastDepositOn: new Date().toISOString().slice(0, 10),
        createdAt: new Date().toISOString(),
      })),
    });
  }
  if (path === '/api/v1/deposits' && method === 'GET') {
    return ok({ items: [], nextCursor: null });
  }
  if (path === '/api/v1/deposits' && method === 'POST') {
    const body = await req.json().catch(() => ({}));
    const acct = DEMO_DEPOSIT_ACCOUNTS.find((a) => a.id === body.depositAccountId);
    return ok({
      id: `dep-demo-${Date.now()}`,
      referenceNumber: `D-${String(Math.floor(Math.random() * 900000) + 100000)}`,
      depositAccountId: body.depositAccountId,
      depositAccountName: acct?.name ?? 'Account',
      amount: body.amount ?? 0,
      depositedOn: body.depositedOn ?? new Date().toISOString().slice(0, 10),
      depositedBy: user.id,
      depositedByName: user.name,
      notes: body.notes ?? null,
      createdAt: new Date().toISOString(),
    }, 201);
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

  // Fallback: not implemented in demo
  return NextResponse.json(
    { error: { code: 'DEMO_LIMIT', message: 'This action needs a real database. Connect Neon to unlock it.' } },
    { status: 501 }
  );
}

export function isDemoRequest(req: NextRequest): boolean {
  return !process.env.DATABASE_URL;
}
