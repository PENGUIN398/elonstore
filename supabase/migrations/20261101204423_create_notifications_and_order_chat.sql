/*
# Create notifications and private buyer-seller order chat

1. New Tables
- `notifications`: private alerts for order activity and new chat messages, with read state.
- `order_conversations`: one private conversation per order between its buyer and seller.
- `order_messages`: chat messages tied to an order, including the sender email shown in the conversation.

2. New Functions and Triggers
- `send_order_message(order_id, body)` validates that the caller is the buyer or seller, creates the order conversation if needed, and records the signed-in email.
- Order creation, delivery, and chat-message triggers create notifications for the appropriate other account.

3. Security
- Row level security is enabled on all new tables.
- Notifications are readable and markable as read only by their recipient.
- Conversations and messages are visible only to the buyer and seller for that order.
- Clients cannot directly insert notifications or impersonate another chat participant.

4. Important Notes
- Notifications are durable and remain available after refresh.
- Message sender emails are captured at send time so both participants can see who sent each message.
*/

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('order', 'message')),
  title text NOT NULL,
  body text NOT NULL,
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.order_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.order_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.order_conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  sender_email text NOT NULL CHECK (char_length(trim(sender_email)) BETWEEN 3 AND 320),
  body text NOT NULL CHECK (char_length(trim(body)) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_user_created_idx
  ON public.notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS order_messages_conversation_created_idx
  ON public.order_messages (conversation_id, created_at ASC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_messages ENABLE ROW LEVEL SECURITY;

GRANT SELECT, UPDATE (read_at) ON public.notifications TO authenticated;
GRANT SELECT ON public.order_conversations TO authenticated;
GRANT SELECT ON public.order_messages TO authenticated;

DROP POLICY IF EXISTS "select_own_notifications" ON public.notifications;
CREATE POLICY "select_own_notifications" ON public.notifications FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "mark_own_notifications_read" ON public.notifications;
CREATE POLICY "mark_own_notifications_read" ON public.notifications FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "select_order_conversations_participants" ON public.order_conversations;
CREATE POLICY "select_order_conversations_participants" ON public.order_conversations FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id = order_conversations.order_id
      AND (orders.buyer_id = auth.uid() OR orders.seller_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "select_order_messages_participants" ON public.order_messages;
CREATE POLICY "select_order_messages_participants" ON public.order_messages FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1
      FROM public.order_conversations
      JOIN public.orders ON orders.id = order_conversations.order_id
      WHERE order_conversations.id = order_messages.conversation_id
      AND (orders.buyer_id = auth.uid() OR orders.seller_id = auth.uid())
    )
  );

CREATE OR REPLACE FUNCTION public.send_order_message(p_order_id uuid, p_body text)
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
  IF char_length(v_body) < 1 OR char_length(v_body) > 4000 THEN
    RAISE EXCEPTION 'Enter a message between 1 and 4000 characters';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.orders
    WHERE id = p_order_id AND (buyer_id = v_uid OR seller_id = v_uid)
  ) THEN
    RAISE EXCEPTION 'You cannot message participants in this order';
  END IF;

  INSERT INTO public.order_conversations (order_id)
  VALUES (p_order_id)
  ON CONFLICT (order_id) DO UPDATE SET updated_at = now()
  RETURNING id INTO v_conversation_id;

  INSERT INTO public.order_messages (conversation_id, sender_id, sender_email, body)
  VALUES (v_conversation_id, v_uid, v_email, v_body)
  RETURNING id INTO v_message_id;

  UPDATE public.order_conversations SET updated_at = now() WHERE id = v_conversation_id;
  RETURN v_message_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.send_order_message(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_order_message(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.notify_order_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.buyer_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, kind, title, body, order_id)
      VALUES (NEW.buyer_id, 'order', 'Order placed', 'Your order for ' || NEW.listing_title || ' is now protected in escrow.', NEW.id);
    END IF;
    IF NEW.seller_id IS NOT NULL AND NEW.seller_id <> NEW.buyer_id THEN
      INSERT INTO public.notifications (user_id, kind, title, body, order_id)
      VALUES (NEW.seller_id, 'order', 'New order received', 'A customer placed an order for ' || NEW.listing_title || '.', NEW.id);
    END IF;
  ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'delivered' THEN
    INSERT INTO public.notifications (user_id, kind, title, body, order_id)
    VALUES (NEW.buyer_id, 'order', 'Your order has arrived', NEW.listing_title || ' has been marked delivered. Review the delivery details.', NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_notification_trigger ON public.orders;
CREATE TRIGGER orders_notification_trigger
AFTER INSERT OR UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.notify_order_event();

CREATE OR REPLACE FUNCTION public.notify_order_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_recipient uuid;
BEGIN
  SELECT orders.* INTO v_order
  FROM public.order_conversations
  JOIN public.orders ON orders.id = order_conversations.order_id
  WHERE order_conversations.id = NEW.conversation_id;

  IF v_order.buyer_id = NEW.sender_id THEN
    v_recipient := v_order.seller_id;
  ELSE
    v_recipient := v_order.buyer_id;
  END IF;

  IF v_recipient IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, kind, title, body, order_id)
    VALUES (v_recipient, 'message', 'New order message', NEW.sender_email || ' sent you a message about ' || v_order.listing_title || '.', v_order.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS order_message_notification_trigger ON public.order_messages;
CREATE TRIGGER order_message_notification_trigger
AFTER INSERT ON public.order_messages
FOR EACH ROW EXECUTE FUNCTION public.notify_order_message();
