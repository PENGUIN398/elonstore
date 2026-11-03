/*
# Add escrow balance and escrow funding functions

1. Schema changes
- `wallets.escrow_balance_cents` (bigint, NOT NULL, default 0, check >= 0): money the user has manually parked in escrow, separate from the spendable `balance_cents`. This lets a user pre-load escrow protection funds independent of any specific order.

2. New transaction kinds
- 'escrow_fund': money moved into escrow (positive amount on the escrow ledger entry).
- 'escrow_from_binance': money moved into escrow from an external Binance deposit (positive amount, simulated).

3. New Functions (callable by signed-in users only)
- `fund_escrow_from_wallet(p_amount_cents)`: moves money from the caller's spendable `balance_cents` into `escrow_balance_cents`. Locks the wallet row, checks the spendable balance covers the amount, and records an 'escrow_fund' transaction (negative, since spendable cash decreased). Returns the new escrow balance.
- `fund_escrow_from_binance(p_amount_cents, p_reference)`: simulates an external deposit from Binance directly into escrow. Adds the amount to `escrow_balance_cents` (no wallet balance change), stores an 'escrow_from_binance' transaction with the caller-provided reference, and returns the new escrow balance. This is a demo/simulated flow; no real Binance API is called.

4. Security
- Both functions check auth.uid() and only touch the caller's own wallet.
- Wallet rows are locked (FOR UPDATE) while they change so two actions cannot spend the same money.
- Amounts are validated on the server (between $0.01 and $1,000,000), never trusted from the browser.
- EXECUTE is revoked from anonymous visitors and public, then granted to signed-in users only.

5. Notes
- The escrow balance is read-only from the client (RLS SELECT only); it only changes through these functions.
- The existing orders-based escrow (purchase_listing / release_order) is unchanged. This new balance is a separate, user-managed escrow pool.
- Binance funding is simulated demo credit; no real payment provider is connected.
*/

ALTER TABLE wallets
  ADD COLUMN IF NOT EXISTS escrow_balance_cents bigint NOT NULL DEFAULT 0 CHECK (escrow_balance_cents >= 0);

-- Add the new transaction kinds to the existing check constraint.
-- The original constraint is: kind IN ('deposit','withdrawal','transfer_in','transfer_out','purchase','refund','sale')
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_kind_check;
ALTER TABLE transactions
  ADD CONSTRAINT transactions_kind_check CHECK (kind IN (
    'deposit', 'withdrawal', 'transfer_in', 'transfer_out',
    'purchase', 'refund', 'sale',
    'escrow_fund', 'escrow_from_binance'
  ));

CREATE OR REPLACE FUNCTION public.fund_escrow_from_wallet(p_amount_cents bigint)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_balance bigint;
  v_escrow bigint;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Please sign in first';
  END IF;
  IF p_amount_cents IS NULL OR p_amount_cents <= 0 OR p_amount_cents > 100000000 THEN
    RAISE EXCEPTION 'Enter an amount between $0.01 and $1,000,000';
  END IF;

  SELECT balance_cents INTO v_balance FROM wallets WHERE user_id = v_uid FOR UPDATE;
  IF v_balance IS NULL THEN
    RAISE EXCEPTION 'Wallet not found';
  END IF;
  IF v_balance < p_amount_cents THEN
    RAISE EXCEPTION 'Not enough balance to fund escrow';
  END IF;

  UPDATE wallets
  SET balance_cents = balance_cents - p_amount_cents,
      escrow_balance_cents = escrow_balance_cents + p_amount_cents,
      updated_at = now()
  WHERE user_id = v_uid
  RETURNING escrow_balance_cents INTO v_escrow;

  INSERT INTO transactions (user_id, kind, amount_cents, description)
  VALUES (v_uid, 'escrow_fund', -p_amount_cents, 'Moved to escrow');

  RETURN v_escrow;
END;
$$;

CREATE OR REPLACE FUNCTION public.fund_escrow_from_binance(p_amount_cents bigint, p_reference text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_escrow bigint;
  v_ref text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Please sign in first';
  END IF;
  IF p_amount_cents IS NULL OR p_amount_cents <= 0 OR p_amount_cents > 100000000 THEN
    RAISE EXCEPTION 'Enter an amount between $0.01 and $1,000,000';
  END IF;

  v_ref := trim(coalesce(p_reference, ''));
  IF char_length(v_ref) > 120 THEN
    RAISE EXCEPTION 'Reference is too long (max 120 characters)';
  END IF;

  PERFORM 1 FROM wallets WHERE user_id = v_uid FOR UPDATE;

  UPDATE wallets
  SET escrow_balance_cents = escrow_balance_cents + p_amount_cents,
      updated_at = now()
  WHERE user_id = v_uid
  RETURNING escrow_balance_cents INTO v_escrow;

  INSERT INTO transactions (user_id, kind, amount_cents, description)
  VALUES (
    v_uid,
    'escrow_from_binance',
    p_amount_cents,
    CASE WHEN v_ref = '' THEN 'Binance deposit to escrow' ELSE 'Binance deposit to escrow: ' || v_ref END
  );

  RETURN v_escrow;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fund_escrow_from_wallet(bigint) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fund_escrow_from_binance(bigint, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.fund_escrow_from_wallet(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fund_escrow_from_binance(bigint, text) TO authenticated;
