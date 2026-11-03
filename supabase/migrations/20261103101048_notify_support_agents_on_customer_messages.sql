/*
# Notify support agents on customer support messages

1. Modified Tables
- `notifications.kind`: add `support` to the allowed kinds so we can store support-message alerts for agents and customers.

2. Modified Functions
- `create_support_thread`: when a customer opens a ticket, insert a `support` notification for every account flagged as a support agent.
- `send_support_message`: when a customer replies, insert a `support` notification for every support agent.
- `send_agent_support_message`: when an agent replies, insert a `support` notification for the thread owner.

3. Security
- Notification inserts are performed inside SECURITY DEFINER functions only; customers still cannot write notifications directly.
- Support agents are notified via the same notifications table they already read; their RLS policy (`select_own_notifications`) already scopes rows to `auth.uid() = user_id`.

4. Important Notes
- Agent notifications are one row per agent per customer message, so each agent sees their own unread count.
- `order_id` is left null on support notifications (they are not tied to an order).
*/

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_kind_check,
  ADD CONSTRAINT notifications_kind_check CHECK (kind IN ('order', 'message', 'support'));

CREATE OR REPLACE FUNCTION public.create_support_thread(p_subject text, p_message text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_subject text := trim(coalesce(p_subject, ''));
  v_message text := trim(coalesce(p_message, ''));
  v_thread_id uuid;
  v_agent record;
  v_customer_handle text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Please sign in first'; END IF;
  IF char_length(v_subject) < 3 OR char_length(v_subject) > 120 THEN
    RAISE EXCEPTION 'Enter a subject between 3 and 120 characters';
  END IF;
  IF char_length(v_message) < 1 OR char_length(v_message) > 4000 THEN
    RAISE EXCEPTION 'Enter a message between 1 and 4000 characters';
  END IF;

  INSERT INTO public.support_threads (user_id, subject)
  VALUES (v_uid, v_subject)
  RETURNING id INTO v_thread_id;

  INSERT INTO public.support_messages (thread_id, sender_id, sender_type, body)
  VALUES (v_thread_id, v_uid, 'customer', v_message);

  SELECT handle INTO v_customer_handle FROM public.profiles WHERE id = v_uid;

  FOR v_agent IN SELECT id FROM public.profiles WHERE is_support_agent = true LOOP
    INSERT INTO public.notifications (user_id, kind, title, body, order_id)
    VALUES (v_agent.id, 'support', 'New support request', v_customer_handle || ' opened a support conversation', NULL);
  END LOOP;

  RETURN v_thread_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.send_support_message(p_thread_id uuid, p_message text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_message text := trim(coalesce(p_message, ''));
  v_message_id uuid;
  v_subject text;
  v_customer_handle text;
  v_agent record;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Please sign in first'; END IF;
  IF char_length(v_message) < 1 OR char_length(v_message) > 4000 THEN
    RAISE EXCEPTION 'Enter a message between 1 and 4000 characters';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.support_threads
    WHERE id = p_thread_id AND user_id = v_uid AND status = 'open'
  ) THEN
    RAISE EXCEPTION 'Support conversation not found or closed';
  END IF;

  INSERT INTO public.support_messages (thread_id, sender_id, sender_type, body)
  VALUES (p_thread_id, v_uid, 'customer', v_message)
  RETURNING id INTO v_message_id;

  UPDATE public.support_threads SET updated_at = now() WHERE id = p_thread_id;

  SELECT subject INTO v_subject FROM public.support_threads WHERE id = p_thread_id;
  SELECT handle INTO v_customer_handle FROM public.profiles WHERE id = v_uid;

  FOR v_agent IN SELECT id FROM public.profiles WHERE is_support_agent = true LOOP
    INSERT INTO public.notifications (user_id, kind, title, body, order_id)
    VALUES (v_agent.id, 'support', 'New support reply', v_customer_handle || ' replied: ' || v_subject, NULL);
  END LOOP;

  RETURN v_message_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.send_agent_support_message(p_thread_id uuid, p_message text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_message text := trim(coalesce(p_message, ''));
  v_message_id uuid;
  v_thread_user_id uuid;
  v_subject text;
BEGIN
  IF v_uid IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_uid AND is_support_agent = true
  ) THEN
    RAISE EXCEPTION 'Support agent access required';
  END IF;
  IF char_length(v_message) < 1 OR char_length(v_message) > 4000 THEN
    RAISE EXCEPTION 'Invalid support message';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.support_threads WHERE id = p_thread_id AND status = 'open') THEN
    RAISE EXCEPTION 'Support conversation not found';
  END IF;

  INSERT INTO public.support_messages (thread_id, sender_id, sender_type, body)
  VALUES (p_thread_id, v_uid, 'agent', v_message)
  RETURNING id INTO v_message_id;

  UPDATE public.support_threads SET updated_at = now() WHERE id = p_thread_id;

  SELECT user_id, subject INTO v_thread_user_id, v_subject FROM public.support_threads WHERE id = p_thread_id;
  IF v_thread_user_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, kind, title, body, order_id)
    VALUES (v_thread_user_id, 'support', 'Support replied', 'Support replied to: ' || v_subject, NULL);
  END IF;

  RETURN v_message_id;
END;
$$;
