
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS credit_balance_pence INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.credit_topups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pack_id TEXT NOT NULL,
  amount_pence INTEGER NOT NULL,
  bonus_pence INTEGER NOT NULL DEFAULT 0,
  credits_pence INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','failed')),
  stripe_session_id TEXT UNIQUE,
  environment TEXT NOT NULL DEFAULT 'sandbox',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
GRANT SELECT ON public.credit_topups TO authenticated;
GRANT ALL ON public.credit_topups TO service_role;
ALTER TABLE public.credit_topups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own topups" ON public.credit_topups
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.credit_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  delta_pence INTEGER NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('topup','invitation_accept','starter_bonus','adjustment','refund')),
  invitation_id UUID REFERENCES public.invitations(id) ON DELETE SET NULL,
  topup_id UUID REFERENCES public.credit_topups(id) ON DELETE SET NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS credit_ledger_user_idx ON public.credit_ledger(user_id, created_at DESC);
GRANT SELECT ON public.credit_ledger TO authenticated;
GRANT ALL ON public.credit_ledger TO service_role;
ALTER TABLE public.credit_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own ledger" ON public.credit_ledger
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Cost of an invitation = ceil(20% of seats * ticket_price)
CREATE OR REPLACE FUNCTION public.invitation_credit_cost(_invitation_id UUID)
RETURNS INTEGER LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT GREATEST(0, CEIL(((1 + COALESCE(i.guest_count, 0)) * COALESCE(c.ticket_price_pence, 0) * 0.20))::INTEGER)
  FROM public.invitations i
  JOIN public.concerts c ON c.id = i.concert_id
  WHERE i.id = _invitation_id;
$$;

-- Accept an invitation by spending credits. Returns JSON: {ok, cost, balance, shortfall}.
CREATE OR REPLACE FUNCTION public.accept_invitation_with_credits(_invitation_id UUID, _with_guest BOOLEAN)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user UUID := auth.uid();
  v_inv public.invitations%ROWTYPE;
  v_balance INTEGER;
  v_cost INTEGER;
  v_guest INTEGER;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_inv FROM public.invitations WHERE id = _invitation_id AND user_id = v_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invitation not found'; END IF;
  IF v_inv.status = 'confirmed' THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;
  IF v_inv.status <> 'pending' THEN RAISE EXCEPTION 'Invitation no longer pending'; END IF;

  v_guest := CASE WHEN _with_guest AND v_inv.guests_allowed THEN 1 ELSE 0 END;
  UPDATE public.invitations SET guest_count = v_guest WHERE id = _invitation_id;

  SELECT GREATEST(0, CEIL(((1 + v_guest) * COALESCE(c.ticket_price_pence, 0) * 0.20))::INTEGER)
    INTO v_cost
  FROM public.concerts c WHERE c.id = v_inv.concert_id;

  SELECT credit_balance_pence INTO v_balance FROM public.profiles WHERE id = v_user FOR UPDATE;
  IF v_balance IS NULL THEN v_balance := 0; END IF;

  IF v_balance < v_cost THEN
    RETURN jsonb_build_object('ok', false, 'cost', v_cost, 'balance', v_balance, 'shortfall', v_cost - v_balance);
  END IF;

  UPDATE public.profiles SET credit_balance_pence = credit_balance_pence - v_cost WHERE id = v_user;
  INSERT INTO public.credit_ledger (user_id, delta_pence, reason, invitation_id, note)
    VALUES (v_user, -v_cost, 'invitation_accept', _invitation_id, '20% of ticket');
  UPDATE public.invitations
    SET status = 'confirmed', responded_at = now()
    WHERE id = _invitation_id;

  RETURN jsonb_build_object('ok', true, 'cost', v_cost, 'balance', v_balance - v_cost);
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_invitation_with_credits(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.invitation_credit_cost(UUID) TO authenticated;
