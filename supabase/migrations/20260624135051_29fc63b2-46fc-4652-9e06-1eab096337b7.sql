
CREATE TABLE public.concert_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  concert_slug text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, concert_slug)
);

GRANT SELECT, INSERT, DELETE ON public.concert_intents TO authenticated;
GRANT SELECT ON public.concert_intents TO anon;
GRANT ALL ON public.concert_intents TO service_role;

ALTER TABLE public.concert_intents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view going counts"
  ON public.concert_intents FOR SELECT
  USING (true);

CREATE POLICY "Users can mark themselves going"
  ON public.concert_intents FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can remove their own going mark"
  ON public.concert_intents FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX concert_intents_slug_idx ON public.concert_intents(concert_slug);
