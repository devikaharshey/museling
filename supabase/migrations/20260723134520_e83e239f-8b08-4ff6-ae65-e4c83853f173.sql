
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS founding_paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS founding_expires_at timestamptz;

-- Track group-invite status distinctly for founding flow. We reuse concert_group_chats
-- and allow a 'pending_payment' status. No CHECK constraint exists to update.

-- Helper to test active founding membership.
CREATE OR REPLACE FUNCTION public.has_active_founding(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _user_id
      AND founding_expires_at IS NOT NULL
      AND founding_expires_at > now()
  );
$$;

REVOKE ALL ON FUNCTION public.has_active_founding(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_active_founding(uuid) TO authenticated, service_role;
