ALTER TABLE public.concert_logs ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','private'));

DROP POLICY IF EXISTS "Authenticated can view all logs" ON public.concert_logs;
CREATE POLICY "View public logs or own logs" ON public.concert_logs
  FOR SELECT
  USING (visibility = 'public' OR auth.uid() = user_id);