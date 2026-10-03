-- 0003_functions.sql — money-critical logic lives in the database

-- ═══ record_sale ═══════════════════════════════════════════════════════
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

    SELECT id, name, selling_price, cost_price, quantity_on_hand
      INTO p FROM products WHERE id = r.product_id AND active FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'ITEM_NOT_FOUND'; END IF;
    IF p.quantity_on_hand < r.qty THEN RAISE EXCEPTION 'INSUFFICIENT_STOCK: %', p.name; END IF;

    UPDATE products SET quantity_on_hand = quantity_on_hand - r.qty, updated_at = NOW() WHERE id = p.id;

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

-- ═══ void_sale ═════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION void_sale(p_sale UUID, p_user UUID, p_reason TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE s RECORD; it RECORD;
BEGIN
  SELECT id, status INTO s FROM sales WHERE id = p_sale FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SALE_NOT_FOUND'; END IF;
  IF s.status = 'voided' THEN RAISE EXCEPTION 'ALREADY_VOIDED'; END IF;

  FOR it IN SELECT product_id, quantity, unit_cost FROM sale_items
            WHERE sale_id = p_sale ORDER BY product_id LOOP
    UPDATE products SET quantity_on_hand = quantity_on_hand + it.quantity, updated_at = NOW()
     WHERE id = it.product_id;
    INSERT INTO stock_movements (id, product_id, movement_type, quantity_change, unit_cost,
                                 reference_type, reference_id, notes, created_by)
    VALUES (gen_random_uuid(), it.product_id, 'return', it.quantity, it.unit_cost,
            'sale', p_sale, 'Void: ' || COALESCE(p_reason, ''), p_user);
  END LOOP;

  UPDATE sales SET status = 'voided', voided_at = NOW(), voided_by = p_user, void_reason = p_reason
   WHERE id = p_sale;
END $$;

-- ═══ receive_purchase ══════════════════════════════════════════════════
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

-- ═══ adjust_stock ══════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION adjust_stock(
  p_product UUID, p_user UUID, p_change INT, p_type TEXT, p_notes TEXT
) RETURNS INT
LANGUAGE plpgsql AS $$
DECLARE v_qty INT; v_cost NUMERIC(12,2);
BEGIN
  IF p_change = 0 THEN RAISE EXCEPTION 'INVALID_QUANTITY'; END IF;
  IF p_type NOT IN ('adjustment','damage','return') THEN RAISE EXCEPTION 'INVALID_TYPE'; END IF;

  UPDATE products SET quantity_on_hand = quantity_on_hand + p_change, updated_at = NOW()
   WHERE id = p_product AND active AND quantity_on_hand + p_change >= 0
   RETURNING quantity_on_hand, cost_price INTO v_qty, v_cost;
  IF NOT FOUND THEN RAISE EXCEPTION 'INSUFFICIENT_STOCK: item not found or would go negative'; END IF;

  INSERT INTO stock_movements (id, product_id, movement_type, quantity_change, unit_cost, notes, created_by)
  VALUES (gen_random_uuid(), p_product, p_type, p_change, v_cost, p_notes, p_user);

  RETURN v_qty;
END $$;
