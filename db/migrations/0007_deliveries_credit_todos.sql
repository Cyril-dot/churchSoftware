-- 0007_deliveries_credit_todos.sql
-- Warehouse delivery orders + invoices, credit customers (accounts
-- receivable), and the shared staff to-do list.

-- ═══ New stock movement types ═════════════════════════════════════════
ALTER TABLE stock_movements DROP CONSTRAINT IF EXISTS stock_movements_movement_type_check;
ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_movement_type_check
  CHECK (movement_type IN ('purchase_receipt', 'sale', 'adjustment', 'return', 'damage',
                           'transfer_out', 'transfer_in', 'delivery', 'credit_sale'));

-- ═══ Delivery orders (warehouse sales to churches / outside buyers) ═══
CREATE TABLE IF NOT EXISTS delivery_orders (
  id UUID PRIMARY KEY,
  invoice_number TEXT NOT NULL UNIQUE,
  customer_name TEXT NOT NULL,            -- church / buyer name
  contact_name TEXT,                      -- person collecting / receiving
  phone TEXT,
  address TEXT,                           -- delivery destination / notes
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivered')),
  total NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  notes TEXT,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  delivered_by UUID REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS delivery_orders_created_idx
  ON delivery_orders (created_at DESC);

CREATE TABLE IF NOT EXISTS delivery_order_items (
  id UUID PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES delivery_orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
  unit_cost NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0)
);
CREATE INDEX IF NOT EXISTS delivery_order_items_order_idx
  ON delivery_order_items (order_id);

CREATE SEQUENCE IF NOT EXISTS delivery_seq;

-- ═══ Credit customers / accounts receivable ═══════════════════════════
-- One credit_sales row = one credit arrangement (a set of items taken on
-- credit). Part payments land in credit_payments; balance = total - paid.
CREATE TABLE IF NOT EXISTS credit_sales (
  id UUID PRIMARY KEY,
  reference_number TEXT NOT NULL UNIQUE,
  church_name TEXT NOT NULL,
  contact_name TEXT NOT NULL,             -- pastor / person responsible
  phone TEXT,
  location TEXT,                          -- e.g. Accra / Kumasi / Adenta
  taken_on DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  total NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  notes TEXT,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS credit_sales_due_idx
  ON credit_sales (due_date);

CREATE TABLE IF NOT EXISTS credit_sale_items (
  id UUID PRIMARY KEY,
  credit_sale_id UUID NOT NULL REFERENCES credit_sales(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
  unit_cost NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0)
);
CREATE INDEX IF NOT EXISTS credit_sale_items_sale_idx
  ON credit_sale_items (credit_sale_id);

CREATE TABLE IF NOT EXISTS credit_payments (
  id UUID PRIMARY KEY,
  credit_sale_id UUID NOT NULL REFERENCES credit_sales(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  paid_on DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method TEXT CHECK (payment_method IN ('cash', 'card', 'mobile_money', 'bank_transfer', 'other')),
  notes TEXT,
  received_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS credit_payments_sale_idx
  ON credit_payments (credit_sale_id, paid_on);

CREATE SEQUENCE IF NOT EXISTS credit_seq;

-- ═══ Staff to-do list (shared) ════════════════════════════════════════
CREATE TABLE IF NOT EXISTS todos (
  id UUID PRIMARY KEY,
  title TEXT NOT NULL,
  notes TEXT,
  due_date DATE,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS todos_created_idx ON todos (created_at DESC);
