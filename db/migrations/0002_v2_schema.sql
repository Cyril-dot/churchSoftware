-- 0002_v2_schema.sql — additive & safe to run on an existing database

-- ── Settings (was per-browser localStorage) ─────────────────────────────
CREATE TABLE IF NOT EXISTS settings (
  id              SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  shop_name       TEXT NOT NULL DEFAULT 'Church Bookshop',
  currency_code   TEXT NOT NULL DEFAULT 'GHS',
  currency_symbol TEXT NOT NULL DEFAULT '₵',
  receipt_footer  TEXT NOT NULL DEFAULT 'Thank you and God bless you.',
  timezone        TEXT NOT NULL DEFAULT 'Africa/Accra',
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO settings (id) VALUES (1) ON CONFLICT DO NOTHING;

-- ── Users: session invalidation + housekeeping ──────────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS session_version      INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_login_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;

-- ── Categories: real uniqueness (NULL parent counts as one "root") ──────
ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_name_parent_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS categories_name_parent_uniq
  ON categories (lower(name), COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- ── Products: SKU unique only among active items; helpful indexes ───────
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_sku_key;
CREATE UNIQUE INDEX IF NOT EXISTS products_sku_active_uniq
  ON products (sku) WHERE sku IS NOT NULL AND active;
CREATE INDEX IF NOT EXISTS products_category_idx  ON products (category_id);
CREATE INDEX IF NOT EXISTS products_supplier_idx  ON products (supplier_id);
CREATE INDEX IF NOT EXISTS products_low_stock_idx ON products (quantity_on_hand, reorder_level) WHERE active;

-- ── Sales: discounts, tender/change, void, idempotency, sequential receipts
CREATE SEQUENCE IF NOT EXISTS receipt_seq START 1;

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS subtotal          NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS discount          NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
  ADD COLUMN IF NOT EXISTS amount_tendered   NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS payment_reference TEXT,
  ADD COLUMN IF NOT EXISTS note              TEXT,
  ADD COLUMN IF NOT EXISTS status            TEXT NOT NULL DEFAULT 'completed'
                                             CHECK (status IN ('completed','voided')),
  ADD COLUMN IF NOT EXISTS voided_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS voided_by         UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS void_reason       TEXT,
  ADD COLUMN IF NOT EXISTS idempotency_key   UUID;
UPDATE sales SET subtotal = total WHERE subtotal IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS sales_idem_uniq ON sales (idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS sales_sold_by_idx      ON sales (sold_by, sold_at DESC);
CREATE INDEX IF NOT EXISTS sale_items_sale_idx    ON sale_items (sale_id);
CREATE INDEX IF NOT EXISTS sale_items_product_idx ON sale_items (product_id);

-- ── Purchases ───────────────────────────────────────────────────────────
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS purchase_items_purchase_idx ON purchase_items (purchase_id);
CREATE INDEX IF NOT EXISTS purchases_supplier_idx      ON purchases (supplier_id);

-- ── Audit log ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id          BIGSERIAL PRIMARY KEY,
  actor_id    UUID REFERENCES users(id),
  action      TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id   TEXT,
  details     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS audit_log_created_idx ON audit_log (created_at DESC);

-- ── Login attempts (rate limiting without server memory) ────────────────
CREATE TABLE IF NOT EXISTS login_attempts (
  id         BIGSERIAL PRIMARY KEY,
  email      TEXT NOT NULL,
  ip         TEXT,
  succeeded  BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS login_attempts_email_idx ON login_attempts (email, created_at DESC);
