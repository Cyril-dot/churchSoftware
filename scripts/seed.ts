/**
 * Seed demo data for the Church Bookshop.
 * Creates categories, products, a supplier, and demo users.
 * Run: npx tsx scripts/seed.ts
 *
 * Demo logins (password: "password123"):
 *   admin@church.org    / admin
 *   manager@church.org  / manager
 *   cashier@church.org  / cashier
 */
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { scrypt, randomBytes } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt) as (pw: string, salt: string, len: number) => Promise<Buffer>;
const { Client } = pg;

async function hashPassword(pw: string) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${(await scryptAsync(pw, salt, 64)).toString('hex')}`;
}

const CATEGORIES = [
  'Bibles', 'Devotionals', 'Theology', 'Christian Living',
  'Children', 'Music & Media', 'Stationery', 'Gifts',
];

const PRODUCTS: Array<[string, string, number, number, number, string]> = [
  // [name, author/brand, cost, price, qty, category]
  ['KJV Study Bible (Large Print)', 'Thomas Nelson', 85, 120, 24, 'Bibles'],
  ['NIV Thinline Bible', 'Zondervan', 65, 95, 18, 'Bibles'],
  ['ESV Compact Bible', 'Crossway', 55, 80, 30, 'Bibles'],
  ['New Morning Mercies', 'Paul David Tripp', 28, 45, 40, 'Devotionals'],
  ['Jesus Calling', 'Sarah Young', 25, 40, 35, 'Devotionals'],
  ['Mere Christianity', 'C.S. Lewis', 22, 35, 28, 'Theology'],
  ['The Purpose Driven Life', 'Rick Warren', 20, 32, 42, 'Christian Living'],
  ['Crazy Love', 'Francis Chan', 18, 30, 15, 'Christian Living'],
  ['The Chronicles of Narnia (Box Set)', 'C.S. Lewis', 60, 95, 12, 'Children'],
  ['Children\'s Illustrated Bible', 'DK', 35, 55, 20, 'Children'],
  ['Hymnal — Songs of Praise', 'Church Press', 15, 25, 50, 'Music & Media'],
  ['Worship CD: Amazing Grace', 'Choir', 8, 15, 33, 'Music & Media'],
  ['Leather Notebook (A5)', 'Faith Stationery', 12, 22, 60, 'Stationery'],
  ['Scripture Pens (Pack of 5)', 'Faith Stationery', 6, 12, 80, 'Stationery'],
  ['Wooden Cross Keychain', 'Holy Gifts', 4, 10, 100, 'Gifts'],
  ['"Faith Over Fear" Mug', 'Holy Gifts', 10, 20, 45, 'Gifts'],
];

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) {
    console.error('Set DATABASE_URL_UNPOOLED to seed.');
    process.exit(1);
  }
  const client = new Client({ connectionString: url });
  await client.connect();

  // Users
  const pwHash = await hashPassword('password123');
  const users = [
    ['Ama Serwaa', 'admin@church.org', 'admin'],
    ['Kwame Mensah', 'manager@church.org', 'manager'],
    ['Efua Owusu', 'cashier@church.org', 'cashier'],
  ];
  const userIds: Record<string, string> = {};
  for (const [name, email, role] of users) {
    const id = randomUUID();
    await client.query(
      `INSERT INTO users (id, name, email, password_hash, role)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
       RETURNING id`,
      [id, name, email, pwHash, role]
    );
    userIds[role] = id;
  }

  // Supplier
  const supplierId = randomUUID();
  await client.query(
    `INSERT INTO suppliers (id, name, contact_person, phone, email)
     VALUES ($1,'Christian Literature Supplies','John Doe','+233 24 000 0000','orders@cls.example')
     ON CONFLICT DO NOTHING`,
    [supplierId]
  );

  // Categories
  const catIds: Record<string, string> = {};
  for (const name of CATEGORIES) {
    const id = randomUUID();
    const { rows } = await client.query(
      `INSERT INTO categories (id, name) VALUES ($1,$2)
       ON CONFLICT DO NOTHING RETURNING id`,
      [id, name]
    );
    catIds[name] = rows[0]?.id || (await client.query(
      `SELECT id FROM categories WHERE lower(name) = lower($1)`, [name]
    )).rows[0].id;
  }

  // Products
  for (const [name, brand, cost, price, qty, cat] of PRODUCTS) {
    const id = randomUUID();
    await client.query(
      `INSERT INTO products (id, name, author_or_brand, category_id, supplier_id,
                             cost_price, selling_price, quantity_on_hand, reorder_level)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,5)
       ON CONFLICT DO NOTHING`,
      [id, name, brand, catIds[cat], supplierId, cost, price, qty]
    );
    // Opening stock movement
    await client.query(
      `INSERT INTO stock_movements (id, product_id, movement_type, quantity_change, unit_cost, notes, created_by)
       SELECT $1, $2, 'adjustment', $3, $4, 'Opening stock (seed)', $5
       WHERE NOT EXISTS (SELECT 1 FROM stock_movements WHERE product_id = $2)`,
      [randomUUID(), id, qty, cost, userIds['admin']]
    );
  }

  // Settings
  await client.query(
    `UPDATE settings SET shop_name = 'Holy Hill Chapel Bookshop',
       receipt_footer = 'Thank you and God bless you.' WHERE id = 1`
  );

  await client.end();
  console.log('Seed complete. Demo logins (password: password123):');
  console.log('  admin@church.org / manager@church.org / cashier@church.org');
}

main().catch((e) => { console.error(e); process.exit(1); });
