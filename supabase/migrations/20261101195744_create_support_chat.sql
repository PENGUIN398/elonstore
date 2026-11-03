/*
# Create private customer support chat

1. New Tables
- `support_threads`: one private dispute/support conversation per customer, with subject and open/closed status.
- `support_messages`: customer and agent messages belonging to a support thread.
- Message bodies are limited to 4,000 characters and stored with sender type and timestamp.

2. New Functions
- `create_support_thread(subject, message)`: creates a customer-owned thread and its first customer message atomically.
- `send_support_message(thread_id, message)`: adds a customer message only to a thread owned by the signed-in caller.
- `send_agent_support_message(thread_id, message)`: restricted server-side function for trusted support agents to reply.

3. Security
- Row level security is enabled on both tables.
- Customers can read only their own threads and messages.
- Customers cannot directly write message sender types or impersonate an agent; customer writes go through validated functions.
- Agent replies are not executable by anonymous or normal authenticated users.

4. Important Notes
- The customer interface supports opening a dispute and continuing the conversation.
- Agent replies require a trusted support operation using the restricted agent function; no customer can create an agent message from the browser.
*/

CREATE TABLE IF NOT EXISTS public.support_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject text NOT NULL CHECK (char_length(trim(subject)) BETWEEN 3 AND 120),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.support_threads(id) ON DELETE CASCADE,
  sender_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  sender_type text NOT NULL CHECK (sender_type IN ('customer', 'agent')),
  body text NOT NULL CHECK (char_length(trim(body)) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_threads_user_updated_idx
  ON public.support_threads (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS support_messages_thread_created_idx
  ON public.support_messages (thread_id, created_at ASC);

ALTER TABLE public.support_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.support_threads TO authenticated;
GRANT SELECT ON public.support_messages TO authenticated;

DROP POLICY IF EXISTS "select_own_support_threads" ON public.support_threads;
CREATE POLICY "select_own_support_threads" ON public.support_threads FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "select_own_support_messages" ON public.support_messages;
CREATE POLICY "select_own_support_messages" ON public.support_messages FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.support_threads
      WHERE support_threads.id = support_messages.thread_id
      AND support_threads.user_id = auth.uid()
    )
  );

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
  v_message text := trim(coalesce(p_message, ''));
  v_message_id uuid;
BEGIN
  IF char_length(v_message) < 1 OR char_length(v_message) > 4000 THEN
    RAISE EXCEPTION 'Invalid support message';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.support_threads WHERE id = p_thread_id AND status = 'open') THEN
    RAISE EXCEPTION 'Support conversation not found or closed';
  END IF;

  INSERT INTO public.support_messages (thread_id, sender_id, sender_type, body)
  VALUES (p_thread_id, NULL, 'agent', v_message)
  RETURNING id INTO v_message_id;

  UPDATE public.support_threads SET updated_at = now() WHERE id = p_thread_id;
  RETURN v_message_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_support_thread(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_support_thread(text, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.send_support_message(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_support_message(uuid, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.send_agent_support_message(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.send_agent_support_message(uuid, text) TO service_role;
