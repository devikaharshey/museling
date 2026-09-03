import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Sparkles } from "lucide-react";
import { loadStripe } from "@stripe/stripe-js";
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js";

import { Button } from "@/components/ui/button";
import {
  createRazorpayOrder,
  verifyRazorpayPayment,
  type RazorpayPlan,
} from "@/utils/razorpay.functions";
import { createFoundingCheckout, syncFoundingMembership } from "@/utils/payments.functions";
import { getStripeEnvironment } from "@/lib/stripe";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/join")({
  head: () => ({
    meta: [{ title: "Join Museling · Membership" }],
  }),

  validateSearch: (s: Record<string, unknown>): { back: string; group?: string } => ({
    back: typeof s.back === "string" ? s.back : "/discover",
    ...(typeof s.group === "string" ? { group: s.group } : {}),
  }),

  component: JoinPage,
});

type PlanCard = {
  id: RazorpayPlan;
  label: string;
  price: string;
  cadence: string;
  perks: string[];
  highlight?: boolean;
};

const PLANS: PlanCard[] = [
  {
    id: "invite",
    label: "Founding members pass",
    price: "£5",
    cadence: "one-time · 60 days access",
    perks: [
      "Unlock your first group chat",
      "Stay in the matching pool for 60 days",
      "Ideal when a group of 3+ just formed",
    ],
    highlight: true,
  },
  {
    id: "monthly",
    label: "Monthly",
    price: "£5",
    cadence: "per month",
    perks: ["Group chat access", "Ongoing matching", "Cancel any time"],
  },
  {
    id: "yearly",
    label: "Yearly",
    price: "£50",
    cadence: "per year",
    perks: ["Everything in monthly", "Two months free", "Cancel any time"],
  },
  {
    id: "lifetime",
    label: "Lifetime",
    price: "£70",
    cadence: "one-time",
    perks: ["Everything forever", "No renewals", "Founding member badge"],
  },
];

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

type RazorpayOptions = {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;

  handler: (response: {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
  }) => void;

  prefill?: {
    name?: string;
    email?: string;
    contact?: string;
  };

  theme?: {
    color?: string;
  };

  modal?: {
    ondismiss?: () => void;
  };
};

type RazorpayInstance = {
  open: () => void;
};

function loadRazorpay(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Razorpay can only load in the browser."));
  }

  if (window.Razorpay) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const scriptSrc = "https://checkout.razorpay.com/v1/checkout.js";

    const existing = document.querySelector(`script[src="${scriptSrc}"]`);

    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () =>
        reject(new Error("Unable to load Razorpay checkout.")),
      );
      return;
    }

    const script = document.createElement("script");

    script.src = scriptSrc;
    script.async = true;

    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Unable to load Razorpay checkout."));

    document.body.appendChild(script);
  });
}

