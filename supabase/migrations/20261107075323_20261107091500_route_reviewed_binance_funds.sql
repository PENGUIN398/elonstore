/*
# Route reviewed Binance funds to the requested destination

1. Purpose
- Correct the payment review function so confirmed submissions credit the destination selected when the user submitted the TXID.

2. Modified Function
- `review_binance_payment`
- `wallet` submissions increase `wallets.balance_cents` and create a `deposit` transaction.
- `escrow` submissions increase `wallets.escrow_balance_cents` and create an `escrow_from_binance` transaction.
- The credited account still comes only from the stored submission row.

3. Security
- Keep support-agent authorization, row locking, pending-status checks, and single-review behavior.
- No browser-supplied user ID or destination can redirect funds during review.

4. Important Notes
- A confirmed wallet deposit appears in the submitter's spendable balance.
- A confirmed escrow submission appears in the submitter's escrow balance.
- Rejected submissions do not change either balance.
*/

CREATE OR REPLACE FUNCTION public.review_binance_payment(
  p_submission_id uuid,
  p_decision text
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_submission public.binance_payment_submissions%ROWTYPE;
  v_balance bigint;
BEGIN
  IF v_uid IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_uid AND is_support_agent = true
  ) THEN
    RAISE EXCEPTION 'Support agent access required';
  END IF;

  IF p_decision NOT IN ('confirm', 'reject') THEN
    RAISE EXCEPTION 'Invalid payment decision';
  END IF;

  SELECT * INTO v_submission
  FROM public.binance_payment_submissions
  WHERE id = p_submission_id
  FOR UPDATE;

  IF NOT FOUND OR v_submission.status <> 'pending' THEN
    RAISE EXCEPTION 'Payment submission is not pending';
  END IF;

  IF p_decision = 'reject' THEN
    UPDATE public.binance_payment_submissions
    SET status = 'rejected', reviewed_at = now()
    WHERE id = p_submission_id;
    RETURN 0;
  END IF;

  SELECT CASE
    WHEN v_submission.destination = 'wallet' THEN balance_cents
    ELSE escrow_balance_cents
  END INTO v_balance
  FROM public.wallets
  WHERE user_id = v_submission.user_id
  FOR UPDATE;

  IF v_balance IS NULL THEN
    RAISE EXCEPTION 'Wallet not found';
  END IF;

  IF v_submission.destination = 'wallet' THEN
    UPDATE public.wallets
    SET balance_cents = balance_cents + v_submission.amount_cents,
        updated_at = now()
    WHERE user_id = v_submission.user_id
    RETURNING balance_cents INTO v_balance;

    INSERT INTO public.transactions (user_id, kind, amount_cents, description)
    VALUES (
      v_submission.user_id,
      'deposit',
      v_submission.amount_cents,
      'Verified Binance deposit'
    );
  ELSE
    UPDATE public.wallets
    SET escrow_balance_cents = escrow_balance_cents + v_submission.amount_cents,
        updated_at = now()
    WHERE user_id = v_submission.user_id
    RETURNING escrow_balance_cents INTO v_balance;

    INSERT INTO public.transactions (user_id, kind, amount_cents, description)
    VALUES (
      v_submission.user_id,
      'escrow_from_binance',
      v_submission.amount_cents,
      'Verified Binance deposit to escrow'
    );
  END IF;

  UPDATE public.binance_payment_submissions
  SET status = 'confirmed', reviewed_at = now()
  WHERE id = p_submission_id;

  RETURN v_balance;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.review_binance_payment(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_binance_payment(uuid, text) TO authenticated;