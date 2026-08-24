import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import Stripe from "stripe";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { type StripeEnv, createStripeClient, getStripeErrorMessage } from "@/lib/stripe.server";
import { createRazorpayClient } from "@/lib/razorpay.server";

export const FOUNDING_PLAN_PRICE = {
  invite: "museling_founding_invite",
  monthly: "museling_founding_monthly",
  yearly: "museling_founding_yearly",
  lifetime: "museling_founding_lifetime",
} as const;

export type FoundingPlan = keyof typeof FOUNDING_PLAN_PRICE;

type CheckoutResult = { clientSecret: string } | { error: string };
type PortalResult = { url: string } | { error: string };

async function resolveOrCreateCustomer(
  stripe: Stripe,
  options: { email?: string; userId: string },
): Promise<string> {
  if (!/^[a-zA-Z0-9_-]+$/.test(options.userId)) throw new Error("Invalid userId");

  const found = await stripe.customers.search({
    query: `metadata['userId']:'${options.userId}'`,
    limit: 1,
  });
  if (found.data.length) return found.data[0].id;

  if (options.email) {
    const existing = await stripe.customers.list({ email: options.email, limit: 1 });
    if (existing.data.length) {
      const customer = existing.data[0];
      if (customer.metadata?.userId !== options.userId) {
        await stripe.customers.update(customer.id, {
          metadata: { ...customer.metadata, userId: options.userId },
        });
      }
      return customer.id;
    }
  }

  const created = await stripe.customers.create({
    ...(options.email && { email: options.email }),
    metadata: { userId: options.userId },
  });
  return created.id;
}

export const createFoundingCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        plan: z.enum(["invite", "monthly", "yearly", "lifetime"]),
        returnUrl: z.string().url(),
        environment: z.enum(["sandbox", "live"]),
        groupId: z.string().uuid().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<CheckoutResult> => {
    try {
      const { userId, supabase } = context;
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const stripe = createStripeClient(data.environment as StripeEnv);

      const priceLookup = FOUNDING_PLAN_PRICE[data.plan];
      const prices = await stripe.prices.list({ lookup_keys: [priceLookup] });
      if (!prices.data.length) throw new Error(`Price ${priceLookup} not configured`);
      const price = prices.data[0];
      const isRecurring = price.type === "recurring";

      const customerId = await resolveOrCreateCustomer(stripe, {
        email: user?.email ?? undefined,
        userId,
      });

      const metadata: Record<string, string> = {
        userId,
        plan: data.plan,
        priceId: priceLookup,
        ...(data.groupId ? { groupId: data.groupId } : {}),
      };

      const params = {
        line_items: [{ price: price.id, quantity: 1 }],
        mode: isRecurring ? "subscription" : "payment",
        ui_mode: "embedded_page",
        return_url: data.returnUrl,
        customer: customerId,
        metadata,
        managed_payments: { enabled: true },
        ...(isRecurring
          ? { subscription_data: { metadata } }
          : {
              payment_intent_data: {
                description:
                  data.plan === "invite"
                    ? `Museling Founding Invite Pass (60 days)`
                    : `Museling Lifetime Membership`,
                metadata,
              },
            }),
      } as unknown as Stripe.Checkout.SessionCreateParams;

      const session = await stripe.checkout.sessions.create(params);

      return { clientSecret: session.client_secret ?? "" };
    } catch (error) {
      return { error: getStripeErrorMessage(error) };
    }
  });

export const createPortalSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ returnUrl: z.string().url(), environment: z.enum(["sandbox", "live"]) }).parse(d),
  )
  .handler(async ({ data, context }): Promise<PortalResult> => {
    const { supabase, userId } = context;

    const { data: sub } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", userId)
      .eq("environment", data.environment)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let customerId = (sub as any)?.stripe_customer_id as string | undefined;

    if (!customerId) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("stripe_customer_id")
        .eq("id", userId)
        .maybeSingle();
      customerId = (profile as any)?.stripe_customer_id ?? undefined;
    }

    if (!customerId) return { error: "No billing account yet." };

    try {
      const stripe = createStripeClient(data.environment as StripeEnv);
      const portal = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: data.returnUrl,
      });
      return { url: portal.url };
    } catch (error) {
      return { error: getStripeErrorMessage(error) };
    }
  });