function JoinPage() {
  const navigate = useNavigate();
  const { back, group } = Route.useSearch();

  const [selected, setSelected] = useState<RazorpayPlan>("invite");

  const [checkingOut, setCheckingOut] = useState(false);

  const [paymentError, setPaymentError] = useState<string | null>(null);

  const [countryCode, setCountryCode] = useState<string | null>(null);

  const [whatsapp, setWhatsapp] = useState<string | null>(null);

  const [email, setEmail] = useState<string | null>(null);

  const [loadingCountry, setLoadingCountry] = useState(true);

  const [stripeClientSecret, setStripeClientSecret] = useState<string | null>(null);

  const [stripeSyncing, setStripeSyncing] = useState(false);

  const isIndia = countryCode === "IN";

  /*
   * ---------------------------------------------------------
   * Stripe client
   * ---------------------------------------------------------
   *
   * This uses the same VITE_PAYMENTS_CLIENT_TOKEN that your
   * existing src/lib/stripe.ts uses.
   */
  const stripePromise = useMemo(() => {
    const clientToken = import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN as string | undefined;

    if (!clientToken) {
      return null;
    }

    return loadStripe(clientToken);
  }, []);

  /*
   * ---------------------------------------------------------
   * Load user's country, WhatsApp number and email
   * ---------------------------------------------------------
   *
   * country_code and whatsapp are stored in profiles.
   *
   * Email comes from the authenticated Supabase user account.
   */
  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          throw new Error("Unable to determine the signed-in user.");
        }

        const { data, error } = await supabase
          .from("profiles")
          .select("country_code, whatsapp")
          .eq("id", user.id)
          .maybeSingle();

        if (error) {
          throw error;
        }

        if (!cancelled) {
          setCountryCode(data?.country_code ?? null);
          setWhatsapp(data?.whatsapp ?? null);
          setEmail(user.email ?? null);
        }
      } catch (error) {
        console.error("Failed to load payment profile:", error);

        if (!cancelled) {
          setPaymentError("Unable to determine your payment details. Please try again.");
        }
      } finally {
        if (!cancelled) {
          setLoadingCountry(false);
        }
      }
    }

    loadProfile();

    return () => {
      cancelled = true;
    };
  }, []);

  /*
   * ---------------------------------------------------------
   * Preload Razorpay for Indian users
   * ---------------------------------------------------------
   */
  useEffect(() => {
    if (loadingCountry || !isIndia) {
      return;
    }

    loadRazorpay().catch((error) => {
      console.error("Razorpay loading failed:", error);
    });
  }, [loadingCountry, isIndia]);

  /*
   * ---------------------------------------------------------
   * Razorpay payment
   * ---------------------------------------------------------
   */
  async function handleRazorpayPayment() {
    if (!selected || checkingOut) {
      return;
    }

    setPaymentError(null);
    setCheckingOut(true);

    try {
      await loadRazorpay();

      if (!window.Razorpay) {
        throw new Error("Razorpay checkout is unavailable.");
      }

      /*
       * Create the order on the server.
       *
       * The server determines the amount.
       */
      const orderResult = await createRazorpayOrder({
        data: {
          plan: selected,
          ...(group ? { groupId: group } : {}),
        },
      });

      if (!orderResult.success) {
        throw new Error(orderResult.error);
      }

      const selectedPlan = PLANS.find((p) => p.id === selected);

      if (!selectedPlan) {
        throw new Error("Selected plan could not be found.");
      }

      const razorpay = new window.Razorpay({
        key: orderResult.keyId,
        amount: orderResult.amount,
        currency: orderResult.currency,
        name: "Museling",
        description: selectedPlan.label,
        order_id: orderResult.orderId,

        prefill: {
          contact: whatsapp ?? undefined,
          email: email ?? undefined,
        },

        handler: async (response) => {
          try {
            /*
             * Never grant membership from the frontend.
             *
             * The server verifies the Razorpay signature,
             * payment, order, amount and user.
             */
            const verification = await verifyRazorpayPayment({
              data: {
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
                plan: selected,
              },
            });

            if (!verification.success) {
              throw new Error(verification.error);
            }

            navigate({
              to: back,
            });
          } catch (error) {
            console.error("Razorpay payment verification failed:", error);

            setPaymentError(
              error instanceof Error ? error.message : "Payment verification failed.",
            );

            setCheckingOut(false);
          }
        },

        theme: {
          color: "#2B5B4B",
        },

        modal: {
          ondismiss: () => {
            setCheckingOut(false);
          },
        },
      });

      razorpay.open();
    } catch (error) {
      console.error("Razorpay checkout failed:", error);

      setPaymentError(error instanceof Error ? error.message : "Unable to start Razorpay payment.");

      setCheckingOut(false);
    }
  }

  /*
   * ---------------------------------------------------------
   * Stripe payment
   * ---------------------------------------------------------
   */
  async function handleStripePayment() {
    if (!selected || checkingOut) {
      return;
    }

    setPaymentError(null);
    setCheckingOut(true);

    try {
      const environment = getStripeEnvironment();

      /*
       * Create the Stripe Checkout Session on the server.
       */
      const result = await createFoundingCheckout({
        data: {
          plan: selected,
          environment,
          returnUrl: `${window.location.origin}${back}`,
          ...(group ? { groupId: group } : {}),
        },
      });

      if ("error" in result) {
        throw new Error(result.error);
      }

      if (!result.clientSecret) {
        throw new Error("Stripe did not return a checkout client secret.");
      }

      if (!stripePromise) {
        throw new Error("Stripe is not configured for this build.");
      }

      /*
       * The EmbeddedCheckout component will now mount
       * using this client secret.
       */
      setStripeClientSecret(result.clientSecret);
    } catch (error) {
      console.error("Stripe checkout failed:", error);

      setPaymentError(error instanceof Error ? error.message : "Unable to start Stripe payment.");

      setCheckingOut(false);
    }
  }

  /*
   * ---------------------------------------------------------
   * Stripe checkout completion
   * ---------------------------------------------------------
   *
   * Stripe has completed payment.
   *
   * We then reconcile the purchase against Stripe on the
   * server and update the user's Supabase membership.
   */
  async function handleStripeComplete() {
    if (stripeSyncing) {
      return;
    }

    setStripeSyncing(true);
    setPaymentError(null);

    try {
      const environment = getStripeEnvironment();

      const result = await syncFoundingMembership({
        data: {
          environment,
        },
      });

      if (result && typeof result === "object" && "error" in result && result.error) {
        throw new Error(result.error);
      }

      navigate({
        to: back,
      });
    } catch (error) {
      console.error("Stripe membership sync failed:", error);

      setPaymentError(
        error instanceof Error
          ? error.message
          : "Payment succeeded, but we could not update your membership yet.",
      );

      setStripeSyncing(false);
      setCheckingOut(false);
    }
  }

  /*
   * ---------------------------------------------------------
   * Payment provider dispatcher
   * ---------------------------------------------------------
   */
  async function handlePayment() {
    if (!selected || checkingOut || loadingCountry) {
      return;
    }

    if (!countryCode) {
      setPaymentError("Please complete your profile and select your country before paying.");
      return;
    }

    if (isIndia) {
      await handleRazorpayPayment();
    } else {
      await handleStripePayment();
    }
  }

  /*
   * ---------------------------------------------------------
   * Stripe Embedded Checkout screen
   * ---------------------------------------------------------
   */
  if (stripeClientSecret) {
    if (!stripePromise) {
      return (
        <main className="min-h-dvh bg-background">
          <div className="mx-auto max-w-md px-5 py-6">
            <button
              onClick={() => {
                setStripeClientSecret(null);
                setCheckingOut(false);
              }}
              className="flex items-center gap-2 text-sm text-muted-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>

            <div className="mt-6 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              Stripe is not configured for this build.
            </div>
          </div>
        </main>
      );
    }

    return (
      <main className="min-h-dvh bg-background">
        <div className="mx-auto max-w-md px-5 py-6">
          <button
            onClick={() => {
              setStripeClientSecret(null);
              setCheckingOut(false);
              setStripeSyncing(false);
              setPaymentError(null);
            }}
            className="flex items-center gap-2 text-sm text-muted-foreground"
            disabled={stripeSyncing}
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>

          <div className="mt-6">
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
              <Sparkles className="h-3 w-3" />
              Museling Membership
            </span>

            <h1 className="mt-3 font-display text-3xl leading-tight">Complete your payment.</h1>

            <p className="mt-2 text-sm text-muted-foreground">Secure checkout powered by Stripe.</p>
          </div>

          {paymentError && (
            <div className="mt-4 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              {paymentError}
            </div>
          )}

          <div className="mt-6">
            <EmbeddedCheckoutProvider
              stripe={stripePromise}
              options={{
                clientSecret: stripeClientSecret,
                onComplete: handleStripeComplete,
              }}
            >
              <EmbeddedCheckout />
            </EmbeddedCheckoutProvider>
          </div>

          {stripeSyncing && (
            <p className="mt-4 text-center text-xs text-muted-foreground">
              Confirming your membership…
            </p>
          )}
        </div>
      </main>
    );
  }

  /*
   * ---------------------------------------------------------
   * Main join page
   * ---------------------------------------------------------
   */
  return (
    <main className="min-h-dvh bg-background pb-24">
      <div className="mx-auto max-w-md px-5 pt-6">
        <button
          onClick={() => navigate({ to: back })}
          className="flex items-center gap-2 text-sm text-muted-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>

        <div className="mt-6">
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
            <Sparkles className="h-3 w-3" />
            Museling Membership
          </span>

          <h1 className="mt-3 font-display text-3xl leading-tight">Join the room.</h1>

          <p className="mt-2 text-sm text-muted-foreground">
            Members unlock every matched group chat and stay in the matching pool for future
            concerts. Pick what suits you.
          </p>
        </div>

        {!loadingCountry && countryCode && (
          <div className="mt-4 rounded-2xl bg-secondary/60 px-4 py-3 text-xs text-muted-foreground">
            {isIndia
              ? "Payments for your region are processed securely by Razorpay."
              : "Payments for your region are processed securely by Stripe."}
          </div>
        )}

        <div className="mt-6 space-y-3">
          {PLANS.map((p) => {
            const on = selected === p.id;

            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelected(p.id)}
                className={
                  "relative w-full rounded-3xl border-2 p-5 text-left transition-all " +
                  (on
                    ? "border-primary bg-primary/5"
                    : "border-border bg-card hover:border-primary/40")
                }
              >
                {p.highlight && (
                  <span className="absolute -top-2 right-4 rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-medium text-primary-foreground">
                    Best value
                  </span>
                )}

                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-display text-xl">{p.label}</span>

                  <span className="font-display text-2xl">{p.price}</span>
                </div>

                <p className="mt-0.5 text-xs text-muted-foreground">{p.cadence}</p>

                <ul className="mt-3 space-y-1.5">
                  {p.perks.map((perk) => (
                    <li key={perk} className="flex items-start gap-2 text-xs">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                      <span>{perk}</span>
                    </li>
                  ))}
                </ul>
              </button>
            );
          })}
        </div>

        {paymentError && (
          <div className="mt-4 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {paymentError}
          </div>
        )}

        <Button
          size="lg"
          className="mt-6 h-14 w-full rounded-full text-base"
          disabled={!selected || checkingOut || loadingCountry}
          onClick={handlePayment}
        >
          {loadingCountry
            ? "Checking payment region…"
            : checkingOut
              ? isIndia
                ? "Opening Razorpay…"
                : "Opening Stripe…"
              : "Continue to payment"}
        </Button>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Secure checkout by {isIndia ? "Razorpay" : "Stripe"}.{" "}
          <Link to="/billing" className="underline">
            Manage billing
          </Link>
        </p>
      </div>
    </main>
  );
}
