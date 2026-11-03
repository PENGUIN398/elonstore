/*
# Add seller services to the marketplace

1. Changes to `listings`
- `kind`: 'product' (default, existing rows) or 'service'.
- `pricing_model`: 'fixed' or 'hourly' (services only).
- `delivery_days`: how many days the seller needs to deliver (optional, services).

2. New table `listing_deliverables`
- Holds optional automatic delivery text or a URL for a listing.
- Kept separate from `listings` so buyers never see it before purchase.
- Only the listing's seller can read it.

3. New function `create_service`
- Lets a signed-in seller with seller mode on create a service in one step, including the optional automatic delivery text.
- Services are stored as listings, so they appear in the marketplace automatically.

4. Updated function `purchase_listing`
- If a service has automatic delivery text, the order is delivered immediately with that text.
- Otherwise behaviour is unchanged: the payment goes into escrow until the seller delivers.

5. Security
- Row level security is enabled on `listing_deliverables`.
- EXECUTE on `create_service` is granted to signed-in users only.
*/

ALTER TABLE listings ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'product' CHECK (kind IN ('product', 'service'));
ALTER TABLE listings ADD COLUMN IF NOT EXISTS pricing_model text CHECK (pricing_model IS NULL OR pricing_model IN ('fixed', 'hourly'));
ALTER TABLE listings ADD COLUMN IF NOT EXISTS delivery_days integer CHECK (delivery_days IS NULL OR delivery_days BETWEEN 0 AND 365);

CREATE TABLE IF NOT EXISTS listing_deliverables (
  listing_id uuid PRIMARY KEY REFERENCES listings(id) ON DELETE CASCADE,
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 5000),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE listing_deliverables ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON listing_deliverables TO authenticated;

DROP POLICY IF EXISTS "select_own_deliverables" ON listing_deliverables;
CREATE POLICY "select_own_deliverables" ON listing_deliverables FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM listings l
    WHERE l.id = listing_deliverables.listing_id AND l.seller_id = auth.uid()
  ));

CREATE OR REPLACE FUNCTION public.create_service(
  p_title text,
  p_description text,
  p_pricing_model text,
  p_price_cents bigint,
  p_delivery_days integer,
  p_auto_delivery text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_seller boolean;
  v_title text := trim(coalesce(p_title, ''));
  v_auto text := trim(coalesce(p_auto_delivery, ''));
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Please sign in first';
  END IF;

  SELECT is_seller INTO v_is_seller FROM profiles WHERE id = v_uid;
  IF NOT COALESCE(v_is_seller, false) THEN
    RAISE EXCEPTION 'Turn on seller mode before adding services';
  END IF;

  IF char_length(v_title) < 1 OR char_length(v_title) > 120 THEN
    RAISE EXCEPTION 'Enter a service title (up to 120 characters)';
  END IF;
  IF p_pricing_model IS NULL OR p_pricing_model NOT IN ('fixed', 'hourly') THEN
    RAISE EXCEPTION 'Choose fixed or hourly pricing';
  END IF;
  IF p_price_cents IS NULL OR p_price_cents <= 0 OR p_price_cents > 100000000 THEN
    RAISE EXCEPTION 'Enter a rate between $0.01 and $1,000,000';
  END IF;
  IF p_delivery_days IS NOT NULL AND (p_delivery_days < 0 OR p_delivery_days > 365) THEN
    RAISE EXCEPTION 'Delivery days must be between 0 and 365';
  END IF;
  IF char_length(v_auto) > 5000 THEN
    RAISE EXCEPTION 'Automatic delivery text can be up to 5000 characters';
  END IF;

  INSERT INTO listings (seller_id, title, description, category, price_cents, stock, kind, pricing_model, delivery_days)
  VALUES (v_uid, v_title, trim(coalesce(p_description, '')), 'Services', p_price_cents, 1000, 'service', p_pricing_model, p_delivery_days)
  RETURNING id INTO v_id;

  IF v_auto <> '' THEN
    INSERT INTO listing_deliverables (listing_id, content) VALUES (v_id, v_auto);
  END IF;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_service(text, text, text, bigint, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_service(text, text, text, bigint, integer, text) TO authenticated;

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
  v_auto text;
  v_instant boolean;
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

  SELECT content INTO v_auto FROM listing_deliverables WHERE listing_id = v_listing.id;
  v_instant := v_listing.seller_id IS NULL OR v_auto IS NOT NULL;

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
    CASE WHEN v_instant THEN 'delivered' ELSE 'escrow' END,
    CASE WHEN v_listing.seller_id IS NULL THEN 'Delivered instantly by elonstore' ELSE v_auto END,
    CASE WHEN v_instant THEN now() ELSE NULL END
  )
  RETURNING id INTO v_order_id;

  INSERT INTO transactions (user_id, kind, amount_cents, description)
  VALUES (v_uid, 'purchase', -v_price, 'Purchase: ' || v_listing.title);

  RETURN v_order_id;
END;
$$;