type RazorpayCharge = {
  id: string;
  orderId: string;
  amount: number;
  currency: string;
  status: string;
  created: string | null;
};

type PaymentProvider = "stripe" | "razorpay" | null;

type BillingSummary = {
  membership: {
    plan: FoundingPlan | null;
    lifetime: boolean;
    active: boolean;
    expiresAt: string | null;
    cancelAtPeriodEnd: boolean;
    stripeSubscriptionId: string | null;

    /**
     * Provider used for the user's membership.
     *
     * stripe   -> Stripe
     * razorpay -> Razorpay
     * null     -> no payment recorded yet
     */
    paymentProvider: PaymentProvider;

    /**
     * Currency used for the membership payment.
     *
     * Examples:
     * GBP
     * INR
     */
    paymentCurrency: string | null;
  };

  invoices: Array<{
    id: string;
    amount: number;
    currency: string;
    status: string | null;
    created: string | null;
    hostedInvoiceUrl: string | null;
    pdfUrl: string | null;
  }>;

  charges: Array<{
    id: string;
    amount: number;
    currency: string;
    status: string | null;
    created: string | null;
    description: string | null;
    receiptUrl: string | null;
  }>;

  razorpayCharges: RazorpayCharge[];
};

export const getFoundingBilling = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        environment: z.enum(["sandbox", "live"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<BillingSummary | { error: string }> => {
    try {
      const { supabase, userId } = context;

      const { data: profile } = await supabase
        .from("profiles")
        .select(
          "founding_plan, founding_lifetime, founding_expires_at, founding_stripe_subscription_id, stripe_customer_id, razorpay_order_id, razorpay_payment_id, razorpay_payment_amount, razorpay_payment_currency, razorpay_payment_status, razorpay_paid_at",
        )
        .eq("id", userId)
        .maybeSingle();

      const p = profile ?? null;

      const { data: subRow } = await supabase
        .from("subscriptions")
        .select("cancel_at_period_end, current_period_end, status, stripe_customer_id")
        .eq("user_id", userId)
        .eq("environment", data.environment)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const s = subRow ?? null;

      const expiresAt: string | null = p?.founding_expires_at ?? s?.current_period_end ?? null;

      const active = !!p?.founding_lifetime || (!!expiresAt && new Date(expiresAt) > new Date());

      const customerId: string | undefined =
        s?.stripe_customer_id ?? p?.stripe_customer_id ?? undefined;

      let invoices: BillingSummary["invoices"] = [];
      let charges: BillingSummary["charges"] = [];
      let razorpayCharges: BillingSummary["razorpayCharges"] = [];

      /*
       * ---------------------------------------------------------
       * Determine payment provider + currency
       * ---------------------------------------------------------
       *
       * We deliberately derive this from the actual payment
       * records instead of the user's current country.
       *
       * This prevents historical payments from changing currency
       * if the user later changes country or travels.
       */

      let paymentProvider: PaymentProvider = null;
      let paymentCurrency: string | null = null;

      /*
       * ---------------------------------------------------------
       * Razorpay
       * ---------------------------------------------------------
       */

      if (p?.razorpay_payment_id) {
        try {
          const razorpay = createRazorpayClient();

          const payment = await razorpay.payments.fetch(p.razorpay_payment_id);

          paymentProvider = "razorpay";
          paymentCurrency = payment.currency?.toUpperCase() ?? null;

          razorpayCharges = [
            {
              id: payment.id,
              orderId: payment.order_id ?? p.razorpay_order_id ?? "",
              amount: Number(payment.amount) / 100,
              currency: payment.currency,
              status: payment.status,
              created: payment.created_at
                ? new Date(Number(payment.created_at) * 1000).toISOString()
                : null,
            },
          ];
        } catch (error) {
          console.error("Failed to fetch Razorpay payment:", error);

          /*
           * We still know this payment was a Razorpay payment
           * from the stored payment ID.
           */
          paymentProvider = "razorpay";
          paymentCurrency = p.razorpay_payment_currency?.toUpperCase() ?? null;
        }
      }

      /*
       * ---------------------------------------------------------
       * Stripe
       * ---------------------------------------------------------
       */

      if (customerId) {
        const stripe = createStripeClient(data.environment as StripeEnv);

        const [invRes, chRes] = await Promise.all([
          stripe.invoices.list({
            customer: customerId,
            limit: 20,
          }),

          stripe.charges.list({
            customer: customerId,
            limit: 20,
          }),
        ]);

        invoices = invRes.data.map((inv) => ({
          id: inv.id ?? "",
          amount: (inv.amount_paid ?? 0) / 100,
          currency: inv.currency,
          status: inv.status ?? null,
          created: inv.created ? new Date(inv.created * 1000).toISOString() : null,
          hostedInvoiceUrl: inv.hosted_invoice_url ?? null,
          pdfUrl: inv.invoice_pdf ?? null,
        }));

        charges = chRes.data.map((c) => ({
          id: c.id,
          amount: (c.amount ?? 0) / 100,
          currency: c.currency,
          status: c.status ?? null,
          created: c.created ? new Date(c.created * 1000).toISOString() : null,
          description: c.description ?? null,
          receiptUrl: c.receipt_url ?? null,
        }));

        /*
         * Only use Stripe as the membership provider when we
         * don't already have a Razorpay payment for this user.
         *
         * This avoids accidentally changing an existing Razorpay
         * membership into Stripe just because a Stripe customer
         * record happens to exist.
         */
        if (!paymentProvider) {
          paymentProvider = "stripe";

          /*
           * Prefer the latest successful charge currency.
           */
          const latestCharge = chRes.data.find(
            (charge) => charge.status === "succeeded" && !!charge.currency,
          );

          /*
           * If there isn't a charge yet, use the latest paid
           * invoice currency.
           */
          const latestInvoice = invRes.data.find(
            (invoice) => invoice.status === "paid" && !!invoice.currency,
          );

          paymentCurrency =
            latestCharge?.currency?.toUpperCase() ?? latestInvoice?.currency?.toUpperCase() ?? null;
        }
      }

      /*
       * ---------------------------------------------------------
       * Final membership response
       * ---------------------------------------------------------
       */

      return {
        membership: {
          plan: (p?.founding_plan as FoundingPlan | null) ?? null,

          lifetime: !!p?.founding_lifetime,

          active,

          expiresAt,

          cancelAtPeriodEnd: !!s?.cancel_at_period_end,

          stripeSubscriptionId: p?.founding_stripe_subscription_id ?? null,

          paymentProvider,

          paymentCurrency,
        },

        invoices,
        charges,
        razorpayCharges,
      };
    } catch (error) {
      return {
        error: getStripeErrorMessage(error),
      };
    }
  });

/**
 * Reconciles membership straight from Stripe after checkout, so the profile
 * reflects the purchase immediately instead of waiting on the webhook.
 */
export const syncFoundingMembership = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ environment: z.enum(["sandbox", "live"]) }).parse(d))
  .handler(async ({ data, context }) => {
    try {
      const { userId, supabase } = context;
      const stripe = createStripeClient(data.environment as StripeEnv);

      const { data: profile } = await supabase
        .from("profiles")
        .select("stripe_customer_id")
        .eq("id", userId)
        .maybeSingle();
      let customerId = (profile as any)?.stripe_customer_id as string | null | undefined;

      if (!customerId) {
        const found = await stripe.customers.search({
          query: `metadata['userId']:'${userId.replace(/[^a-zA-Z0-9_-]/g, "")}'`,
          limit: 1,
        });
        customerId = found.data[0]?.id ?? null;
      }

      const { syncFoundingFromStripe } = await import("@/lib/founding.server");
      return await syncFoundingFromStripe(stripe, userId, customerId ?? null);
    } catch (error) {
      return { error: getStripeErrorMessage(error) } as const;
    }
  });
