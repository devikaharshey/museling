ALTER TABLE public.invitations
  ADD COLUMN IF NOT EXISTS guests_allowed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS guest_count int NOT NULL DEFAULT 0;

ALTER TABLE public.invitations
  DROP CONSTRAINT IF EXISTS invitations_guest_count_check;
ALTER TABLE public.invitations
  ADD CONSTRAINT invitations_guest_count_check CHECK (guest_count IN (0, 1));

INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'admin'::public.app_role
FROM auth.users u
WHERE COALESCE(u.email, '') NOT LIKE '%@museling.test'
ON CONFLICT (user_id, role) DO NOTHING;