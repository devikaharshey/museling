
-- =========================================================
-- 1. Drop old admin-invitation flow
-- =========================================================
DROP TRIGGER IF EXISTS invitation_confirmed_to_user_concert ON public.invitations;
DROP FUNCTION IF EXISTS public.handle_invitation_confirmed() CASCADE;
DROP FUNCTION IF EXISTS public.accept_invitation_with_credits(uuid, boolean) CASCADE;
DROP FUNCTION IF EXISTS public.invitation_credit_cost(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.is_group_member(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.group_chat_open(uuid, uuid) CASCADE;

ALTER TABLE public.user_concerts DROP CONSTRAINT IF EXISTS user_concerts_invitation_id_fkey;
ALTER TABLE public.user_concerts DROP COLUMN IF EXISTS invitation_id;

DROP TABLE IF EXISTS public.reminder_log CASCADE;
DROP TABLE IF EXISTS public.credit_ledger CASCADE;
DROP TABLE IF EXISTS public.group_messages CASCADE;
DROP TABLE IF EXISTS public.invitations CASCADE;
DROP TABLE IF EXISTS public.groups CASCADE;

-- =========================================================
-- 2. Profile settings for meetups
-- =========================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS open_to_meetups boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS include_age_in_matching boolean NOT NULL DEFAULT true;

-- =========================================================
-- 3. concert_intents: add proper concert_id + join_group_chat
-- =========================================================
ALTER TABLE public.concert_intents
  ADD COLUMN IF NOT EXISTS concert_id uuid REFERENCES public.concerts(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS join_group_chat boolean NOT NULL DEFAULT false;

-- Backfill concert_id where slug can be derived from concert name
UPDATE public.concert_intents ci
SET concert_id = c.id
FROM public.concerts c
WHERE ci.concert_id IS NULL
  AND regexp_replace(lower(c.name), '[^a-z0-9]+', '-', 'g') = ci.concert_slug;

CREATE INDEX IF NOT EXISTS concert_intents_concert_id_idx ON public.concert_intents(concert_id);

-- =========================================================
-- 4. New tables
-- =========================================================
DO $$ BEGIN
  CREATE TYPE public.group_chat_status AS ENUM ('forming','active','closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- concert_group_chats
CREATE TABLE public.concert_group_chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  concert_id uuid NOT NULL REFERENCES public.concerts(id) ON DELETE CASCADE,
  status public.group_chat_status NOT NULL DEFAULT 'forming',
  closes_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.concert_group_chats TO authenticated;
GRANT ALL ON public.concert_group_chats TO service_role;
ALTER TABLE public.concert_group_chats ENABLE ROW LEVEL SECURITY;

-- concert_group_chat_members
CREATE TABLE public.concert_group_chat_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_chat_id uuid NOT NULL REFERENCES public.concert_group_chats(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  UNIQUE (group_chat_id, user_id)
);
CREATE INDEX concert_group_chat_members_user_idx ON public.concert_group_chat_members(user_id) WHERE left_at IS NULL;
CREATE INDEX concert_group_chat_members_group_idx ON public.concert_group_chat_members(group_chat_id);
GRANT SELECT, UPDATE ON public.concert_group_chat_members TO authenticated;
GRANT ALL ON public.concert_group_chat_members TO service_role;
ALTER TABLE public.concert_group_chat_members ENABLE ROW LEVEL SECURITY;

-- group_chat_messages
CREATE TABLE public.group_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_chat_id uuid NOT NULL REFERENCES public.concert_group_chats(id) ON DELETE CASCADE,
  sender_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 300),
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX group_chat_messages_group_idx ON public.group_chat_messages(group_chat_id, created_at);
GRANT SELECT, INSERT ON public.group_chat_messages TO authenticated;
GRANT ALL ON public.group_chat_messages TO service_role;
ALTER TABLE public.group_chat_messages ENABLE ROW LEVEL SECURITY;

-- follows
CREATE TABLE public.follows (
  follower_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  followed_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, followed_id),
  CHECK (follower_id <> followed_id)
);
CREATE INDEX follows_followed_idx ON public.follows(followed_id);
GRANT SELECT, INSERT, DELETE ON public.follows TO authenticated;
GRANT ALL ON public.follows TO service_role;
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone signed in can view follows" ON public.follows FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users create own follows"  ON public.follows FOR INSERT TO authenticated WITH CHECK (auth.uid() = follower_id);
CREATE POLICY "Users delete own follows"  ON public.follows FOR DELETE TO authenticated USING (auth.uid() = follower_id);

-- notifications
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  title text NOT NULL,
  body text,
  link text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON public.notifications(user_id, created_at DESC);
GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own notifications" ON public.notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users update own notifications" ON public.notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- =========================================================
-- 5. Membership helper (SECURITY DEFINER — avoids RLS recursion)
-- =========================================================
CREATE OR REPLACE FUNCTION public.is_meetup_group_member(_group_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.concert_group_chat_members
    WHERE group_chat_id = _group_id AND user_id = _user_id AND left_at IS NULL
  );
$$;

-- Policies that depend on the helper
CREATE POLICY "Members view their groups"
  ON public.concert_group_chats FOR SELECT TO authenticated
  USING (public.is_meetup_group_member(id, auth.uid()));

CREATE POLICY "Members view co-members"
  ON public.concert_group_chat_members FOR SELECT TO authenticated
  USING (public.is_meetup_group_member(group_chat_id, auth.uid()));

CREATE POLICY "Members can leave own membership"
  ON public.concert_group_chat_members FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Members read group messages"
  ON public.group_chat_messages FOR SELECT TO authenticated
  USING (public.is_meetup_group_member(group_chat_id, auth.uid()));

CREATE POLICY "Members send group messages"
  ON public.group_chat_messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND is_system = false
    AND public.is_meetup_group_member(group_chat_id, auth.uid())
  );

-- =========================================================
-- 6. updated_at triggers
-- =========================================================
CREATE TRIGGER concert_group_chats_updated_at
  BEFORE UPDATE ON public.concert_group_chats
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- 7. Realtime
-- =========================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.group_chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
