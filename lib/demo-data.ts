// Demo mode data — used when DATABASE_URL is not set.
// Lets anyone test the full app without a Neon database.

export interface DemoProduct {
  id: string;
  name: string;
  author_or_brand: string;
  sku: string;
  category: string;
  cost_price: number;
  selling_price: number;
  quantity_on_hand: number;
  reorder_level: number;
  active: boolean;
}

export interface DemoSale {
  id: string;
  receipt_number: string;
  payment_method: string;
  subtotal: number;
  discount: number;
  total: number;
  amount_tendered: number | null;
  sold_by: string;
  cashier_name: string;
  sold_at: string;
  status: 'completed' | 'voided';
  items: Array<{ name: string; quantity: number; unit_price: number }>;
}

export const DEMO_USERS = [
  { id: 'demo-admin', name: 'Ama Serwaa', email: 'admin@church.org', role: 'admin' as const },
  { id: 'demo-manager', name: 'Kwame Mensah', email: 'manager@church.org', role: 'manager' as const },
  { id: 'demo-cashier', name: 'Efua Owusu', email: 'cashier@church.org', role: 'cashier' as const },
];

export const DEMO_CATEGORIES = [
  'Bibles', 'Devotionals', 'Theology', 'Christian Living',
  'Children', 'Music & Media', 'Stationery', 'Gifts',
];

export const DEMO_PRODUCTS: DemoProduct[] = [
  { id: 'p1', name: 'KJV Study Bible (Large Print)', author_or_brand: 'Thomas Nelson', sku: 'BIB-001', category: 'Bibles', cost_price: 85, selling_price: 120, quantity_on_hand: 24, reorder_level: 5, active: true },
  { id: 'p2', name: 'NIV Thinline Bible', author_or_brand: 'Zondervan', sku: 'BIB-002', category: 'Bibles', cost_price: 65, selling_price: 95, quantity_on_hand: 18, reorder_level: 5, active: true },
  { id: 'p3', name: 'ESV Compact Bible', author_or_brand: 'Crossway', sku: 'BIB-003', category: 'Bibles', cost_price: 55, selling_price: 80, quantity_on_hand: 3, reorder_level: 5, active: true },
  { id: 'p4', name: 'New Morning Mercies', author_or_brand: 'Paul David Tripp', sku: 'DEV-001', category: 'Devotionals', cost_price: 28, selling_price: 45, quantity_on_hand: 40, reorder_level: 8, active: true },
  { id: 'p5', name: 'Jesus Calling', author_or_brand: 'Sarah Young', sku: 'DEV-002', category: 'Devotionals', cost_price: 25, selling_price: 40, quantity_on_hand: 35, reorder_level: 8, active: true },
  { id: 'p6', name: 'Mere Christianity', author_or_brand: 'C.S. Lewis', sku: 'THE-001', category: 'Theology', cost_price: 22, selling_price: 35, quantity_on_hand: 28, reorder_level: 5, active: true },
  { id: 'p7', name: 'The Purpose Driven Life', author_or_brand: 'Rick Warren', sku: 'CL-001', category: 'Christian Living', cost_price: 20, selling_price: 32, quantity_on_hand: 42, reorder_level: 8, active: true },
  { id: 'p8', name: 'Crazy Love', author_or_brand: 'Francis Chan', sku: 'CL-002', category: 'Christian Living', cost_price: 18, selling_price: 30, quantity_on_hand: 2, reorder_level: 5, active: true },
  { id: 'p9', name: 'Chronicles of Narnia (Box Set)', author_or_brand: 'C.S. Lewis', sku: 'CHI-001', category: 'Children', cost_price: 60, selling_price: 95, quantity_on_hand: 12, reorder_level: 4, active: true },
  { id: 'p10', name: "Children's Illustrated Bible", author_or_brand: 'DK', sku: 'CHI-002', category: 'Children', cost_price: 35, selling_price: 55, quantity_on_hand: 20, reorder_level: 5, active: true },
  { id: 'p11', name: 'Hymnal — Songs of Praise', author_or_brand: 'Church Press', sku: 'MUS-001', category: 'Music & Media', cost_price: 15, selling_price: 25, quantity_on_hand: 50, reorder_level: 10, active: true },
  { id: 'p12', name: 'Worship CD: Amazing Grace', author_or_brand: 'Choir', sku: 'MUS-002', category: 'Music & Media', cost_price: 8, selling_price: 15, quantity_on_hand: 33, reorder_level: 8, active: true },
  { id: 'p13', name: 'Leather Notebook (A5)', author_or_brand: 'Faith Stationery', sku: 'STA-001', category: 'Stationery', cost_price: 12, selling_price: 22, quantity_on_hand: 60, reorder_level: 12, active: true },
  { id: 'p14', name: 'Scripture Pens (Pack of 5)', author_or_brand: 'Faith Stationery', sku: 'STA-002', category: 'Stationery', cost_price: 6, selling_price: 12, quantity_on_hand: 80, reorder_level: 15, active: true },
  { id: 'p15', name: 'Wooden Cross Keychain', author_or_brand: 'Holy Gifts', sku: 'GIF-001', category: 'Gifts', cost_price: 4, selling_price: 10, quantity_on_hand: 100, reorder_level: 20, active: true },
  { id: 'p16', name: '"Faith Over Fear" Mug', author_or_brand: 'Holy Gifts', sku: 'GIF-002', category: 'Gifts', cost_price: 10, selling_price: 20, quantity_on_hand: 45, reorder_level: 10, active: true },
];

