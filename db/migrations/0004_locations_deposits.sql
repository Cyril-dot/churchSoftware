-- 0004_locations_deposits.sql
-- Shop/warehouse stock locations, barcodes, cover photos, stock transfers,
-- and cash deposit accounts (bank drops).

-- ═══ Product locations ═══════════════════════════════════════════════
ALTER TABLE products ADD COLUMN IF NOT EXISTS quantity_shop INTEGER NOT NULL DEFAULT 0
  CHECK (quantity_shop >= 0);
ALTER TABLE products ADD COLUMN IF NOT EXISTS quantity_warehouse INTEGER NOT NULL DEFAULT 0
  CHECK (quantity_warehouse >= 0);

-- Existing stock lives in the shop (it was all sellable before locations existed).
UPDATE products SET quantity_shop = quantity_on_hand
 WHERE quantity_on_hand > 0 AND quantity_shop = 0 AND quantity_warehouse = 0;

-- ═══ Barcode + cover photo ═══════════════════════════════════════════
ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS cover_photo_url TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS products_barcode_uniq
  ON products (barcode) WHERE barcode IS NOT NULL AND barcode <> '';

-- ═══ Stock transfers (warehouse <-> shop) ═════════════════════════════
CREATE TABLE IF NOT EXISTS stock_transfers (
  id UUID PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  from_location TEXT NOT NULL CHECK (from_location IN ('warehouse', 'shop')),
  to_location TEXT NOT NULL CHECK (to_location IN ('warehouse', 'shop')),
  notes TEXT,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (from_location <> to_location)
);
CREATE INDEX IF NOT EXISTS stock_transfers_product_idx
  ON stock_transfers (product_id, created_at DESC);

-- ═══ Extend stock movement types ═════════════════════════════════════
ALTER TABLE stock_movements DROP CONSTRAINT IF EXISTS stock_movements_movement_type_check;
ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_movement_type_check
  CHECK (movement_type IN ('purchase_receipt', 'sale', 'adjustment', 'return', 'damage',
                           'transfer_out', 'transfer_in'));

