-- 0005_pricing_cash.sql
-- Reference field, price tiers, purchase invoice numbers,
-- MoMo balance log, and admin cash-outs.

-- ═══ Product reference + price tiers ══════════════════════════════
ALTER TABLE products ADD COLUMN IF NOT EXISTS reference TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS price_bishop NUMERIC(12,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS price_sons_of_prophet NUMERIC(12,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS price_pastor_deji NUMERIC(12,2);
-- selling_price remains the STANDARD price.
-- Backfill tiers from standard price where unset.
UPDATE products SET price_bishop = selling_price WHERE price_bishop IS NULL;
UPDATE products SET price_sons_of_prophet = selling_price WHERE price_sons_of_prophet IS NULL;
UPDATE products SET price_pastor_deji = selling_price WHERE price_pastor_deji IS NULL;

-- ═══ Purchase invoice number ══════════════════════════════════════
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS invoice_number TEXT;

-- ═══ MoMo balance log ════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS momo_entries (
  id UUID PRIMARY KEY,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('top_up', 'withdrawal', 'set_balance', 'sale', 'cashout')),
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  balance_after NUMERIC(12,2) NOT NULL CHECK (balance_after >= 0),
  reference TEXT,
  notes TEXT,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS momo_entries_created_idx ON momo_entries (created_at DESC);

-- ═══ Admin cash-outs (cash taken from the till) ═══════════════════
CREATE TABLE IF NOT EXISTS cashouts (
  id UUID PRIMARY KEY,
  reference_number TEXT NOT NULL UNIQUE,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  cashed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cashed_by UUID NOT NULL REFERENCES users(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS cashouts_cashed_idx ON cashouts (cashed_at DESC);
CREATE SEQUENCE IF NOT EXISTS cashout_seq;
