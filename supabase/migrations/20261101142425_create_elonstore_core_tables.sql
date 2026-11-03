/*
# Create elonstore core tables

1. New Tables
- `profiles`: one row per account with handle, display name, bio, seller flag and completed sales count.
- `wallets`: one balance per account in cents. Balances can only change through secure database functions.
- `listings`: products for sale. Listings with no seller are sold directly by elonstore. Optional flash sale price and end time.
- `orders`: purchases. Money sits in escrow until the seller delivers and the buyer releases it.
- `transactions`: ledger of every money movement, shown on the Activity page.
- `news`: store announcements.

2. Security
- Row level security is enabled on every table.
- Wallets, orders and transactions are read-only for users. Changes happen through secure functions in the next migration.
- Users can edit only their own profile fields (name, handle, bio, seller flag).
- Users can create, edit and delete only listings they own.
- Only signed-in users can access any data.

3. Automation
- A trigger creates a profile with a unique handle and a zero-balance wallet for every new sign-up.

4. Notes
- Money is stored as whole cents to avoid rounding errors.
- A non-negative balance is enforced by the database.
*/

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  handle text NOT NULL UNIQUE,
  display_name text NOT NULL DEFAULT '',
  bio text NOT NULL DEFAULT '',
  is_seller boolean NOT NULL DEFAULT false,
  sales_count integer NOT NULL DEFAULT 0 CHECK (sales_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profiles_handle_format CHECK (handle ~ '^[a-z0-9_]{3,24}$'),
  CONSTRAINT profiles_display_name_length CHECK (char_length(display_name) <= 60),
  CONSTRAINT profiles_bio_length CHECK (char_length(bio) <= 500)
);

CREATE TABLE IF NOT EXISTS wallets (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance_cents bigint NOT NULL DEFAULT 0 CHECK (balance_cents >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 2000),
  category text NOT NULL DEFAULT 'General',
  image_url text,
  price_cents bigint NOT NULL CHECK (price_cents > 0),
  flash_price_cents bigint CHECK (flash_price_cents > 0),
  flash_ends_at timestamptz,
  stock integer NOT NULL DEFAULT 1 CHECK (stock >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT listings_flash_pair CHECK ((flash_price_cents IS NULL) = (flash_ends_at IS NULL)),
  CONSTRAINT listings_flash_below_price CHECK (flash_price_cents IS NULL OR flash_price_cents < price_cents)
);

CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  seller_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  listing_id uuid REFERENCES listings(id) ON DELETE SET NULL,
  listing_title text NOT NULL,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  status text NOT NULL DEFAULT 'escrow' CHECK (status IN ('escrow', 'delivered', 'completed', 'refunded')),
  delivery_note text,
  delivered_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('deposit', 'withdrawal', 'transfer_in', 'transfer_out', 'purchase', 'refund', 'sale')),
  amount_cents bigint NOT NULL CHECK (amount_cents <> 0),
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS news (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  summary text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'Update',
  published_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS listings_seller_id_idx ON listings (seller_id);
CREATE INDEX IF NOT EXISTS listings_flash_ends_at_idx ON listings (flash_ends_at) WHERE flash_ends_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_buyer_id_idx ON orders (buyer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_seller_id_idx ON orders (seller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS transactions_user_id_idx ON transactions (user_id, created_at DESC);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE news ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON profiles TO authenticated;
GRANT UPDATE (handle, display_name, bio, is_seller) ON profiles TO authenticated;
GRANT SELECT ON wallets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON listings TO authenticated;
GRANT SELECT ON orders TO authenticated;
GRANT SELECT ON transactions TO authenticated;
GRANT SELECT ON news TO authenticated;

DROP POLICY IF EXISTS "select_profiles" ON profiles;
CREATE POLICY "select_profiles" ON profiles FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "update_own_profile" ON profiles;
CREATE POLICY "update_own_profile" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "select_own_wallet" ON wallets;
CREATE POLICY "select_own_wallet" ON wallets FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "select_active_or_own_listings" ON listings;
CREATE POLICY "select_active_or_own_listings" ON listings FOR SELECT
  TO authenticated USING (is_active OR auth.uid() = seller_id);

DROP POLICY IF EXISTS "insert_own_listings" ON listings;
CREATE POLICY "insert_own_listings" ON listings FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = seller_id);

DROP POLICY IF EXISTS "update_own_listings" ON listings;
CREATE POLICY "update_own_listings" ON listings FOR UPDATE
  TO authenticated USING (auth.uid() = seller_id) WITH CHECK (auth.uid() = seller_id);

DROP POLICY IF EXISTS "delete_own_listings" ON listings;
CREATE POLICY "delete_own_listings" ON listings FOR DELETE
  TO authenticated USING (auth.uid() = seller_id);

DROP POLICY IF EXISTS "select_own_orders" ON orders;
CREATE POLICY "select_own_orders" ON orders FOR SELECT
  TO authenticated USING (auth.uid() = buyer_id OR auth.uid() = seller_id);

DROP POLICY IF EXISTS "select_own_transactions" ON transactions;
CREATE POLICY "select_own_transactions" ON transactions FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "select_news" ON news;
CREATE POLICY "select_news" ON news FOR SELECT
  TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base text;
  v_handle text;
BEGIN
  v_base := lower(regexp_replace(split_part(NEW.email, '@', 1), '[^a-zA-Z0-9_]', '', 'g'));
  IF length(v_base) < 3 THEN
    v_base := 'user';
  END IF;
  v_base := left(v_base, 16);
  v_handle := v_base || '_' || substr(md5(NEW.id::text), 1, 6);

  INSERT INTO public.profiles (id, handle, display_name)
  VALUES (NEW.id, v_handle, split_part(NEW.email, '@', 1));

  INSERT INTO public.wallets (user_id) VALUES (NEW.id);

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
