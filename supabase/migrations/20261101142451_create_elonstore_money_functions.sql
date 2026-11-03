/*
# Add secure wallet, purchase and escrow functions

1. New Functions (callable by signed-in users only)
- `deposit_funds(amount)`: adds demo funds to the caller's wallet.
- `withdraw_funds(amount)`: removes funds from the caller's wallet when the balance covers it.
- `transfer_funds(recipient_handle, amount)`: moves funds to another user by handle.
- `purchase_listing(listing_id)`: charges the buyer (flash price when active), reserves one unit of stock and opens an escrow order. Store-sold items are delivered instantly.
- `mark_order_delivered(order_id, note)`: seller records delivery details; the order moves from escrow to delivered.
- `release_order(order_id)`: buyer confirms receipt; escrow is paid to the seller and the sale is counted.
- `refund_order(order_id)`: buyer cancels an order that is still in escrow; money and stock are returned.

2. Security
- Every function checks the caller's identity with auth.uid() and only touches the caller's own wallet or orders.
- Wallet rows are locked while they change so two actions cannot spend the same money.
- Amounts are validated on the server, never trusted from the browser.
- EXECUTE is revoked from anonymous visitors and public, then granted to signed-in users only.

3. Notes
- Deposits are simulated demo credits; no real payment provider is connected.
*/

CREATE OR REPLACE FUNCTION public.deposit_funds(p_amount_cents bigint)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_balance bigint;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Please sign in first';
  END IF;
  IF p_amount_cents IS NULL OR p_amount_cents <= 0 OR p_amount_cents > 100000000 THEN
    RAISE EXCEPTION 'Enter an amount between $0.01 and $1,000,000';
  END IF;

  UPDATE wallets
  SET balance_cents = balance_cents + p_amount_cents, updated_at = now()
  WHERE user_id = v_uid
  RETURNING balance_cents INTO v_balance;

  INSERT INTO transactions (user_id, kind, amount_cents, description)
  VALUES (v_uid, 'deposit', p_amount_cents, 'Deposit');

  RETURN v_balance;
END;
$$;

CREATE OR REPLACE FUNCTION public.withdraw_funds(p_amount_cents bigint)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_balance bigint;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Please sign in first';
  END IF;
  IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'Enter an amount greater than $0.00';
  END IF;

  SELECT balance_cents INTO v_balance FROM wallets WHERE user_id = v_uid FOR UPDATE;
  IF v_balance < p_amount_cents THEN
    RAISE EXCEPTION 'Not enough balance for this withdrawal';
  END IF;

  UPDATE wallets
  SET balance_cents = balance_cents - p_amount_cents, updated_at = now()
  WHERE user_id = v_uid
  RETURNING balance_cents INTO v_balance;

  INSERT INTO transactions (user_id, kind, amount_cents, description)
  VALUES (v_uid, 'withdrawal', -p_amount_cents, 'Withdrawal');

  RETURN v_balance;
END;
$$;

CREATE OR REPLACE FUNCTION public.transfer_funds(p_recipient_handle text, p_amount_cents bigint)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_recipient uuid;
  v_recipient_name text;
  v_sender_name text;
  v_balance bigint;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Please sign in first';
  END IF;
  IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'Enter an amount greater than $0.00';
  END IF;

  SELECT id, display_name INTO v_recipient, v_recipient_name
  FROM profiles WHERE handle = lower(trim(p_recipient_handle));
  IF v_recipient IS NULL THEN
    RAISE EXCEPTION 'No user found with that handle';
  END IF;
  IF v_recipient = v_uid THEN
    RAISE EXCEPTION 'You cannot transfer funds to yourself';
  END IF;

  PERFORM 1 FROM wallets WHERE user_id IN (v_uid, v_recipient) ORDER BY user_id FOR UPDATE;

  SELECT balance_cents INTO v_balance FROM wallets WHERE user_id = v_uid;
  IF v_balance < p_amount_cents THEN
    RAISE EXCEPTION 'Not enough balance for this transfer';
  END IF;

  SELECT display_name INTO v_sender_name FROM profiles WHERE id = v_uid;

  UPDATE wallets SET balance_cents = balance_cents - p_amount_cents, updated_at = now()
  WHERE user_id = v_uid
  RETURNING balance_cents INTO v_balance;

  UPDATE wallets SET balance_cents = balance_cents + p_amount_cents, updated_at = now()
  WHERE user_id = v_recipient;

  INSERT INTO transactions (user_id, kind, amount_cents, description) VALUES
    (v_uid, 'transfer_out', -p_amount_cents, 'Transfer to ' || v_recipient_name),
    (v_recipient, 'transfer_in', p_amount_cents, 'Transfer from ' || v_sender_name);

  RETURN v_balance;
END;
$$;

