ALTER TABLE public.concerts
  ADD COLUMN IF NOT EXISTS lat double precision,
  ADD COLUMN IF NOT EXISTS lng double precision,
  ADD COLUMN IF NOT EXISTS booking_url text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS external_id text;

CREATE UNIQUE INDEX IF NOT EXISTS concerts_source_external_uk
  ON public.concerts (source, external_id)
  WHERE source IS NOT NULL AND external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS concerts_city_idx ON public.concerts (city);
CREATE INDEX IF NOT EXISTS concerts_concert_at_idx ON public.concerts (concert_at);