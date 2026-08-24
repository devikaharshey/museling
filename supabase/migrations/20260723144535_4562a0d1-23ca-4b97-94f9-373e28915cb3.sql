
DROP POLICY IF EXISTS "Authenticated can view going intents" ON public.concert_intents;

CREATE POLICY "Users can view their own intents"
ON public.concert_intents
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all intents"
ON public.concert_intents
FOR SELECT
TO authenticated
USING (private.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.get_concert_intent_counts()
RETURNS TABLE(concert_slug text, going_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT concert_slug, COUNT(*)::bigint
  FROM public.concert_intents
  GROUP BY concert_slug;
$$;

REVOKE ALL ON FUNCTION public.get_concert_intent_counts() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_concert_intent_counts() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_concert_intent_counts() TO authenticated;
