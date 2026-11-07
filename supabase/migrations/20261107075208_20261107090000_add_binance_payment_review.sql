/*
# Add secure Binance payment review and wallet crediting

1. Purpose
- Add a support-agent-only review action for submitted Binance payments.
- Credit the wallet belonging to the account that submitted the payment, never an account chosen by the reviewer or browser.

2. Modified Tables
- `binance_payment_submissions`
- Existing pending submissions can be changed only by the review function.
- Existing status, amount, destination, and submitter fields remain unchanged.
- `wallets`
- Confirmed wallet deposits increase the submitting user's `balance_cents`.
- `transactions`
- Confirmed payments create a positive `deposit` ledger entry for the submitting user.

3. Security
- Remove direct INSERT, UPDATE, and DELETE access to payment submissions from `anon` and `authenticated`.
- Keep authenticated users limited to reading their own submissions.
- Add `review_binance_payment`, callable only by authenticated support agents.
- The function locks the submission and wallet, rejects repeat reviews, validates the decision, and derives the credited user from the stored submission row.
- Anonymous callers and non-agent accounts cannot call the review function.

4. Important Notes
- Entering an amount and TXID creates a pending submission only.
- A support agent must confirm the payment before the amount reaches the submitter's wallet.
- Rejecting a submission does not change any wallet balance.
*/

REVOKE INSERT, UPDATE, DELETE ON public.binance_payment_submissions FROM anon, authenticated;
GRANT SELECT ON public.binance_payment_submissions TO authenticated;

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

  SELECT balance_cents INTO v_balance
  FROM public.wallets
  WHERE user_id = v_submission.user_id
  FOR UPDATE;

  IF v_balance IS NULL THEN
    RAISE EXCEPTION 'Wallet not found';
  END IF;

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

  UPDATE public.binance_payment_submissions
  SET status = 'confirmed', reviewed_at = now()
  WHERE id = p_submission_id;

  RETURN v_balance;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.review_binance_payment(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_binance_payment(uuid, text) TO authenticated;