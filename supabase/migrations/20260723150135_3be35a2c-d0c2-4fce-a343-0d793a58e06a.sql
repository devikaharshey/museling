
-- Merge block condition into visibility SELECT policies (permissive policies OR together, so keep only one consolidated SELECT policy)
DROP POLICY IF EXISTS "View public logs or own logs" ON public.concert_logs;
DROP POLICY IF EXISTS "hide blocked logs" ON public.concert_logs;
CREATE POLICY "View public non-blocked logs or own logs" ON public.concert_logs
  FOR SELECT USING (
    auth.uid() = user_id
    OR (visibility = 'public' AND NOT private.users_blocked(auth.uid(), user_id))
  );

DROP POLICY IF EXISTS "View comments on visible logs" ON public.log_comments;
DROP POLICY IF EXISTS "hide blocked comments" ON public.log_comments;
CREATE POLICY "View comments on visible non-blocked logs" ON public.log_comments
  FOR SELECT USING (
    auth.uid() = user_id
    OR (
      NOT private.users_blocked(auth.uid(), user_id)
      AND EXISTS (
        SELECT 1 FROM public.concert_logs cl
        WHERE cl.id = log_comments.log_id
          AND (cl.visibility = 'public' OR cl.user_id = auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS "View reactions on visible logs" ON public.log_reactions;
DROP POLICY IF EXISTS "hide blocked reactions" ON public.log_reactions;
CREATE POLICY "View reactions on visible non-blocked logs" ON public.log_reactions
  FOR SELECT USING (
    auth.uid() = user_id
    OR (
      NOT private.users_blocked(auth.uid(), user_id)
      AND EXISTS (
        SELECT 1 FROM public.concert_logs cl
        WHERE cl.id = log_reactions.log_id
          AND (cl.visibility = 'public' OR cl.user_id = auth.uid())
      )
    )
  );

-- Restrict SECURITY DEFINER aggregate to service_role only; callers will go through a server function
REVOKE EXECUTE ON FUNCTION public.get_concert_intent_counts() FROM PUBLIC, anon, authenticated;
