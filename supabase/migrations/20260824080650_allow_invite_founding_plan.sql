ALTER TABLE public.profiles
DROP CONSTRAINT IF EXISTS profiles_founding_plan_check;

ALTER TABLE public.profiles
ADD CONSTRAINT profiles_founding_plan_check
CHECK (
  founding_plan IS NULL
  OR founding_plan IN ('invite', 'monthly', 'yearly', 'lifetime')
);