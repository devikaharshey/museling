
-- PROFILES: remove broad SELECT, expose safe subset via a view
DROP POLICY IF EXISTS "Authenticated can view profile names" ON public.profiles;

CREATE OR REPLACE VIEW public.public_profiles
WITH (security_invoker = false) AS
SELECT id, full_name, genres, location, account_status
FROM public.profiles;

GRANT SELECT ON public.public_profiles TO authenticated, anon;

-- CONCERT_INTENTS: restrict SELECT to signed-in users only (was public)
DROP POLICY IF EXISTS "Anyone can view going counts" ON public.concert_intents;
CREATE POLICY "Authenticated can view going intents"
  ON public.concert_intents
  FOR SELECT
  TO authenticated
  USING (true);

-- FOLLOWS: only the involved parties can see the edge
DROP POLICY IF EXISTS "Anyone signed in can view follows" ON public.follows;
CREATE POLICY "Involved parties view follows"
  ON public.follows
  FOR SELECT
  TO authenticated
  USING (auth.uid() = follower_id OR auth.uid() = followed_id);

-- USER_CONCERTS: owner-only, plus rows backing a log the caller can already see
DROP POLICY IF EXISTS "Authenticated can view all user_concerts" ON public.user_concerts;
CREATE POLICY "Owner or backing a visible log"
  ON public.user_concerts
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.concert_logs cl
      WHERE cl.user_concert_id = user_concerts.id
        AND (cl.visibility = 'public' OR cl.user_id = auth.uid())
    )
  );

-- LOG_REACTIONS: only visible if the backing log is visible to caller
DROP POLICY IF EXISTS "Authenticated view reactions" ON public.log_reactions;
CREATE POLICY "View reactions on visible logs"
  ON public.log_reactions
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.concert_logs cl
      WHERE cl.id = log_reactions.log_id
        AND (cl.visibility = 'public' OR cl.user_id = auth.uid())
    )
  );

-- LOG_COMMENTS: same visibility gating
DROP POLICY IF EXISTS "Authenticated view comments" ON public.log_comments;
CREATE POLICY "View comments on visible logs"
  ON public.log_comments
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.concert_logs cl
      WHERE cl.id = log_comments.log_id
        AND (cl.visibility = 'public' OR cl.user_id = auth.uid())
    )
  );

-- SECURITY DEFINER trigger functions: only triggers should invoke these,
-- so remove execute from API roles. Triggers still fire normally.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_report_resolution() FROM PUBLIC, anon, authenticated;

-- enrich_concert_catalog is only called from server functions on behalf of
-- signed-in users; strip anon.
REVOKE EXECUTE ON FUNCTION public.enrich_concert_catalog(uuid, text, timestamptz, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enrich_concert_catalog(uuid, text, timestamptz, text, text) TO authenticated;

-- Helper functions used by RLS policies need EXECUTE for the authenticated
-- role that runs the query, but should not be callable by anon.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.users_blocked(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.users_blocked(uuid, uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.is_meetup_group_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_meetup_group_member(uuid, uuid) TO authenticated;
