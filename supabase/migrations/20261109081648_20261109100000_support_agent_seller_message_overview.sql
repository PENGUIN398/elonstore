/*
# Support agent seller-message overview

## Purpose
Gives support agents visibility into all buyer-seller conversations across the
marketplace, so the agent can monitor which sellers have received messages and
from whom — e.g. "Seller okami (okami@gmail.com) has a message from alan@gmail.com".

## What this adds
1. `get_seller_message_overview()` — SECURITY DEFINER function returning one row
   per order_conversation with seller + buyer profiles/emails, last message body
   and timestamp, and total message count. Only callable by support agents.

2. `get_seller_message_detail(p_conversation_id uuid)` — SECURITY DEFINER function
   returning the full message thread for a conversation with sender emails.
   Only callable by support agents.

## Security
- Both functions are SECURITY DEFINER (can read auth.users for emails and all
  order_conversations/order_messages rows regardless of RLS).
- EXECUTE revoked from PUBLIC/anon, granted only to authenticated.
- Each function verifies the caller is a support agent; otherwise raises an exception.
- Functions are read-only.

## Important notes
1. Support agents already have the inbox nav item (supportAgentOnly).
2. The existing support_threads inbox is unchanged; this adds a new data source.
3. No existing tables, columns, or policies are modified.
*/

CREATE OR REPLACE FUNCTION public.get_seller_message_overview()
RETURNS TABLE (
  conversation_id uuid,
  order_id uuid,
  seller_id uuid,
  seller_handle text,
  seller_display_name text,
  seller_email text,
  buyer_id uuid,
  buyer_handle text,
  buyer_display_name text,
  buyer_email text,
  last_message_body text,
  last_message_at timestamptz,
  message_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND is_support_agent = true
  ) THEN
    RAISE EXCEPTION 'Only support agents can access seller message overview';
  END IF;

  RETURN QUERY
  SELECT
    oc.id::uuid,
    oc.order_id::uuid,
    oc.seller_id::uuid,
    sp.handle::text,
    sp.display_name::text,
    su.email::text,
    oc.buyer_id::uuid,
    bp.handle::text,
    bp.display_name::text,
    bu.email::text,
    (SELECT om.body::text FROM public.order_messages om WHERE om.conversation_id = oc.id ORDER BY om.created_at DESC LIMIT 1),
    (SELECT om.created_at FROM public.order_messages om WHERE om.conversation_id = oc.id ORDER BY om.created_at DESC LIMIT 1),
    (SELECT count(*)::bigint FROM public.order_messages om WHERE om.conversation_id = oc.id)
  FROM public.order_conversations oc
  LEFT JOIN public.profiles sp ON sp.id = oc.seller_id
  LEFT JOIN auth.users su ON su.id = oc.seller_id
  LEFT JOIN public.profiles bp ON bp.id = oc.buyer_id
  LEFT JOIN auth.users bu ON bu.id = oc.buyer_id
  WHERE oc.seller_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.order_messages om2 WHERE om2.conversation_id = oc.id)
  ORDER BY 12 DESC NULLS LAST;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_seller_message_detail(p_conversation_id uuid)
RETURNS TABLE (
  message_id uuid,
  conversation_id uuid,
  sender_id uuid,
  sender_email text,
  sender_handle text,
  sender_display_name text,
  body text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND is_support_agent = true
  ) THEN
    RAISE EXCEPTION 'Only support agents can access seller message detail';
  END IF;

  RETURN QUERY
  SELECT
    om.id::uuid,
    om.conversation_id::uuid,
    om.sender_id::uuid,
    om.sender_email::text,
    p.handle::text,
    p.display_name::text,
    om.body::text,
    om.created_at
  FROM public.order_messages om
  LEFT JOIN public.profiles p ON p.id = om.sender_id
  WHERE om.conversation_id = p_conversation_id
  ORDER BY om.created_at ASC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_seller_message_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_seller_message_overview() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_seller_message_detail(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_seller_message_detail(uuid) TO authenticated;
