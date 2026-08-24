
CREATE OR REPLACE FUNCTION public.enrich_concert_catalog(
  _concert_id uuid,
  _venue text,
  _concert_at timestamptz,
  _genre text,
  _description text
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.concerts
  SET
    venue = COALESCE(NULLIF(venue, ''), NULLIF(_venue, '')),
    concert_at = COALESCE(concert_at, _concert_at),
    genre = COALESCE(NULLIF(genre, ''), NULLIF(_genre, '')),
    description = COALESCE(NULLIF(description, ''), NULLIF(_description, '')),
    updated_at = now()
  WHERE id = _concert_id
    AND (
      (venue IS NULL OR venue = '') OR
      concert_at IS NULL OR
      (genre IS NULL OR genre = '') OR
      (description IS NULL OR description = '')
    );
$$;

GRANT EXECUTE ON FUNCTION public.enrich_concert_catalog(uuid, text, timestamptz, text, text) TO authenticated;
