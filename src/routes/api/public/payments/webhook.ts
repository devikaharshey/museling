import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { type StripeEnv, verifyWebhook } from "@/lib/stripe.server";

let _supabase: ReturnType<typeof createClient> | null = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  }
  return _supabase;
}

function tsToIso(t?: number | null): string | null {
  return t ? new Date(t * 1000).toISOString() : null;
}

const PLAN_BY_LOOKUP: Record<string, "monthly" | "yearly" | "lifetime"> = {
  museling_founding_monthly: "monthly",
  museling_founding_yearly: "yearly",
  museling_founding_lifetime: "lifetime",
};

async function promotePendingGroupIfReady(groupId: string) {
  const sb: any = getSupabase();
  const { data: chat } = await sb
    .from("concert_group_chats")
    .select("id, status")
    .eq("id", groupId)
    .maybeSingle();
  if (!chat || chat.status !== "pending_payment") return;

  const { data: mems } = await sb
    .from("concert_group_chat_members")
    .select("user_id")
    .eq("group_chat_id", groupId)
    .is("left_at", null);
  const ids = ((mems ?? []) as any[]).map((m) => m.user_id);
  if (!ids.length) return;

  const nowIso = new Date().toISOString();
  const { data: paid } = await sb
    .from("profiles")
    .select("id, founding_lifetime, founding_expires_at")
    .in("id", ids);
  const activeCount = ((paid ?? []) as any[]).filter(
    (p) => p.founding_lifetime || (p.founding_expires_at && p.founding_expires_at > nowIso),
  ).length;

  if (activeCount >= 2) {
    await sb.from("concert_group_chats").update({ status: "active" }).eq("id", groupId);
    await sb.from("group_chat_messages").insert({
      group_chat_id: groupId,
      sender_id: null,
      is_system: true,
      body: `The chat is now open. Say hello!`,
    });
  }
}

async function handleCheckoutCompleted(obj: any) {
  const userId = obj?.metadata?.userId;
  const plan = obj?.metadata?.plan as "invite" | "monthly" | "yearly" | "lifetime" | undefined;
  const priceId = obj?.metadata?.priceId as string | undefined;
  const groupId = obj?.metadata?.groupId as string | undefined;
  const customerId = typeof obj?.customer === "string" ? obj.customer : obj?.customer?.id;
  const sessionId = obj?.id;

  if (!userId) {
    console.error("checkout.session.completed missing userId metadata", { sessionId });
    return;
  }
  const sb: any = getSupabase();

  // Lifetime purchase — one-time payment, never expires.
  if (plan === "lifetime" || priceId === "museling_founding_lifetime") {
    const update: Record<string, unknown> = {
      id: userId,
      founding_lifetime: true,
      founding_plan: "lifetime",
      founding_paid_at: new Date().toISOString(),
      founding_expires_at: null,
      signup_complete: true,
    };
    if (customerId) update.stripe_customer_id = customerId;
    if (sessionId) update.stripe_session_id = sessionId;
    await sb.from("profiles").upsert(update);
    if (groupId) await promotePendingGroupIfReady(groupId);
    return;
  }

  // Subscription checkouts: the customer.subscription.* events do the real work.
  // But `checkout.session.completed` fires first and lets us stamp the customer
  // id + promote the group. The subscription event will fill founding_expires_at.
  if (obj?.mode === "subscription") {
    const update: Record<string, unknown> = { id: userId, signup_complete: true };
    if (customerId) update.stripe_customer_id = customerId;
    await sb.from("profiles").upsert(update);
    return;
  }

  // Invite pass — one-time £5, grants 60 days.
  if (
    plan === "invite" ||
    priceId === "museling_founding_invite" ||
    priceId === "museling_founding_5"
  ) {
    const now = new Date();
    // Extend from existing expiry if still in the future, else from now.
    const { data: prof } = await sb
      .from("profiles")
      .select("founding_expires_at, founding_lifetime")
      .eq("id", userId)
      .maybeSingle();
    const existing = (prof as any)?.founding_expires_at as string | null | undefined;
    const base = existing && new Date(existing) > now ? new Date(existing) : now;
    const expires = new Date(base.getTime() + 60 * 24 * 60 * 60 * 1000);
    const update: Record<string, unknown> = {
      id: userId,
      founding_plan: "invite",
      founding_paid_at: now.toISOString(),
      founding_expires_at: expires.toISOString(),
      signup_complete: true,
    };
    if (customerId) update.stripe_customer_id = customerId;
    if (sessionId) update.stripe_session_id = sessionId;
    await sb.from("profiles").upsert(update);
    if (groupId) await promotePendingGroupIfReady(groupId);
  }
}

