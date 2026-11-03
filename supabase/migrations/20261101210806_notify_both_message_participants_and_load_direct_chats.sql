/*
# Notify both sides of every message and support direct chat replies

1. Modified Behavior
- Every order or direct seller message creates a notification for both the sender and the recipient.
- Existing order-message notifications keep their order reference.
- Direct seller-message notifications remain private and use the direct conversation participants.

2. New Function
- `send_seller_message(conversation_id, body)` lets either participant reply in a direct seller conversation after validating membership.

3. Security
- The new function is SECURITY DEFINER with a fixed search path.
- Execute access is limited to signed-in users.
- The function only permits participants of the selected direct conversation to send messages.

4. Important Notes
- Existing messages and conversations are preserved.
- The frontend can now load both order conversations and direct seller conversations from one Messages page.
*/

CREATE OR REPLACE FUNCTION public.send_seller_message(p_conversation_id uuid, p_body text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text := auth.email();
  v_body text := trim(coalesce(p_body, ''));
  v_message_id uuid;
BEGIN
  IF v_uid IS NULL OR v_email IS NULL THEN RAISE EXCEPTION 'Please sign in first'; END IF;
  IF char_length(v_body) < 1 OR char_length(v_body) > 4000 THEN
    RAISE EXCEPTION 'Enter a message between 1 and 4000 characters';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.order_conversations
    WHERE id = p_conversation_id
      AND order_id IS NULL
      AND (buyer_id = v_uid OR seller_id = v_uid)
  ) THEN
    RAISE EXCEPTION 'Conversation not found';
  END IF;

  INSERT INTO public.order_messages (conversation_id, sender_id, sender_email, body)
  VALUES (p_conversation_id, v_uid, v_email, v_body)
  RETURNING id INTO v_message_id;

  UPDATE public.order_conversations SET updated_at = now() WHERE id = p_conversation_id;
  RETURN v_message_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.send_seller_message(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_seller_message(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.notify_order_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conversation public.order_conversations%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_title text;
  v_body text;
BEGIN
  SELECT * INTO v_conversation FROM public.order_conversations WHERE id = NEW.conversation_id;
  IF v_conversation.order_id IS NOT NULL THEN
    SELECT * INTO v_order FROM public.orders WHERE id = v_conversation.order_id;
    v_title := 'New order message';
    v_body := NEW.sender_email || ' sent a message about ' || v_order.listing_title || '.';
    INSERT INTO public.notifications (user_id, kind, title, body, order_id)
    VALUES
      (v_order.buyer_id, 'message', v_title, v_body, v_order.id),
      (v_order.seller_id, 'message', v_title, v_body, v_order.id);
  ELSE
    v_title := 'New seller message';
    v_body := NEW.sender_email || ' sent a message in your seller conversation.';
    INSERT INTO public.notifications (user_id, kind, title, body, order_id)
    VALUES
      (v_conversation.buyer_id, 'message', v_title, v_body, NULL),
      (v_conversation.seller_id, 'message', v_title, v_body, NULL);
  END IF;
  RETURN NEW;
END;
$$;
