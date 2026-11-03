/*
# Require Binance transaction verification before crediting funds

1. New Tables
- `binance_payment_submissions`: records a signed-in user's requested USDT payment, destination balance, transaction ID, and review status.
- `id`: unique submission identifier.
- `user_id`: the account that submitted the payment.
- `amount_cents`: amount requested in USD cents.
- `txid`: the submitted TRON transaction ID, unique to prevent duplicate submissions.
- `destination`: `wallet` or `escrow`, identifying where verified funds should be credited.
- `status`: `pending`, `confirmed`, or `rejected`.
- `created_at`, `reviewed_at`: submission and review timestamps.

2. Modified Functions
- Added `submit_binance_payment(amount, txid, destination)`, which validates the signed-in caller, amount, transaction ID, and destination, then creates a pending submission without changing any balance.
- Replaced the old demo `deposit_funds` credit path with a rejection so a client cannot create balance by submitting only an amount.
- Replaced the old demo `fund_escrow_from_binance` credit path with a rejection so a client cannot create escrow balance without verification.

3. Security
- Row level security is enabled on the new table.
- Authenticated users can read only their own submissions.
- The browser has no direct insert, update, or delete grant on payment submissions; inserts happen through the validated security-definer function.
- All submission functions require `auth.uid()` and are unavailable to anonymous callers.

4. Important Notes
- Submitting a transaction ID creates a pending review record only. It does not add wallet or escrow funds.
- A trusted verification process must confirm the transaction on the TRON network and credit the matching destination before the balance changes.
*/

CREATE TABLE IF NOT EXISTS public.binance_payment_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0 AND amount_cents <= 100000000),
  txid text NOT NULL CHECK (char_length(txid) BETWEEN 10 AND 200),
  destination text NOT NULL CHECK (destination IN ('wallet', 'escrow')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS binance_payment_submissions_txid_key
  ON public.binance_payment_submissions (lower(txid));
CREATE INDEX IF NOT EXISTS binance_payment_submissions_user_created_idx
  ON public.binance_payment_submissions (user_id, created_at DESC);

ALTER TABLE public.binance_payment_submissions ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.binance_payment_submissions TO authenticated;

DROP POLICY IF EXISTS "select_own_binance_payment_submissions" ON public.binance_payment_submissions;
CREATE POLICY "select_own_binance_payment_submissions"
  ON public.binance_payment_submissions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

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

  INSERT INTO public.binance_payment_submissions (user_id, amount_cents, txid, destination)
  VALUES (v_uid, p_amount_cents, v_txid, p_destination)
  RETURNING id INTO v_submission_id;

  RETURN v_submission_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.deposit_funds(p_amount_cents bigint)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Submit a Binance transaction ID for verification before funds can be added';
END;
$$;

CREATE OR REPLACE FUNCTION public.fund_escrow_from_binance(p_amount_cents bigint, p_reference text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Submit a Binance transaction ID for verification before escrow can be funded';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_binance_payment(bigint, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_binance_payment(bigint, text, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.deposit_funds(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.deposit_funds(bigint) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fund_escrow_from_binance(bigint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fund_escrow_from_binance(bigint, text) TO authenticated;
