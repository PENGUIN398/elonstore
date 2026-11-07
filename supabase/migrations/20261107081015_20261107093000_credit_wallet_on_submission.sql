/*
# Credit wallet immediately on Binance payment submission

1. Purpose
- When a signed-in user submits a TXID and amount, the listed amount is added to their wallet right away.
- No manual confirmation step is required for the balance to update.

2. Modified Functions
- `submit_binance_payment`: after creating the submission row, immediately credit the submitting user's wallet (or escrow balance when destination is escrow), record a ledger transaction, and mark the submission as confirmed.

3. Security
- The credited account is still derived from auth.uid() inside the SECURITY DEFINER function; the caller cannot target another user's wallet.
- Row locking on the wallet row is preserved.

4. Important Notes
- Submitting a TXID with an amount now instantly increases the submitter's balance.
- The TXID uniqueness check still prevents reusing the same transaction ID.
*/

CREATE OR REPLACE FUNCTION public.submit_binance_payment(
  p_amount_cents bigint,
  p_txid text,
  p_destination text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_txid text := trim(coalesce(p_txid, ''));
  v_submission_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Please sign in first';
  END IF;
  IF p_amount_cents IS NULL OR p_amount_cents <= 0 OR p_amount_cents > 100000000 THEN
    RAISE EXCEPTION 'Enter an amount between $0.01 and $1,000,000';
  END IF;
  IF char_length(v_txid) < 10 OR char_length(v_txid) > 200 THEN
    RAISE EXCEPTION 'Enter a valid transaction ID';
  END IF;
  IF p_destination NOT IN ('wallet', 'escrow') THEN
    RAISE EXCEPTION 'Invalid payment destination';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.binance_payment_submissions
    WHERE lower(txid) = lower(v_txid)
  ) THEN
    RAISE EXCEPTION 'That transaction ID has already been submitted';
  END IF;

  INSERT INTO public.binance_payment_submissions (user_id, amount_cents, txid, destination, status, reviewed_at)
  VALUES (v_uid, p_amount_cents, v_txid, p_destination, 'confirmed', now())
  RETURNING id INTO v_submission_id;

  IF p_destination = 'wallet' THEN
    UPDATE public.wallets
    SET balance_cents = balance_cents + p_amount_cents,
        updated_at = now()
    WHERE user_id = v_uid;

    INSERT INTO public.transactions (user_id, kind, amount_cents, description)
    VALUES (v_uid, 'deposit', p_amount_cents, 'Binance deposit (TXID ' || v_txid || ')');
  ELSE
    UPDATE public.wallets
    SET escrow_balance_cents = escrow_balance_cents + p_amount_cents,
        updated_at = now()
    WHERE user_id = v_uid;

    INSERT INTO public.transactions (user_id, kind, amount_cents, description)
    VALUES (v_uid, 'escrow_from_binance', p_amount_cents, 'Binance escrow deposit (TXID ' || v_txid || ')');
  END IF;

  RETURN v_submission_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_binance_payment(bigint, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_binance_payment(bigint, text, text) TO authenticated;