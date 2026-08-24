
-- Expand visibility for the Feed
CREATE POLICY "Authenticated can view all logs" ON public.concert_logs
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can view all user_concerts" ON public.user_concerts
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can view profile names" ON public.profiles
  FOR SELECT TO authenticated USING (true);

-- Reactions
CREATE TABLE public.log_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  log_id uuid NOT NULL REFERENCES public.concert_logs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reaction text NOT NULL DEFAULT 'encore',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (log_id, user_id, reaction)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.log_reactions TO authenticated;
GRANT ALL ON public.log_reactions TO service_role;
ALTER TABLE public.log_reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated view reactions" ON public.log_reactions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users add own reactions" ON public.log_reactions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users remove own reactions" ON public.log_reactions
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Comments
CREATE TABLE public.log_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  log_id uuid NOT NULL REFERENCES public.concert_logs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.log_comments TO authenticated;
GRANT ALL ON public.log_comments TO service_role;
ALTER TABLE public.log_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated view comments" ON public.log_comments
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users add own comments" ON public.log_comments
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users edit own comments" ON public.log_comments
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own comments" ON public.log_comments
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX log_reactions_log_id_idx ON public.log_reactions(log_id);
CREATE INDEX log_comments_log_id_idx ON public.log_comments(log_id);
