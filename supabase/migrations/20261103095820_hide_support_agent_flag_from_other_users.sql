/*
# Hide support-agent status from other users

1. New Function
- `is_support_agent()`: returns true only when the signed-in caller's own profile is marked as a support agent. Runs with owner rights so policies can check the flag without exposing it.

2. Modified Access
- `profiles`: authenticated users can read only the public profile columns. `is_support_agent` is no longer readable through the data API by any client, so other users cannot tell which accounts are support staff.
- anon loses all direct read access to `profiles` (it had no policy granting rows anyway).

3. Modified Policies
- The agent read policies on `support_threads` and `support_messages` now call `is_support_agent()` instead of reading the flag from `profiles` directly, so agents keep full inbox access.

4. Security
- `is_support_agent()` is executable by signed-in users only; it reveals only the caller's own status.
- Agent reply function behaviour is unchanged.

5. Important Notes
- The flag itself is still set only by a database operator; customers cannot change it.
*/

REVOKE SELECT ON public.profiles FROM anon, authenticated;
GRANT SELECT (id, handle, display_name, bio, is_seller, sales_count, created_at, seller_since_year, avatar_url)
  ON public.profiles TO authenticated;

CREATE OR REPLACE FUNCTION public.is_support_agent()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce((SELECT p.is_support_agent FROM public.profiles p WHERE p.id = auth.uid()), false)
$$;

REVOKE EXECUTE ON FUNCTION public.is_support_agent() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_support_agent() TO authenticated;

DROP POLICY IF EXISTS "select_support_threads_for_agent" ON public.support_threads;
CREATE POLICY "select_support_threads_for_agent" ON public.support_threads FOR SELECT
  TO authenticated USING (
    auth.uid() = user_id
    OR public.is_support_agent()
  );

DROP POLICY IF EXISTS "select_support_messages_for_agent" ON public.support_messages;
CREATE POLICY "select_support_messages_for_agent" ON public.support_messages FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.support_threads
      WHERE support_threads.id = support_messages.thread_id
      AND (
        support_threads.user_id = auth.uid()
        OR public.is_support_agent()
      )
    )
  );
