// Demo mode data — used when DATABASE_URL is not set.
// Lets anyone test the full app without a Neon database.

export interface DemoProduct {
  id: string;
  name: string;
  author_or_brand: string;
  sku: string;
  barcode: string | null;
  cover_photo_url: string | null;
  product_type: string;
  category: string;
  cost_price: number;
  selling_price: number;
  quantity_on_hand: number;
  quantity_shop: number;
  quantity_warehouse: number;
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
  'Bishop Books', 'Other Authors', 'Bibles', 'Children Books', 'Children Bible',
  'Other Items', 'Stationery', 'Gift', 'Apparel', 'Media',
];

export const DEMO_SUPPLIERS = [
  'Samster', 'Kipindi', 'Dominion Garment', 'Emmanuel Sai', 'Israel Oil',
  'Bishop Oyedepo Church', 'AG Bookshop Head Office', 'Steps for Christ',
  'Ghana Bible Society', 'Shopping Joy', 'CopyCat Images', 'Accra Central',
  'China Mall', 'Dorilad', 'Mr Praise', 'AG Printing Press',
];

export const DEMO_DEPOSIT_ACCOUNTS = [
  { id: 'da1', name: "Bishop's Bank Account", bank_name: 'GCB Bank', account_number: '1234567890' },
  { id: 'da2', name: 'Bookshop Bank Account', bank_name: 'Absa Ghana', account_number: '0987654321' },
];

export interface DemoDeposit {
  id: string;
  reference_number: string;
  deposit_account_id: string;
  amount: number;
  deposited_on: string;
  deposited_by: string;
  deposited_by_name: string;
  notes: string | null;
  created_at: string;
}

/* Seeded once with fixed amounts/dates — account totals, counts and the
   deposits timeline are all computed from this single dataset. */
export const DEMO_DEPOSITS: DemoDeposit[] = [
  {
    id: 'dep-1', reference_number: 'D-000001', deposit_account_id: 'da1',
    amount: 600, deposited_on: daysAgoISO(12),
    deposited_by: 'demo-manager', deposited_by_name: 'Kwame Mensah',
    notes: 'Sunday and midweek collections.',
    created_at: new Date(Date.now() - 12 * 86400_000).toISOString(),
  },
  {
    id: 'dep-2', reference_number: 'D-000002', deposit_account_id: 'da2',
    amount: 780, deposited_on: daysAgoISO(9),
    deposited_by: 'demo-admin', deposited_by_name: 'Ama Serwaa',
    notes: null,
    created_at: new Date(Date.now() - 9 * 86400_000).toISOString(),
  },
  {
    id: 'dep-3', reference_number: 'D-000003', deposit_account_id: 'da1',
    amount: 450, deposited_on: daysAgoISO(7),
    deposited_by: 'demo-admin', deposited_by_name: 'Ama Serwaa',
    notes: null,
    created_at: new Date(Date.now() - 7 * 86400_000).toISOString(),
  },
  {
    id: 'dep-4', reference_number: 'D-000004', deposit_account_id: 'da2',
    amount: 415.25, deposited_on: daysAgoISO(3),
    deposited_by: 'demo-manager', deposited_by_name: 'Kwame Mensah',
    notes: 'Book fair takings.',
    created_at: new Date(Date.now() - 3 * 86400_000).toISOString(),
  },
  {
    id: 'dep-5', reference_number: 'D-000005', deposit_account_id: 'da1',
    amount: 320.5, deposited_on: daysAgoISO(2),
    deposited_by: 'demo-manager', deposited_by_name: 'Kwame Mensah',
    notes: null,
    created_at: new Date(Date.now() - 2 * 86400_000).toISOString(),
  },
];

