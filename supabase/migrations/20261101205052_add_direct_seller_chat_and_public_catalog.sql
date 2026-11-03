/*
# Add direct seller conversations

1. Modified Table
- `order_conversations.order_id` is now optional so a buyer can contact a seller before placing an order.
- `order_conversations.buyer_id` and `seller_id` identify direct seller conversations.

2. New Function
- `start_seller_conversation(seller_id, body)` validates the signed-in buyer and seller, creates or reuses one private conversation, and sends the first message.

3. Security
- Existing order-chat policies now also allow only the two participants in a direct seller conversation to read it.
- Direct messages use the same authenticated-only message function and notification path.

4. Important Notes
- Existing order conversations retain their order relationship and continue working unchanged.
- Direct conversations are unique per buyer and seller pair.
*/

ALTER TABLE public.order_conversations ALTER COLUMN order_id DROP NOT NULL;
ALTER TABLE public.order_conversations ADD COLUMN IF NOT EXISTS buyer_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.order_conversations ADD COLUMN IF NOT EXISTS seller_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS order_conversations_buyer_seller_key
  ON public.order_conversations (buyer_id, seller_id)
  WHERE order_id IS NULL;

DROP POLICY IF EXISTS "select_order_conversations_participants" ON public.order_conversations;
CREATE POLICY "select_order_conversations_participants" ON public.order_conversations FOR SELECT
  TO authenticated USING (
    (buyer_id = auth.uid() OR seller_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id = order_conversations.order_id
      AND (orders.buyer_id = auth.uid() OR orders.seller_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "select_order_messages_participants" ON public.order_messages;
CREATE POLICY "select_order_messages_participants" ON public.order_messages FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.order_conversations
      LEFT JOIN public.orders ON orders.id = order_conversations.order_id
      WHERE order_conversations.id = order_messages.conversation_id
      AND (
        order_conversations.buyer_id = auth.uid()
        OR order_conversations.seller_id = auth.uid()
        OR orders.buyer_id = auth.uid()
        OR orders.seller_id = auth.uid()
      )
    )
  );

CREATE OR REPLACE FUNCTION public.start_seller_conversation(p_seller_id uuid, p_body text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text := auth.email();
  v_body text := trim(coalesce(p_body, ''));
  v_conversation_id uuid;
  v_message_id uuid;
BEGIN
  IF v_uid IS NULL OR v_email IS NULL THEN RAISE EXCEPTION 'Please sign in first'; END IF;
  IF p_seller_id IS NULL OR p_seller_id = v_uid THEN RAISE EXCEPTION 'Choose another seller'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_seller_id AND is_seller = true) THEN
    RAISE EXCEPTION 'Seller profile not found';
  END IF;
  IF char_length(v_body) < 1 OR char_length(v_body) > 4000 THEN
    RAISE EXCEPTION 'Enter a message between 1 and 4000 characters';
  END IF;

  INSERT INTO public.order_conversations (buyer_id, seller_id)
  VALUES (v_uid, p_seller_id)
  ON CONFLICT (buyer_id, seller_id) WHERE order_id IS NULL
  DO UPDATE SET updated_at = now()
  RETURNING id INTO v_conversation_id;

  INSERT INTO public.order_messages (conversation_id, sender_id, sender_email, body)
  VALUES (v_conversation_id, v_uid, v_email, v_body)
  RETURNING id INTO v_message_id;

  RETURN v_message_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.start_seller_conversation(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_seller_conversation(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.notify_order_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conversation public.order_conversations%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_recipient uuid;
  v_title text;
  v_body text;
BEGIN
  SELECT * INTO v_conversation FROM public.order_conversations WHERE id = NEW.conversation_id;
  IF v_conversation.order_id IS NOT NULL THEN
    SELECT * INTO v_order FROM public.orders WHERE id = v_conversation.order_id;
    IF v_order.buyer_id = NEW.sender_id THEN v_recipient := v_order.seller_id; ELSE v_recipient := v_order.buyer_id; END IF;
    v_title := 'New order message';
    v_body := NEW.sender_email || ' sent you a message about ' || v_order.listing_title || '.';
  ELSE
    IF v_conversation.buyer_id = NEW.sender_id THEN v_recipient := v_conversation.seller_id; ELSE v_recipient := v_conversation.buyer_id; END IF;
    v_title := 'New message from buyer';
    v_body := NEW.sender_email || ' sent you a message from your seller profile.';
  END IF;

  IF v_recipient IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, kind, title, body, order_id)
    VALUES (v_recipient, 'message', v_title, v_body, v_conversation.order_id);
  END IF;
  RETURN NEW;
END;
$$;
