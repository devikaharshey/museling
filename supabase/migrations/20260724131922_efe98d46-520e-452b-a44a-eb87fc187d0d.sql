
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS founding_plan text,
  ADD COLUMN IF NOT EXISTS founding_lifetime boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS founding_stripe_subscription_id text;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_founding_plan_check
  CHECK (founding_plan IS NULL OR founding_plan IN ('monthly','yearly','lifetime'));

-- Drop credits system
DROP TABLE IF EXISTS public.credit_ledger CASCADE;
DROP TABLE IF EXISTS public.credit_topups CASCADE;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS credit_balance_pence;

-- Update has_active_founding to include lifetime
CREATE OR REPLACE FUNCTION public.has_active_founding(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _user_id
      AND (
        founding_lifetime = true
        OR (founding_expires_at IS NOT NULL AND founding_expires_at > now())
      )
  );
$$;