export const DEMO_PRODUCTS: DemoProduct[] = [
  { id: 'p1', name: 'KJV Study Bible (Large Print)', author_or_brand: 'Thomas Nelson', sku: 'BIB-001', barcode: '9780718075824', cover_photo_url: null, product_type: 'bibles', category: 'Bibles', cost_price: 85, selling_price: 120, quantity_on_hand: 34, quantity_shop: 24, quantity_warehouse: 10, reorder_level: 5, active: true },
  { id: 'p2', name: 'NIV Thinline Bible', author_or_brand: 'Zondervan', sku: 'BIB-002', barcode: '9780310422353', cover_photo_url: null, product_type: 'bibles', category: 'Bibles', cost_price: 65, selling_price: 95, quantity_on_hand: 23, quantity_shop: 18, quantity_warehouse: 5, reorder_level: 5, active: true },
  { id: 'p3', name: 'ESV Compact Bible', author_or_brand: 'Crossway', sku: 'BIB-003', barcode: null, cover_photo_url: null, product_type: 'bibles', category: 'Bibles', cost_price: 55, selling_price: 80, quantity_on_hand: 15, quantity_shop: 3, quantity_warehouse: 12, reorder_level: 5, active: true },
  { id: 'p4', name: 'New Morning Mercies', author_or_brand: 'Paul David Tripp', sku: 'DEV-001', barcode: null, cover_photo_url: null, product_type: 'other_authors', category: 'Other Authors', cost_price: 28, selling_price: 45, quantity_on_hand: 55, quantity_shop: 40, quantity_warehouse: 15, reorder_level: 8, active: true },
  { id: 'p5', name: 'Jesus Calling', author_or_brand: 'Sarah Young', sku: 'DEV-002', barcode: null, cover_photo_url: null, product_type: 'other_authors', category: 'Other Authors', cost_price: 25, selling_price: 40, quantity_on_hand: 35, quantity_shop: 35, quantity_warehouse: 0, reorder_level: 8, active: true },
  { id: 'p6', name: 'Mere Christianity', author_or_brand: 'C.S. Lewis', sku: 'THE-001', barcode: null, cover_photo_url: null, product_type: 'other_authors', category: 'Other Authors', cost_price: 22, selling_price: 35, quantity_on_hand: 28, quantity_shop: 28, quantity_warehouse: 0, reorder_level: 5, active: true },
  { id: 'p7', name: 'The Purpose Driven Life', author_or_brand: 'Rick Warren', sku: 'CL-001', barcode: null, cover_photo_url: null, product_type: 'bishop_books', category: 'Bishop Books', cost_price: 20, selling_price: 32, quantity_on_hand: 62, quantity_shop: 42, quantity_warehouse: 20, reorder_level: 8, active: true },
  { id: 'p8', name: 'Crazy Love', author_or_brand: 'Francis Chan', sku: 'CL-002', barcode: null, cover_photo_url: null, product_type: 'other_authors', category: 'Other Authors', cost_price: 18, selling_price: 30, quantity_on_hand: 2, quantity_shop: 2, quantity_warehouse: 0, reorder_level: 5, active: true },
  { id: 'p9', name: 'Chronicles of Narnia (Box Set)', author_or_brand: 'C.S. Lewis', sku: 'CHI-001', barcode: null, cover_photo_url: null, product_type: 'children_books', category: 'Children Books', cost_price: 60, selling_price: 95, quantity_on_hand: 12, quantity_shop: 12, quantity_warehouse: 0, reorder_level: 4, active: true },
  { id: 'p10', name: "Children's Illustrated Bible", author_or_brand: 'DK', sku: 'CHI-002', barcode: null, cover_photo_url: null, product_type: 'children_bible', category: 'Children Bible', cost_price: 35, selling_price: 55, quantity_on_hand: 30, quantity_shop: 20, quantity_warehouse: 10, reorder_level: 5, active: true },
  { id: 'p11', name: 'Hymnal — Songs of Praise', author_or_brand: 'Church Press', sku: 'MUS-001', barcode: null, cover_photo_url: null, product_type: 'media', category: 'Media', cost_price: 15, selling_price: 25, quantity_on_hand: 50, quantity_shop: 50, quantity_warehouse: 0, reorder_level: 10, active: true },
  { id: 'p12', name: 'Worship CD: Amazing Grace', author_or_brand: 'Choir', sku: 'MUS-002', barcode: null, cover_photo_url: null, product_type: 'media', category: 'Media', cost_price: 8, selling_price: 15, quantity_on_hand: 33, quantity_shop: 33, quantity_warehouse: 0, reorder_level: 8, active: true },
  { id: 'p13', name: 'Leather Notebook (A5)', author_or_brand: 'Faith Stationery', sku: 'STA-001', barcode: null, cover_photo_url: null, product_type: 'stationery', category: 'Stationery', cost_price: 12, selling_price: 22, quantity_on_hand: 90, quantity_shop: 60, quantity_warehouse: 30, reorder_level: 12, active: true },
  { id: 'p14', name: 'Scripture Pens (Pack of 5)', author_or_brand: 'Faith Stationery', sku: 'STA-002', barcode: null, cover_photo_url: null, product_type: 'stationery', category: 'Stationery', cost_price: 6, selling_price: 12, quantity_on_hand: 80, quantity_shop: 80, quantity_warehouse: 0, reorder_level: 15, active: true },
  { id: 'p15', name: 'Wooden Cross Keychain', author_or_brand: 'Holy Gifts', sku: 'GIF-001', barcode: null, cover_photo_url: null, product_type: 'gift', category: 'Gift', cost_price: 4, selling_price: 10, quantity_on_hand: 150, quantity_shop: 100, quantity_warehouse: 50, reorder_level: 20, active: true },
  { id: 'p16', name: '"Faith Over Fear" Mug', author_or_brand: 'Holy Gifts', sku: 'GIF-002', barcode: null, cover_photo_url: null, product_type: 'gift', category: 'Gift', cost_price: 10, selling_price: 20, quantity_on_hand: 45, quantity_shop: 45, quantity_warehouse: 0, reorder_level: 10, active: true },
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

/* ── Delivery orders (warehouse sales) ─────────────────────────────── */

export interface DemoDeliveryItem {
  product_id: string;
  name: string;
  quantity: number;
  unit_price: number;
}

export interface DemoDeliveryOrder {
  id: string;
  invoice_number: string;
  customer_name: string;
  contact_name: string | null;
  phone: string | null;
  address: string | null;
  status: 'pending' | 'delivered';
  notes: string | null;
  created_by: string;
  created_by_name: string;
  created_at: string;
  delivered_at: string | null;
  delivered_by_name: string | null;
  items: DemoDeliveryItem[];
}

export const DEMO_DELIVERY_ORDERS: DemoDeliveryOrder[] = [
  {
    id: 'del-1',
    invoice_number: 'INV-000001',
    customer_name: 'Grace Assembly — Kumasi',
    contact_name: 'Pastor Yaw Boateng',
    phone: '0244000111',
    address: 'Ahodwo, Kumasi',
    status: 'delivered',
    notes: 'Deliver after Sunday service.',
    created_by: 'demo-manager',
    created_by_name: 'Kwame Mensah',
    created_at: new Date(Date.now() - 3 * 86400_000).toISOString(),
    delivered_at: new Date(Date.now() - 2 * 86400_000).toISOString(),
    delivered_by_name: 'Kwame Mensah',
    items: [
      { product_id: 'p7', name: 'The Purpose Driven Life', quantity: 20, unit_price: 32 },
      { product_id: 'p1', name: 'KJV Study Bible (Large Print)', quantity: 5, unit_price: 120 },
    ],
  },
  {
    id: 'del-2',
    invoice_number: 'INV-000002',
    customer_name: 'Faith Chapel — Adenta',
    contact_name: 'Rev. Efua Grant',
    phone: '0209998877',
    address: 'Adenta Housing Down',
    status: 'pending',
    notes: null,
    created_by: 'demo-admin',
    created_by_name: 'Ama Serwaa',
    created_at: new Date(Date.now() - 1 * 86400_000).toISOString(),
    delivered_at: null,
    delivered_by_name: null,
    items: [{ product_id: 'p13', name: 'Leather Notebook (A5)', quantity: 30, unit_price: 22 }],
  },
];

/* ── Credit customers / accounts receivable ────────────────────────── */

export interface DemoCreditItem {
  product_id: string;
  name: string;
  quantity: number;
  unit_price: number;
}

export interface DemoCreditPayment {
  id: string;
  amount: number;
  paid_on: string;
  payment_method: string | null;
  notes: string | null;
  received_by_name: string;
}

export interface DemoCreditSale {
  id: string;
  reference_number: string;
  church_name: string;
  contact_name: string;
  phone: string | null;
  location: string | null;
  taken_on: string;
  due_date: string | null;
  notes: string | null;
  created_by: string;
  created_by_name: string;
  created_at: string;
  items: DemoCreditItem[];
  payments: DemoCreditPayment[];
}

function daysAgoISO(days: number): string {
  return new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
}

export const DEMO_CREDIT_SALES: DemoCreditSale[] = [
  {
    id: 'cred-1',
    reference_number: 'CR-000001',
    church_name: 'Pentecost Fellowship — Accra',
    contact_name: 'Pastor Daniel Osei',
    phone: '0244111222',
    location: 'Accra',
    taken_on: daysAgoISO(24),
    due_date: daysAgoISO(4), // overdue, nothing paid
    notes: 'Books for the youth conference.',
    created_by: 'demo-manager',
    created_by_name: 'Kwame Mensah',
    created_at: new Date(Date.now() - 24 * 86400_000).toISOString(),
    items: [
      { product_id: 'p7', name: 'The Purpose Driven Life', quantity: 10, unit_price: 32 },
      { product_id: 'p4', name: 'New Morning Mercies', quantity: 6, unit_price: 45 },
    ],
    payments: [],
  },
  {
    id: 'cred-2',
    reference_number: 'CR-000002',
    church_name: 'Bethel Chapel — Kumasi',
    contact_name: 'Pastor Akosua Frimpong',
    phone: '0207654321',
    location: 'Kumasi',
    taken_on: daysAgoISO(10),
    due_date: daysAgoISO(-11), // due in 11 days
    notes: null,
    created_by: 'demo-admin',
    created_by_name: 'Ama Serwaa',
    created_at: new Date(Date.now() - 10 * 86400_000).toISOString(),
    items: [{ product_id: 'p2', name: 'NIV Thinline Bible', quantity: 4, unit_price: 95 }],
    payments: [
      {
        id: 'cpay-1',
        amount: 150,
        paid_on: daysAgoISO(3),
        payment_method: 'mobile_money',
        notes: 'First instalment',
        received_by_name: 'Ama Serwaa',
      },
    ],
  },
  {
    id: 'cred-3',
    reference_number: 'CR-000003',
    church_name: 'Calvary Methodist — Adenta',
    contact_name: 'Rev. Kojo Annan',
    phone: '0277000999',
    location: 'Adenta',
    taken_on: daysAgoISO(30),
    due_date: daysAgoISO(16),
    notes: null,
    created_by: 'demo-manager',
    created_by_name: 'Kwame Mensah',
    created_at: new Date(Date.now() - 30 * 86400_000).toISOString(),
    items: [{ product_id: 'p11', name: 'Hymnal — Songs of Praise', quantity: 8, unit_price: 25 }],
    payments: [
      {
        id: 'cpay-2',
        amount: 200,
        paid_on: daysAgoISO(15),
        payment_method: 'cash',
        notes: 'Paid in full',
        received_by_name: 'Kwame Mensah',
      },
    ],
  },
];

/* ── Staff to-do list ──────────────────────────────────────────────── */

export interface DemoTodo {
  id: string;
  title: string;
  notes: string | null;
  due_date: string | null;
  completed: boolean;
  completed_at: string | null;
  created_by: string;
  created_by_name: string;
  created_at: string;
}

export const DEMO_TODOS: DemoTodo[] = [
  {
    id: 'todo-1',
    title: 'Restock Bibles shelf before Sunday',
    notes: 'KJV large print is running low in the shop.',
    due_date: daysAgoISO(-2),
    completed: false,
    completed_at: null,
    created_by: 'demo-admin',
    created_by_name: 'Ama Serwaa',
    created_at: new Date(Date.now() - 2 * 86400_000).toISOString(),
  },
  {
    id: 'todo-2',
    title: 'Call AG Bookshop Head Office about pending order',
    notes: null,
    due_date: null,
    completed: false,
    completed_at: null,
    created_by: 'demo-manager',
    created_by_name: 'Kwame Mensah',
    created_at: new Date(Date.now() - 1 * 86400_000).toISOString(),
  },
  {
    id: 'todo-3',
    title: 'Count cash drawer and record deposit',
    notes: null,
    due_date: daysAgoISO(1),
    completed: true,
    completed_at: new Date(Date.now() - 1 * 86400_000).toISOString(),
    created_by: 'demo-cashier',
    created_by_name: 'Efua Owusu',
    created_at: new Date(Date.now() - 3 * 86400_000).toISOString(),
  },
];

