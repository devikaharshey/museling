-- has_role() is invoked by RLS policies on profiles/concerts/invitations/solo_recommendations,
-- so authenticated users must be able to EXECUTE it. The function is SECURITY DEFINER and
-- only reads from user_roles by uid/role, which is safe to expose to signed-in users.
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;