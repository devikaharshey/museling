
-- 1) groups (no policies referencing invitations yet)
CREATE TABLE public.groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  concert_id uuid NOT NULL REFERENCES public.concerts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.groups TO authenticated;
GRANT ALL ON public.groups TO service_role;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage groups" ON public.groups
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER groups_updated_at BEFORE UPDATE ON public.groups
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2) add group_id to invitations
ALTER TABLE public.invitations ADD COLUMN group_id uuid REFERENCES public.groups(id) ON DELETE SET NULL;
CREATE INDEX invitations_group_id_idx ON public.invitations(group_id);

-- 3) Now we can reference invitations.group_id in policies
CREATE POLICY "Members view their groups" ON public.groups
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.invitations i WHERE i.group_id = groups.id AND i.user_id = auth.uid())
  );

CREATE POLICY "Group members view co-invitations" ON public.invitations
  FOR SELECT TO authenticated
  USING (
    group_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.invitations mine
      WHERE mine.group_id = invitations.group_id AND mine.user_id = auth.uid()
    )
  );

-- 4) Group chat
CREATE TABLE public.group_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.group_messages TO authenticated;
GRANT ALL ON public.group_messages TO service_role;
CREATE INDEX group_messages_group_id_created_at_idx ON public.group_messages(group_id, created_at);
ALTER TABLE public.group_messages ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.group_chat_open(_group_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.invitations i
    JOIN public.groups g ON g.id = i.group_id
    JOIN public.concerts c ON c.id = g.concert_id
    WHERE i.group_id = _group_id
      AND i.user_id = _user_id
      AND i.status = 'confirmed'
      AND c.concert_at <= now() + interval '1 day'
  )
$$;

CREATE POLICY "Confirmed members read chat when open" ON public.group_messages
  FOR SELECT TO authenticated
  USING (public.group_chat_open(group_id, auth.uid()));
CREATE POLICY "Confirmed members post when open" ON public.group_messages
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.group_chat_open(group_id, auth.uid()));
CREATE POLICY "Admins view all chat" ON public.group_messages
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 5) Reminder log
CREATE TABLE public.reminder_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invitation_id uuid NOT NULL REFERENCES public.invitations(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('t7','t3','t1','deadline')),
  sent_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (invitation_id, kind)
);
GRANT SELECT ON public.reminder_log TO authenticated;
GRANT ALL ON public.reminder_log TO service_role;
ALTER TABLE public.reminder_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read reminder log" ON public.reminder_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 6) Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.group_messages;
ALTER TABLE public.group_messages REPLICA IDENTITY FULL;