-- ═══ Deposit accounts (bank drops) ═══════════════════════════════════
CREATE TABLE IF NOT EXISTS deposit_accounts (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  bank_name TEXT,
  account_number TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS deposits (
  id UUID PRIMARY KEY,
  reference_number TEXT NOT NULL UNIQUE,
  deposit_account_id UUID NOT NULL REFERENCES deposit_accounts(id),
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  deposited_on DATE NOT NULL DEFAULT CURRENT_DATE,
  deposited_by UUID NOT NULL REFERENCES users(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS deposits_account_idx
  ON deposits (deposit_account_id, deposited_on DESC);
CREATE SEQUENCE IF NOT EXISTS deposit_seq;

-- ═══ Seed: suppliers ═════════════════════════════════════════════════
INSERT INTO suppliers (id, name) VALUES
  (gen_random_uuid(), 'Samster'),
  (gen_random_uuid(), 'Kipindi'),
  (gen_random_uuid(), 'Dominion Garment'),
  (gen_random_uuid(), 'Emmanuel Sai'),
  (gen_random_uuid(), 'Israel Oil'),
  (gen_random_uuid(), 'Bishop Oyedepo Church'),
  (gen_random_uuid(), 'AG Bookshop Head Office'),
  (gen_random_uuid(), 'Steps for Christ'),
  (gen_random_uuid(), 'Ghana Bible Society'),
  (gen_random_uuid(), 'Shopping Joy'),
  (gen_random_uuid(), 'CopyCat Images'),
  (gen_random_uuid(), 'Accra Central'),
  (gen_random_uuid(), 'China Mall'),
  (gen_random_uuid(), 'Dorilad'),
  (gen_random_uuid(), 'Mr Praise'),
  (gen_random_uuid(), 'AG Printing Press')
ON CONFLICT DO NOTHING;

-- ═══ Seed: deposit accounts ══════════════════════════════════════════
INSERT INTO deposit_accounts (id, name) VALUES
  (gen_random_uuid(), 'Bishop''s Bank Account'),
  (gen_random_uuid(), 'Bookshop Bank Account')
ON CONFLICT DO NOTHING;

-- ═══ Seed: product categories for the new types ══════════════════════
INSERT INTO categories (id, name) VALUES
  (gen_random_uuid(), 'Bishop Books'),
  (gen_random_uuid(), 'Other Authors'),
  (gen_random_uuid(), 'Bibles'),
  (gen_random_uuid(), 'Children Books'),
  (gen_random_uuid(), 'Children Bible'),
  (gen_random_uuid(), 'Other Items'),
  (gen_random_uuid(), 'Stationery'),
  (gen_random_uuid(), 'Gift'),
  (gen_random_uuid(), 'Apparel'),
  (gen_random_uuid(), 'Media')
ON CONFLICT DO NOTHING;

-- ═══ Updated functions: location-aware ═══════════════════════════════

-- record_sale: sell from SHOP stock
CREATE OR REPLACE FUNCTION record_sale(
  p_user            UUID,
  p_items           JSONB,
  p_payment_method  TEXT,
  p_discount        NUMERIC DEFAULT 0,
  p_tendered        NUMERIC DEFAULT NULL,
  p_reference       TEXT    DEFAULT NULL,
  p_note            TEXT    DEFAULT NULL,
  p_idempotency_key UUID    DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql AS $$
DECLARE
  v_sale_id  UUID := gen_random_uuid();
  v_existing UUID;
  v_subtotal NUMERIC(12,2) := 0;
  v_receipt  TEXT;
  r RECORD;
  p RECORD;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing FROM sales WHERE idempotency_key = p_idempotency_key;
    IF FOUND THEN RETURN v_existing; END IF;
  END IF;

  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'EMPTY_CART';
  END IF;

  INSERT INTO sales (id, receipt_number, payment_method, subtotal, discount, total,
                     amount_tendered, payment_reference, note, sold_by, idempotency_key)
  VALUES (v_sale_id, 'PENDING-' || v_sale_id::text, p_payment_method, 0, 0, 0,
          p_tendered, p_reference, p_note, p_user, p_idempotency_key);

  FOR r IN
    SELECT (i->>'productId')::uuid AS product_id, SUM((i->>'quantity')::int)::int AS qty
    FROM jsonb_array_elements(p_items) AS i
    GROUP BY 1
    ORDER BY 1
  LOOP
    IF r.qty <= 0 THEN RAISE EXCEPTION 'INVALID_QUANTITY'; END IF;

    SELECT id, name, selling_price, cost_price, quantity_shop
      INTO p FROM products WHERE id = r.product_id AND active FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'ITEM_NOT_FOUND'; END IF;
    IF p.quantity_shop < r.qty THEN RAISE EXCEPTION 'INSUFFICIENT_STOCK: %', p.name; END IF;

    UPDATE products
       SET quantity_shop = quantity_shop - r.qty,
           quantity_on_hand = quantity_on_hand - r.qty,
           updated_at = NOW()
     WHERE id = p.id;

    INSERT INTO sale_items (id, sale_id, product_id, quantity, unit_price, unit_cost)
    VALUES (gen_random_uuid(), v_sale_id, p.id, r.qty, p.selling_price, p.cost_price);

    INSERT INTO stock_movements (id, product_id, movement_type, quantity_change, unit_cost,
                                 reference_type, reference_id, created_by)
    VALUES (gen_random_uuid(), p.id, 'sale', -r.qty, p.cost_price, 'sale', v_sale_id, p_user);

    v_subtotal := v_subtotal + p.selling_price * r.qty;
  END LOOP;

  IF p_discount < 0 OR p_discount > v_subtotal THEN RAISE EXCEPTION 'INVALID_DISCOUNT'; END IF;
  IF p_tendered IS NOT NULL AND p_tendered < v_subtotal - p_discount THEN
    RAISE EXCEPTION 'TENDERED_TOO_LOW';
  END IF;

  v_receipt := 'R-' || lpad(nextval('receipt_seq')::text, 6, '0');
  UPDATE sales SET receipt_number = v_receipt, subtotal = v_subtotal,
                   discount = p_discount, total = v_subtotal - p_discount
   WHERE id = v_sale_id;

  RETURN v_sale_id;
END $$;

-- void_sale: return stock to SHOP
CREATE OR REPLACE FUNCTION void_sale(p_sale UUID, p_user UUID, p_reason TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE s RECORD; it RECORD;
BEGIN
  SELECT id, status INTO s FROM sales WHERE id = p_sale FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SALE_NOT_FOUND'; END IF;
  IF s.status = 'voided' THEN RAISE EXCEPTION 'ALREADY_VOIDED'; END IF;

  FOR it IN SELECT product_id, quantity, unit_cost FROM sale_items
            WHERE sale_id = p_sale ORDER BY product_id LOOP
    UPDATE products
       SET quantity_shop = quantity_shop + it.quantity,
           quantity_on_hand = quantity_on_hand + it.quantity,
           updated_at = NOW()
     WHERE id = it.product_id;
    INSERT INTO stock_movements (id, product_id, movement_type, quantity_change, unit_cost,
                                 reference_type, reference_id, notes, created_by)
    VALUES (gen_random_uuid(), it.product_id, 'return', it.quantity, it.unit_cost,
            'sale', p_sale, 'Void: ' || COALESCE(p_reason, ''), p_user);
  END LOOP;

  UPDATE sales SET status = 'voided', voided_at = NOW(), voided_by = p_user, void_reason = p_reason
   WHERE id = p_sale;
END $$;

-- receive_purchase: stock arrives at the WAREHOUSE
CREATE OR REPLACE FUNCTION receive_purchase(p_purchase UUID, p_user UUID) RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE it RECORD;
BEGIN
  PERFORM 1 FROM purchases WHERE id = p_purchase AND status IN ('draft','ordered') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PURCHASE_NOT_RECEIVABLE'; END IF;

  FOR it IN SELECT id, product_id, quantity_ordered, unit_cost
              FROM purchase_items WHERE purchase_id = p_purchase ORDER BY product_id, id LOOP
    UPDATE products SET
      cost_price = CASE WHEN quantity_on_hand + it.quantity_ordered = 0 THEN it.unit_cost
                        ELSE ROUND((quantity_on_hand * cost_price + it.quantity_ordered * it.unit_cost)
                                   / (quantity_on_hand + it.quantity_ordered), 2) END,
      quantity_warehouse = quantity_warehouse + it.quantity_ordered,
      quantity_on_hand = quantity_on_hand + it.quantity_ordered,
      updated_at = NOW()
    WHERE id = it.product_id;

    UPDATE purchase_items SET quantity_received = quantity_ordered WHERE id = it.id;

    INSERT INTO stock_movements (id, product_id, movement_type, quantity_change, unit_cost,
                                 reference_type, reference_id, created_by)
    VALUES (gen_random_uuid(), it.product_id, 'purchase_receipt', it.quantity_ordered, it.unit_cost,
            'purchase', p_purchase, p_user);
  END LOOP;

  UPDATE purchases SET status = 'received', received_at = NOW() WHERE id = p_purchase;
END $$;

-- adjust_stock: adjust a specific location (shop or warehouse)
CREATE OR REPLACE FUNCTION adjust_stock(
  p_product UUID, p_user UUID, p_change INT, p_type TEXT, p_notes TEXT,
  p_location TEXT DEFAULT 'shop'
) RETURNS INT
LANGUAGE plpgsql AS $$
DECLARE v_qty INT; v_cost NUMERIC(12,2);
BEGIN
  IF p_change = 0 THEN RAISE EXCEPTION 'INVALID_QUANTITY'; END IF;
  IF p_type NOT IN ('adjustment','damage','return') THEN RAISE EXCEPTION 'INVALID_TYPE'; END IF;
  IF p_location NOT IN ('shop','warehouse') THEN RAISE EXCEPTION 'INVALID_LOCATION'; END IF;

  IF p_location = 'shop' THEN
    UPDATE products
       SET quantity_shop = quantity_shop + p_change,
           quantity_on_hand = quantity_on_hand + p_change,
           updated_at = NOW()
     WHERE id = p_product AND active AND quantity_shop + p_change >= 0
     RETURNING quantity_shop, cost_price INTO v_qty, v_cost;
  ELSE
    UPDATE products
       SET quantity_warehouse = quantity_warehouse + p_change,
           quantity_on_hand = quantity_on_hand + p_change,
           updated_at = NOW()
     WHERE id = p_product AND active AND quantity_warehouse + p_change >= 0
     RETURNING quantity_warehouse, cost_price INTO v_qty, v_cost;
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'INSUFFICIENT_STOCK: item not found or would go negative'; END IF;

  INSERT INTO stock_movements (id, product_id, movement_type, quantity_change, unit_cost, notes, created_by)
  VALUES (gen_random_uuid(), p_product, p_type, p_change, v_cost,
          COALESCE(p_notes,'') || ' [' || p_location || ']', p_user);

  RETURN v_qty;
END $$;

-- transfer_stock: move units between warehouse and shop (atomic)
CREATE OR REPLACE FUNCTION transfer_stock(
  p_product UUID, p_user UUID, p_quantity INT,
  p_from TEXT, p_to TEXT, p_notes TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE v_transfer UUID := gen_random_uuid();
BEGIN
  IF p_quantity <= 0 THEN RAISE EXCEPTION 'INVALID_QUANTITY'; END IF;
  IF p_from NOT IN ('warehouse','shop') OR p_to NOT IN ('warehouse','shop') THEN
    RAISE EXCEPTION 'INVALID_LOCATION';
  END IF;
  IF p_from = p_to THEN RAISE EXCEPTION 'SAME_LOCATION'; END IF;

  PERFORM 1 FROM products WHERE id = p_product AND active FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ITEM_NOT_FOUND'; END IF;

  IF p_from = 'warehouse' THEN
    UPDATE products
       SET quantity_warehouse = quantity_warehouse - p_quantity,
           quantity_shop = quantity_shop + p_quantity,
           updated_at = NOW()
     WHERE id = p_product AND quantity_warehouse >= p_quantity;
  ELSE
    UPDATE products
       SET quantity_shop = quantity_shop - p_quantity,
           quantity_warehouse = quantity_warehouse + p_quantity,
           updated_at = NOW()
     WHERE id = p_product AND quantity_shop >= p_quantity;
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'INSUFFICIENT_STOCK: not enough in %', p_from; END IF;

  INSERT INTO stock_transfers (id, product_id, quantity, from_location, to_location, notes, created_by)
  VALUES (v_transfer, p_product, p_quantity, p_from, p_to, p_notes, p_user);

  INSERT INTO stock_movements (id, product_id, movement_type, quantity_change,
                               reference_type, reference_id, notes, created_by)
  VALUES (gen_random_uuid(), p_product, 'transfer_out', -p_quantity,
          'transfer', v_transfer, COALESCE(p_notes,'') || ' [' || p_from || ' → ' || p_to || ']', p_user),
         (gen_random_uuid(), p_product, 'transfer_in', p_quantity,
          'transfer', v_transfer, COALESCE(p_notes,'') || ' [' || p_from || ' → ' || p_to || ']', p_user);
END $$;
