-- 0008_purchase_payment.sql
-- Purchases record how the supplier was paid (cash / MoMo). When a purchase
-- is received, the total is automatically deducted from that balance:
-- cash → a cashouts entry, momo → a momo_entries withdrawal.
-- payment_deducted_at guards against double deduction.

ALTER TABLE purchases ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'cash'
  CHECK (payment_method IN ('cash', 'momo'));
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS payment_deducted_at TIMESTAMPTZ;
