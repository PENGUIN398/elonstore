/*
# Add protected support-agent access

1. Modified Tables
- `profiles.is_support_agent`: private operator-controlled flag identifying trusted support staff. It defaults to false and is not writable by customers.

2. Security
- Support threads and messages can be read across customers only when the signed-in profile is marked as a support agent.
- Agent replies are allowed only when the caller's profile has `is_support_agent = true`.
- Customers retain access only to their own support conversations.

3. Important Notes
- The flag must be assigned to the builder's trusted account by an existing server-side administrator or database operator. It cannot be self-assigned from the browser.
*/

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_support_agent boolean NOT NULL DEFAULT false;

DROP POLICY IF EXISTS "select_support_threads_for_agent" ON public.support_threads;
CREATE POLICY "select_support_threads_for_agent" ON public.support_threads FOR SELECT
  TO authenticated USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.is_support_agent = true
    )
  );

DROP POLICY IF EXISTS "select_support_messages_for_agent" ON public.support_messages;
CREATE POLICY "select_support_messages_for_agent" ON public.support_messages FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.support_threads
      WHERE support_threads.id = support_messages.thread_id
      AND (
        support_threads.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.profiles
          WHERE profiles.id = auth.uid() AND profiles.is_support_agent = true
        )
      )
    )
  );

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
  RETURN v_message_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.send_agent_support_message(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_agent_support_message(uuid, text) TO authenticated;