async function upsertSubscription(subscription: any, env: StripeEnv) {
  const userId = subscription?.metadata?.userId;
  if (!userId) {
    console.error("subscription event missing userId metadata", { id: subscription?.id });
    return;
  }
  const item = subscription.items?.data?.[0];
  const priceLookup =
    item?.price?.lookup_key || item?.price?.metadata?.lovable_external_id || item?.price?.id;
  const productId =
    typeof item?.price?.product === "string" ? item.price.product : item?.price?.product?.id;
  const periodStart = item?.current_period_start ?? subscription.current_period_start;
  const periodEnd = item?.current_period_end ?? subscription.current_period_end;
  const status = subscription.status as string;

  const sb: any = getSupabase();
  await sb.from("subscriptions").upsert(
    {
      user_id: userId,
      stripe_subscription_id: subscription.id,
      stripe_customer_id: subscription.customer,
      product_id: productId ?? "",
      price_id: priceLookup ?? "",
      status,
      current_period_start: tsToIso(periodStart),
      current_period_end: tsToIso(periodEnd),
      cancel_at_period_end: subscription.cancel_at_period_end || false,
      environment: env,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "stripe_subscription_id" },
  );

  // Mirror to profile.founding_*
  const plan = PLAN_BY_LOOKUP[priceLookup ?? ""];
  if (plan && (status === "active" || status === "trialing" || status === "past_due")) {
    const expiresAt = tsToIso(periodEnd);
    await sb.from("profiles").upsert({
      id: userId,
      founding_plan: plan,
      founding_stripe_subscription_id: subscription.id,
      founding_paid_at: new Date().toISOString(),
      founding_expires_at: expiresAt,
      stripe_customer_id: subscription.customer,
      signup_complete: true,
    });

    // If a group is waiting on this user's payment, promote it.
    const groupId = subscription?.metadata?.groupId;
    if (groupId) await promotePendingGroupIfReady(groupId);
  }
}

async function markSubscriptionCanceled(subscription: any, env: StripeEnv) {
  const sb: any = getSupabase();
  await sb
    .from("subscriptions")
    .update({ status: "canceled", updated_at: new Date().toISOString() })
    .eq("stripe_subscription_id", subscription.id)
    .eq("environment", env);

  // Clear the mirrored plan pointer but leave founding_expires_at so users
  // keep access until the period they already paid for lapses.
  await sb
    .from("profiles")
    .update({ founding_plan: null, founding_stripe_subscription_id: null })
    .eq("founding_stripe_subscription_id", subscription.id);
}

async function handleInvoicePaymentFailed(invoice: any) {
  const customerId =
    typeof invoice?.customer === "string" ? invoice.customer : invoice?.customer?.id;
  if (!customerId) return;
  const sb: any = getSupabase();
  const { data: profile } = await sb
    .from("profiles")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  const uid = (profile as any)?.id;
  if (!uid) return;
  await sb.from("notifications").insert({
    user_id: uid,
    kind: "payment_failed",
    title: "Your Museling payment failed",
    body: "Stripe is retrying. Update your card in Manage billing to avoid losing access.",
    link: "/billing",
    payload: { invoice_id: invoice.id },
  });
}

async function handleWebhook(req: Request, env: StripeEnv) {
  const event = await verifyWebhook(req, env);
  switch (event.type) {
    case "checkout.session.completed":
    case "transaction.completed":
      await handleCheckoutCompleted(event.data.object);
      break;
    case "customer.subscription.created":
    case "customer.subscription.updated":
      await upsertSubscription(event.data.object, env);
      break;
    case "customer.subscription.deleted":
      await markSubscriptionCanceled(event.data.object, env);
      break;
    case "invoice.payment_failed":
      await handleInvoicePaymentFailed(event.data.object);
      break;
    default:
      console.log("Unhandled event:", event.type);
  }
}

export const Route = createFileRoute("/api/public/payments/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawEnv = new URL(request.url).searchParams.get("env");
        if (rawEnv !== "sandbox" && rawEnv !== "live") {
          return Response.json({ received: true, ignored: "invalid env" });
        }
        try {
          await handleWebhook(request, rawEnv);
          return Response.json({ received: true });
        } catch (e) {
          console.error("Webhook error:", e);
          return new Response("Webhook error", { status: 400 });
        }
      },
    },
  },
});