// Generate 14 days of demo sales
function buildDemoSales(): DemoSale[] {
  const sales: DemoSale[] = [];
  const methods = ['cash', 'cash', 'mobile_money', 'card', 'cash', 'mobile_money'];
  let n = 0;
  for (let d = 13; d >= 0; d--) {
    const daySales = 3 + Math.floor(Math.random() * 5);
    for (let s = 0; s < daySales; s++) {
      n++;
      const itemCount = 1 + Math.floor(Math.random() * 3);
      const items: DemoSale['items'] = [];
      let subtotal = 0;
      const used = new Set<number>();
      for (let i = 0; i < itemCount; i++) {
        let idx = Math.floor(Math.random() * DEMO_PRODUCTS.length);
        while (used.has(idx)) idx = Math.floor(Math.random() * DEMO_PRODUCTS.length);
        used.add(idx);
        const p = DEMO_PRODUCTS[idx];
        const qty = 1 + Math.floor(Math.random() * 2);
        items.push({ name: p.name, quantity: qty, unit_price: p.selling_price });
        subtotal += p.selling_price * qty;
      }
      const discount = Math.random() < 0.15 ? Math.round(subtotal * 0.1) : 0;
      const total = subtotal - discount;
      const method = methods[Math.floor(Math.random() * methods.length)];
      const date = new Date();
      date.setDate(date.getDate() - d);
      date.setHours(9 + Math.floor(Math.random() * 9), Math.floor(Math.random() * 60));
      sales.push({
        id: `sale-${n}`,
        receipt_number: `R-${String(1000 + n).padStart(6, '0')}`,
        payment_method: method,
        subtotal,
        discount,
        total,
        amount_tendered: method === 'cash' ? Math.ceil(total / 10) * 10 : null,
        sold_by: n % 3 === 0 ? 'demo-manager' : 'demo-cashier',
        cashier_name: n % 3 === 0 ? 'Kwame Mensah' : 'Efua Owusu',
        sold_at: date.toISOString(),
        status: 'completed',
        items,
      });
    }
  }
  return sales.sort((a, b) => b.sold_at.localeCompare(a.sold_at));
}

export const DEMO_SALES: DemoSale[] = buildDemoSales();

export const DEMO_SETTINGS = {
  shop_name: 'Holy Hill Chapel Bookshop',
  currency_code: 'GHS',
  currency_symbol: '₵',
  receipt_footer: 'Thank you and God bless you.',
  timezone: 'Africa/Accra',
};
