
-- 1) Remove anon access and replace SECURITY DEFINER view with a controlled function
REVOKE SELECT ON public.public_profiles FROM anon;
DROP VIEW IF EXISTS public.public_profiles;

CREATE OR REPLACE FUNCTION public.get_public_profiles(_ids uuid[])
RETURNS TABLE(
  id uuid,
  full_name text,
  genres text[],
  location text,
  account_status public.account_status
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.full_name, p.genres, p.location, p.account_status
  FROM public.profiles p
  WHERE p.id = ANY(_ids);
$$;

REVOKE ALL ON FUNCTION public.get_public_profiles(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_public_profiles(uuid[]) TO authenticated;

-- 2) Authorization helper: caller has an intent for the given concert
CREATE OR REPLACE FUNCTION public.caller_has_concert_intent(_concert_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.concert_intents
    WHERE concert_id = _concert_id
      AND user_id = auth.uid()
      AND join_group_chat = true
  );
$$;
REVOKE ALL ON FUNCTION public.caller_has_concert_intent(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.caller_has_concert_intent(uuid) TO authenticated;
