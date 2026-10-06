-- ═══ 0006: tier pricing on sales ══════════════════════════════════════════════
-- Price lists: a sale line can be sold at the standard price or at a named tier
-- (bishop / sons_of_prophet / pastor_deji). Tier prices fall back to
-- selling_price when a tier price is unset. Old rows keep price_tier='standard',
-- so historical totals are unchanged.

ALTER TABLE sale_items
  ADD COLUMN IF NOT EXISTS price_tier TEXT NOT NULL DEFAULT 'standard';

-- record_sale: tier-aware, sells from SHOP stock (location-aware version from 0004)
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
  v_price    NUMERIC(12,2);
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
    SELECT (i->>'productId')::uuid AS product_id,
           COALESCE(NULLIF(TRIM(i->>'priceTier'), ''), 'standard') AS price_tier,
           SUM((i->>'quantity')::int)::int AS qty
    FROM jsonb_array_elements(p_items) AS i
    GROUP BY 1, 2
    ORDER BY 1, 2
  LOOP
    IF r.qty <= 0 THEN RAISE EXCEPTION 'INVALID_QUANTITY'; END IF;

    SELECT id, name, selling_price, cost_price, quantity_shop,
           price_bishop, price_sons_of_prophet, price_pastor_deji
      INTO p FROM products WHERE id = r.product_id AND active FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'ITEM_NOT_FOUND'; END IF;
    IF p.quantity_shop < r.qty THEN RAISE EXCEPTION 'INSUFFICIENT_STOCK: %', p.name; END IF;

    -- Tier price resolution: unknown/blank tiers fall back to the standard price.
    v_price := CASE r.price_tier
      WHEN 'bishop'          THEN COALESCE(p.price_bishop, p.selling_price)
      WHEN 'sons_of_prophet' THEN COALESCE(p.price_sons_of_prophet, p.selling_price)
      WHEN 'pastor_deji'     THEN COALESCE(p.price_pastor_deji, p.selling_price)
      ELSE p.selling_price
    END;

    UPDATE products
       SET quantity_shop = quantity_shop - r.qty,
           quantity_on_hand = quantity_on_hand - r.qty,
           updated_at = NOW()
     WHERE id = p.id;

    INSERT INTO sale_items (id, sale_id, product_id, quantity, unit_price, unit_cost, price_tier)
    VALUES (gen_random_uuid(), v_sale_id, p.id, r.qty, v_price, p.cost_price, r.price_tier);

    INSERT INTO stock_movements (id, product_id, movement_type, quantity_change, unit_cost,
                                 reference_type, reference_id, created_by)
    VALUES (gen_random_uuid(), p.id, 'sale', -r.qty, p.cost_price, 'sale', v_sale_id, p_user);

    v_subtotal := v_subtotal + v_price * r.qty;
  END LOOP;

  IF p_discount < 0 OR p_discount > v_subtotal THEN RAISE EXCEPTION 'INVALID_DISCOUNT'; END IF;
  IF p_tendered IS NOT NULL AND p_tendered < v_subtotal - p_discount THEN
    RAISE EXCEPTION 'TENDERED_TOO_LOW'; END IF;

  v_receipt := 'R-' || lpad(nextval('receipt_seq')::text, 6, '0');
  UPDATE sales SET receipt_number = v_receipt, subtotal = v_subtotal,
                   discount = p_discount, total = v_subtotal - p_discount
   WHERE id = v_sale_id;

  RETURN v_sale_id;
END $$;
