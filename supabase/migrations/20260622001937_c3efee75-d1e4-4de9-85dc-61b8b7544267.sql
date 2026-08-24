-- user_concerts table
CREATE TABLE public.user_concerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('invitation','independent')),
  concert_name text NOT NULL,
  artists text[] NOT NULL DEFAULT '{}',
  venue text,
  concert_at timestamptz,
  genres text[] NOT NULL DEFAULT '{}',
  programme text,
  duration_minutes int,
  invitation_id uuid REFERENCES public.invitations(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (invitation_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_concerts TO authenticated;
GRANT ALL ON public.user_concerts TO service_role;

ALTER TABLE public.user_concerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own concerts" ON public.user_concerts
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER user_concerts_set_updated_at
  BEFORE UPDATE ON public.user_concerts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX user_concerts_user_id_idx ON public.user_concerts(user_id, concert_at DESC);

-- concert_logs table
CREATE TABLE public.concert_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_concert_id uuid NOT NULL UNIQUE REFERENCES public.user_concerts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating int CHECK (rating BETWEEN 1 AND 5),
  notes text,
  favourite_moment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.concert_logs TO authenticated;
GRANT ALL ON public.concert_logs TO service_role;

ALTER TABLE public.concert_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own logs" ON public.concert_logs
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER concert_logs_set_updated_at
  BEFORE UPDATE ON public.concert_logs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Trigger: when an invitation becomes 'confirmed', create a matching user_concerts row
CREATE OR REPLACE FUNCTION public.handle_invitation_confirmed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c public.concerts%ROWTYPE;
BEGIN
  IF NEW.status = 'confirmed' AND (OLD.status IS DISTINCT FROM 'confirmed') THEN
    SELECT * INTO c FROM public.concerts WHERE id = NEW.concert_id;
    INSERT INTO public.user_concerts (
      user_id, source, concert_name, artists, venue, concert_at, genres, invitation_id
    ) VALUES (
      NEW.user_id,
      'invitation',
      COALESCE(c.name, 'Concert'),
      COALESCE(c.artists, '{}'),
      c.venue,
      c.concert_at,
      COALESCE(c.genres, '{}'),
      NEW.id
    )
    ON CONFLICT (invitation_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER invitation_confirmed_to_user_concert
  AFTER UPDATE OF status ON public.invitations
  FOR EACH ROW EXECUTE FUNCTION public.handle_invitation_confirmed();