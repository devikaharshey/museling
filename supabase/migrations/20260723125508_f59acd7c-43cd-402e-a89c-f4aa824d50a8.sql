ALTER TABLE public.concert_intents
  ADD COLUMN IF NOT EXISTS companion_mode text,
  ADD COLUMN IF NOT EXISTS companion_count integer;

ALTER TABLE public.concert_intents
  DROP CONSTRAINT IF EXISTS concert_intents_companion_mode_check;
ALTER TABLE public.concert_intents
  ADD CONSTRAINT concert_intents_companion_mode_check
  CHECK (companion_mode IS NULL OR companion_mode IN ('solo_happy','meet_others','group_open'));

ALTER TABLE public.concert_intents
  DROP CONSTRAINT IF EXISTS concert_intents_companion_count_check;
ALTER TABLE public.concert_intents
  ADD CONSTRAINT concert_intents_companion_count_check
  CHECK (companion_count IS NULL OR (companion_count >= 1 AND companion_count <= 20));