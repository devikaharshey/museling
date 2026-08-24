
-- Move SECURITY DEFINER helpers out of the API-exposed `public` schema to
-- silence the "authenticated_security_definer_function_executable" linter
-- finding, and drop the remaining public-schema definer helpers whose
-- callers now use direct queries via the admin client.

CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

-- ---- RLS helpers (still needed inside policies) ----

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;
REVOKE ALL ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.users_blocked(_a uuid, _b uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.blocks
    WHERE (blocker_id = _a AND blocked_id = _b)
       OR (blocker_id = _b AND blocked_id = _a)
  )
$$;
REVOKE ALL ON FUNCTION private.users_blocked(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.users_blocked(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.is_meetup_group_member(_group_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.concert_group_chat_members
    WHERE group_chat_id = _group_id AND user_id = _user_id AND left_at IS NULL
  )
$$;
REVOKE ALL ON FUNCTION private.is_meetup_group_member(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_meetup_group_member(uuid, uuid) TO authenticated, service_role;

-- ---- Recreate every policy that referenced the public helpers ----

DROP POLICY IF EXISTS "Users view own profile" ON public.profiles;
CREATE POLICY "Users view own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id OR private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins manage concerts" ON public.concerts;
CREATE POLICY "Admins manage concerts" ON public.concerts
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'))
  WITH CHECK (private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Users view own solo recs" ON public.solo_recommendations;
CREATE POLICY "Users view own solo recs" ON public.solo_recommendations
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins manage solo recs" ON public.solo_recommendations;
CREATE POLICY "Admins manage solo recs" ON public.solo_recommendations
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'))
  WITH CHECK (private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admin reads affinity" ON public.affinity_preferences;
CREATE POLICY "admin reads affinity" ON public.affinity_preferences
  FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admin reads blocks" ON public.blocks;
CREATE POLICY "admin reads blocks" ON public.blocks
  FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admin reads all reports" ON public.reports;
CREATE POLICY "admin reads all reports" ON public.reports
  FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admin updates reports" ON public.reports;
CREATE POLICY "admin updates reports" ON public.reports
  FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'))
  WITH CHECK (private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "hide blocked logs" ON public.concert_logs;
CREATE POLICY "hide blocked logs" ON public.concert_logs
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR NOT private.users_blocked(auth.uid(), user_id));

DROP POLICY IF EXISTS "hide blocked reactions" ON public.log_reactions;
CREATE POLICY "hide blocked reactions" ON public.log_reactions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR NOT private.users_blocked(auth.uid(), user_id));

DROP POLICY IF EXISTS "hide blocked comments" ON public.log_comments;
CREATE POLICY "hide blocked comments" ON public.log_comments
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR NOT private.users_blocked(auth.uid(), user_id));

DROP POLICY IF EXISTS "Members view their groups" ON public.concert_group_chats;
CREATE POLICY "Members view their groups" ON public.concert_group_chats
  FOR SELECT TO authenticated
  USING (private.is_meetup_group_member(id, auth.uid()));

DROP POLICY IF EXISTS "Members view co-members" ON public.concert_group_chat_members;
CREATE POLICY "Members view co-members" ON public.concert_group_chat_members
  FOR SELECT TO authenticated
  USING (private.is_meetup_group_member(group_chat_id, auth.uid()));

DROP POLICY IF EXISTS "Members read group messages" ON public.group_chat_messages;
CREATE POLICY "Members read group messages" ON public.group_chat_messages
  FOR SELECT TO authenticated
  USING (private.is_meetup_group_member(group_chat_id, auth.uid()));

DROP POLICY IF EXISTS "Members send group messages" ON public.group_chat_messages;
CREATE POLICY "Members send group messages" ON public.group_chat_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND is_system = false
    AND private.is_meetup_group_member(group_chat_id, auth.uid())
  );

DROP POLICY IF EXISTS "admin reads all evidence" ON storage.objects;
CREATE POLICY "admin reads all evidence" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'report-evidence' AND private.has_role(auth.uid(), 'admin'));

-- ---- Drop the now-unreferenced public.* SECURITY DEFINER helpers ----

DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);
DROP FUNCTION IF EXISTS public.users_blocked(uuid, uuid);
DROP FUNCTION IF EXISTS public.is_meetup_group_member(uuid, uuid);
DROP FUNCTION IF EXISTS public.get_public_profiles(uuid[]);
DROP FUNCTION IF EXISTS public.caller_has_concert_intent(uuid);
DROP FUNCTION IF EXISTS public.enrich_concert_catalog(uuid, text, timestamptz, text, text);
