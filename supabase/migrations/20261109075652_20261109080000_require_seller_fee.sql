/*
# Require one-time $100 payment to become a seller

1. Purpose
- Becoming a seller now costs a one-time $100 payment deducted from the user's wallet.
- The is_seller flag can no longer be toggled directly from the browser.

2. New Function
- `become_seller()`: deducts 10000 cents ($100) from the caller's wallet, sets is_seller = true, records a ledger transaction, and returns the new balance. Rejects users who are already sellers or who lack sufficient funds.

3. Modified Tables
- `transactions.kind`: add `seller_fee` to the allowed kinds so the one-time payment is recorded in the ledger.
- `profiles`: revoke client UPDATE on the is_seller column so it can only change through the function.

4. Security
- The caller is derived from auth.uid(); no parameter can target another account.
- The function locks the wallet row and rejects insufficient funds.
- Anonymous callers and non-authenticated users cannot call the function.
*/

ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_kind_check,
  ADD CONSTRAINT transactions_kind_check CHECK (kind IN ('deposit', 'withdrawal', 'transfer_in', 'transfer_out', 'purchase', 'refund', 'sale', 'escrow_fund', 'escrow_from_binance', 'seller_fee'));

REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (handle, display_name, bio, avatar_url) ON public.profiles TO authenticated;

CREATE OR REPLACE FUNCTION public.become_seller()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_balance bigint;
  v_is_seller boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Please sign in first';
  END IF;

  SELECT is_seller INTO v_is_seller FROM public.profiles WHERE id = v_uid;
  IF v_is_seller IS NULL THEN
    RAISE EXCEPTION 'Account not found';
  END IF;
  IF v_is_seller THEN
    RAISE EXCEPTION 'You are already a seller';
  END IF;

  SELECT balance_cents INTO v_balance
  FROM public.wallets
  WHERE user_id = v_uid
  FOR UPDATE;

  IF v_balance IS NULL THEN
    RAISE EXCEPTION 'Wallet not found';
  END IF;

  IF v_balance < 10000 THEN
    RAISE EXCEPTION 'You need at least $100.00 in your wallet to become a seller';
  END IF;

  UPDATE public.wallets
  SET balance_cents = balance_cents - 10000,
      updated_at = now()
  WHERE user_id = v_uid
  RETURNING balance_cents INTO v_balance;

  UPDATE public.profiles
  SET is_seller = true
  WHERE id = v_uid;

  INSERT INTO public.transactions (user_id, kind, amount_cents, description)
  VALUES (v_uid, 'seller_fee', -10000, 'One-time seller activation fee');

  RETURN v_balance;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.become_seller() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.become_seller() TO authenticated;