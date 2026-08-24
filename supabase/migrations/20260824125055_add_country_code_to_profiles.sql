ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS country_code TEXT;

COMMENT ON COLUMN public.profiles.country_code
IS 'ISO 3166-1 alpha-2 country code used for payment gateway selection.';