CREATE OR REPLACE FUNCTION public.purchase_listing(p_listing_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_listing listings%ROWTYPE;
  v_price bigint;
  v_balance bigint;
  v_order_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Please sign in first';
  END IF;

  SELECT * INTO v_listing FROM listings WHERE id = p_listing_id FOR UPDATE;
  IF NOT FOUND OR NOT v_listing.is_active THEN
    RAISE EXCEPTION 'This listing is no longer available';
  END IF;
  IF v_listing.stock < 1 THEN
    RAISE EXCEPTION 'This listing is sold out';
  END IF;
  IF v_listing.seller_id = v_uid THEN
    RAISE EXCEPTION 'You cannot buy your own listing';
  END IF;

  v_price := CASE
    WHEN v_listing.flash_price_cents IS NOT NULL AND v_listing.flash_ends_at > now()
      THEN v_listing.flash_price_cents
    ELSE v_listing.price_cents
  END;

  SELECT balance_cents INTO v_balance FROM wallets WHERE user_id = v_uid FOR UPDATE;
  IF v_balance < v_price THEN
    RAISE EXCEPTION 'Not enough balance. Add funds on the Deposit page first.';
  END IF;

  UPDATE wallets SET balance_cents = balance_cents - v_price, updated_at = now()
  WHERE user_id = v_uid;

  UPDATE listings SET stock = stock - 1 WHERE id = v_listing.id;

  INSERT INTO orders (buyer_id, seller_id, listing_id, listing_title, amount_cents, status, delivery_note, delivered_at)
  VALUES (
    v_uid,
    v_listing.seller_id,
    v_listing.id,
    v_listing.title,
    v_price,
    CASE WHEN v_listing.seller_id IS NULL THEN 'delivered' ELSE 'escrow' END,
    CASE WHEN v_listing.seller_id IS NULL THEN 'Delivered instantly by elonstore' ELSE NULL END,
    CASE WHEN v_listing.seller_id IS NULL THEN now() ELSE NULL END
  )
  RETURNING id INTO v_order_id;

  INSERT INTO transactions (user_id, kind, amount_cents, description)
  VALUES (v_uid, 'purchase', -v_price, 'Purchase: ' || v_listing.title);

  RETURN v_order_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_order_delivered(p_order_id uuid, p_note text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_order orders%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Please sign in first';
  END IF;

  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR v_order.seller_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
  IF v_order.status <> 'escrow' THEN
    RAISE EXCEPTION 'This order is not waiting for delivery';
  END IF;
  IF char_length(trim(coalesce(p_note, ''))) < 1 THEN
    RAISE EXCEPTION 'Add delivery details for the buyer';
  END IF;

  UPDATE orders
  SET status = 'delivered', delivery_note = trim(p_note), delivered_at = now()
  WHERE id = p_order_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_order(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_order orders%ROWTYPE;
  v_seller_name text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Please sign in first';
  END IF;

  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR v_order.buyer_id <> v_uid THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
  IF v_order.status <> 'delivered' THEN
    RAISE EXCEPTION 'You can confirm an order once it has been delivered';
  END IF;

  UPDATE orders SET status = 'completed', completed_at = now() WHERE id = p_order_id;

  IF v_order.seller_id IS NOT NULL THEN
    PERFORM 1 FROM wallets WHERE user_id = v_order.seller_id FOR UPDATE;
    UPDATE wallets SET balance_cents = balance_cents + v_order.amount_cents, updated_at = now()
    WHERE user_id = v_order.seller_id;

    UPDATE profiles SET sales_count = sales_count + 1 WHERE id = v_order.seller_id;

    SELECT display_name INTO v_seller_name FROM profiles WHERE id = v_order.seller_id;
    INSERT INTO transactions (user_id, kind, amount_cents, description)
    VALUES (v_order.seller_id, 'sale', v_order.amount_cents, 'Sale: ' || v_order.listing_title);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.refund_order(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_order orders%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Please sign in first';
  END IF;

  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR v_order.buyer_id <> v_uid THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
  IF v_order.status <> 'escrow' THEN
    RAISE EXCEPTION 'Only orders that have not been delivered can be refunded';
  END IF;

  UPDATE orders SET status = 'refunded', completed_at = now() WHERE id = p_order_id;

  PERFORM 1 FROM wallets WHERE user_id = v_uid FOR UPDATE;
  UPDATE wallets SET balance_cents = balance_cents + v_order.amount_cents, updated_at = now()
  WHERE user_id = v_uid;

  IF v_order.listing_id IS NOT NULL THEN
    UPDATE listings SET stock = stock + 1 WHERE id = v_order.listing_id;
  END IF;

  INSERT INTO transactions (user_id, kind, amount_cents, description)
  VALUES (v_uid, 'refund', v_order.amount_cents, 'Refund: ' || v_order.listing_title);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.deposit_funds(bigint) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.withdraw_funds(bigint) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.transfer_funds(text, bigint) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.purchase_listing(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mark_order_delivered(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.release_order(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.refund_order(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.deposit_funds(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.withdraw_funds(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_funds(text, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_listing(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_order_delivered(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refund_order(uuid) TO authenticated;
