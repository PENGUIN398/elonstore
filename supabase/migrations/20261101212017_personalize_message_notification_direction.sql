/*
# Personalize message notification direction

1. Modified Behavior
- Message senders receive a notification saying they sent a message to the other participant.
- Message recipients receive a notification saying they have a message from the sender.
- This applies to both order conversations and direct seller conversations.

2. Data Safety
- No tables, columns, messages, or existing notifications are removed or changed.
- Only the notification trigger wording and recipient-specific notification rows are updated.

3. Security
- Notifications continue to be created server-side by the existing SECURITY DEFINER trigger function.
- Notification visibility remains limited by the existing per-user policy.

4. Important Notes
- Existing notifications keep their current wording.
- New messages will use the clearer sent/received wording immediately.
*/

CREATE OR REPLACE FUNCTION public.notify_order_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conversation public.order_conversations%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_other_user uuid;
  v_other_email text;
  v_sender_title text;
  v_sender_body text;
  v_recipient_title text;
  v_recipient_body text;
BEGIN
  SELECT * INTO v_conversation FROM public.order_conversations WHERE id = NEW.conversation_id;

  IF v_conversation.order_id IS NOT NULL THEN
    SELECT * INTO v_order FROM public.orders WHERE id = v_conversation.order_id;
    IF NEW.sender_id = v_order.buyer_id THEN
      v_other_user := v_order.seller_id;
      SELECT coalesce(display_name, handle) INTO v_other_email FROM public.profiles WHERE id = v_order.seller_id;
    ELSE
      v_other_user := v_order.buyer_id;
      SELECT coalesce(display_name, handle) INTO v_other_email FROM public.profiles WHERE id = v_order.buyer_id;
    END IF;
    v_sender_title := 'Message sent';
    v_sender_body := 'You sent a message to ' || coalesce(v_other_email, 'the other participant') || ' about ' || v_order.listing_title || '.';
    v_recipient_title := 'New message';
    v_recipient_body := 'You have a message from ' || NEW.sender_email || ' about ' || v_order.listing_title || '.';
    INSERT INTO public.notifications (user_id, kind, title, body, order_id)
    VALUES
      (NEW.sender_id, 'message', v_sender_title, v_sender_body, v_order.id),
      (v_other_user, 'message', v_recipient_title, v_recipient_body, v_order.id);
  ELSE
    IF NEW.sender_id = v_conversation.buyer_id THEN
      v_other_user := v_conversation.seller_id;
      SELECT coalesce(display_name, handle) INTO v_other_email FROM public.profiles WHERE id = v_conversation.seller_id;
    ELSE
      v_other_user := v_conversation.buyer_id;
      SELECT coalesce(display_name, handle) INTO v_other_email FROM public.profiles WHERE id = v_conversation.buyer_id;
    END IF;
    v_sender_title := 'Message sent';
    v_sender_body := 'You sent a message to ' || coalesce(v_other_email, 'the other participant') || '.';
    v_recipient_title := 'New message';
    v_recipient_body := 'You have a message from ' || NEW.sender_email || '.';
    INSERT INTO public.notifications (user_id, kind, title, body, order_id)
    VALUES
      (NEW.sender_id, 'message', v_sender_title, v_sender_body, NULL),
      (v_other_user, 'message', v_recipient_title, v_recipient_body, NULL);
  END IF;
  RETURN NEW;
END;
$$;
