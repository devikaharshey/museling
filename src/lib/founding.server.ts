import type Stripe from "stripe";

export type FoundingSyncResult = {
  active: boolean;
  plan: "invite" | "monthly" | "yearly" | "lifetime" | null;
  lifetime: boolean;
  expiresAt: string | null;
};

const PLAN_BY_LOOKUP: Record<string, "invite" | "monthly" | "yearly" | "lifetime"> = {
  museling_founding_invite: "invite",
  museling_founding_5: "invite",
  museling_founding_monthly: "monthly",
  museling_founding_yearly: "yearly",
  museling_founding_lifetime: "lifetime",
};

function planFromSession(session: Stripe.Checkout.Session) {
  const meta = (session.metadata ?? {}) as Record<string, string>;
  return PLAN_BY_LOOKUP[meta.plan ?? ""] ?? PLAN_BY_LOOKUP[meta.priceId ?? ""] ?? null;
}

/**
 * Reconciles a user's founding membership directly from Stripe.
 * Used right after checkout so the UI doesn't have to wait on the webhook.
 */
export async function syncFoundingFromStripe(
  stripe: Stripe,
  userId: string,
  customerId: string | null,
): Promise<FoundingSyncResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const sb: any = supabaseAdmin;

  const { data: prof } = await sb
    .from("profiles")
    .select(
      "founding_plan, founding_lifetime, founding_expires_at, stripe_customer_id, stripe_session_id",
    )
    .eq("id", userId)
    .maybeSingle();
  const p = (prof ?? {}) as any;

  const cid: string | null = customerId ?? p.stripe_customer_id ?? null;
  const now = new Date();

  const current = (): FoundingSyncResult => ({
    active:
      !!p.founding_lifetime || (!!p.founding_expires_at && new Date(p.founding_expires_at) > now),
    plan: (p.founding_plan as FoundingSyncResult["plan"]) ?? null,
    lifetime: !!p.founding_lifetime,
    expiresAt: p.founding_expires_at ?? null,
  });

  if (!cid) return current();

  // ---- Subscriptions (monthly / yearly)
  const subs = await stripe.subscriptions.list({ customer: cid, status: "all", limit: 10 });
  const liveSub = subs.data.find((s) => ["active", "trialing", "past_due"].includes(s.status));
  if (liveSub) {
    const item = liveSub.items?.data?.[0];
    const lookup =
      (item?.price?.lookup_key as string | undefined) ||
      (item?.price?.metadata?.lovable_external_id as string | undefined) ||
      "";
    const plan = PLAN_BY_LOOKUP[lookup] ?? null;
    const periodEnd = (item as any)?.current_period_end ?? (liveSub as any).current_period_end;
    const expiresAt = periodEnd ? new Date(periodEnd * 1000).toISOString() : null;
    if (plan === "monthly" || plan === "yearly") {
      await sb.from("profiles").upsert({
        id: userId,
        founding_plan: plan,
        founding_stripe_subscription_id: liveSub.id,
        founding_paid_at: p.founding_paid_at ?? now.toISOString(),
        founding_expires_at: expiresAt,
        stripe_customer_id: cid,
        signup_complete: true,
      });
      return { active: true, plan, lifetime: false, expiresAt };
    }
  }

  // ---- One-time purchases (invite / lifetime)
  const sessions = await stripe.checkout.sessions.list({ customer: cid, limit: 10 });
  const paid = sessions.data
    .filter((s) => s.payment_status === "paid" && s.mode === "payment")
    .sort((a, b) => (b.created ?? 0) - (a.created ?? 0));

  const latest = paid[0];
  if (!latest) return current();

  // Already applied this session — nothing to do.
  if (p.stripe_session_id && p.stripe_session_id === latest.id) return current();

  const plan = planFromSession(latest);
  if (plan === "lifetime") {
    await sb.from("profiles").upsert({
      id: userId,
      founding_lifetime: true,
      founding_plan: "lifetime",
      founding_paid_at: now.toISOString(),
      founding_expires_at: null,
      stripe_customer_id: cid,
      stripe_session_id: latest.id,
      signup_complete: true,
    });
    return { active: true, plan: "lifetime", lifetime: true, expiresAt: null };
  }

  if (plan === "invite") {
    const existing = p.founding_expires_at as string | null | undefined;
    const base = existing && new Date(existing) > now ? new Date(existing) : now;
    const expires = new Date(base.getTime() + 60 * 24 * 60 * 60 * 1000).toISOString();
    await sb.from("profiles").upsert({
      id: userId,
      founding_plan: "invite",
      founding_paid_at: now.toISOString(),
      founding_expires_at: expires,
      stripe_customer_id: cid,
      stripe_session_id: latest.id,
      signup_complete: true,
    });
    return { active: true, plan: "invite", lifetime: !!p.founding_lifetime, expiresAt: expires };
  }

  return current();
}
