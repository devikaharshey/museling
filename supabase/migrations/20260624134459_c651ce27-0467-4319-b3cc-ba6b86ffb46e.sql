CREATE OR REPLACE FUNCTION public.is_group_member(_group_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.invitations WHERE group_id = _group_id AND user_id = _user_id)
$$;

DROP POLICY IF EXISTS "Group members view co-invitations" ON public.invitations;
CREATE POLICY "Group members view co-invitations" ON public.invitations
FOR SELECT USING (group_id IS NOT NULL AND public.is_group_member(group_id, auth.uid()));

DROP POLICY IF EXISTS "Members view their groups" ON public.groups;
CREATE POLICY "Members view their groups" ON public.groups
FOR SELECT USING (public.is_group_member(id, auth.uid()));