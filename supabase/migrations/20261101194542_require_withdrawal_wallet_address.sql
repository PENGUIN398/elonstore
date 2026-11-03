/*
# Require a destination wallet for withdrawals

1. Modified Functions
- `withdraw_funds(amount, wallet_address)`: now requires a TRON/TRC20-style destination wallet, validates it server-side, deducts only the signed-in user's balance, and records the destination in the withdrawal transaction.
- `withdraw_funds(amount)`: the previous amount-only entry point is disabled so it cannot be used to withdraw without a destination.

2. Security
- The caller is still derived from `auth.uid()` and the wallet row is locked before the balance check and deduction.
- The destination is validated in the database rather than trusting browser validation.
- Anonymous callers cannot execute either withdrawal function.

3. Important Notes
- Withdrawals require a TRON/TRC20 address beginning with `T` and containing 34 valid Base58 characters.
- Users should confirm the address and network before submitting because blockchain transfers cannot be reversed by the app.
*/

CREATE OR REPLACE FUNCTION public.withdraw_funds(
  p_amount_cents bigint,
  p_wallet_address text
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_balance bigint;
  v_wallet_address text := trim(coalesce(p_wallet_address, ''));
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Please sign in first';
  END IF;
  IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'Enter an amount greater than $0.00';
  END IF;
  IF v_wallet_address !~ '^T[1-9A-HJ-NP-Za-km-z]{33}$' THEN
    RAISE EXCEPTION 'Enter a valid TRON TRC20 wallet address';
  END IF;

  SELECT balance_cents INTO v_balance FROM public.wallets WHERE user_id = v_uid FOR UPDATE;
  IF v_balance IS NULL THEN
    RAISE EXCEPTION 'Wallet not found';
  END IF;
  IF v_balance < p_amount_cents THEN
    RAISE EXCEPTION 'Not enough balance for this withdrawal';
  END IF;

  UPDATE public.wallets
  SET balance_cents = balance_cents - p_amount_cents, updated_at = now()
  WHERE user_id = v_uid
  RETURNING balance_cents INTO v_balance;

  INSERT INTO public.transactions (user_id, kind, amount_cents, description)
  VALUES (v_uid, 'withdrawal', -p_amount_cents, 'Withdrawal to ' || v_wallet_address);

  RETURN v_balance;
END;
$$;

CREATE OR REPLACE FUNCTION public.withdraw_funds(p_amount_cents bigint)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'A destination TRON wallet address is required';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.withdraw_funds(bigint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.withdraw_funds(bigint, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.withdraw_funds(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.withdraw_funds(bigint) TO authenticated;
