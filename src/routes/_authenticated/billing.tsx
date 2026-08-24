import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink, ReceiptText, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toast } from "sonner";

import { getFoundingBilling, createPortalSession } from "@/utils/payments.functions";

import { getStripeEnvironment } from "@/lib/stripe";

export const Route = createFileRoute("/_authenticated/billing")({
  head: () => ({
    meta: [{ title: "Billing · Museling" }],
  }),

  component: BillingPage,
});

type PaymentProvider = "stripe" | "razorpay" | null;

function currencySymbol(currency: string | null): string {
  switch (currency?.toUpperCase()) {
    case "GBP":
      return "£";

    case "INR":
      return "₹";

    case "EUR":
      return "€";

    case "USD":
      return "$";

    default:
      return currency?.toUpperCase() ?? "";
  }
}

function planPrice(plan: string | null, currency: string | null): string {
  const symbol = currencySymbol(currency);

  if (plan === "invite") {
    return `${symbol}5 for 60 days`;
  }

  if (plan === "monthly") {
    return `${symbol}5/mo`;
  }

  if (plan === "yearly") {
    return `${symbol}50/yr`;
  }

  if (plan === "lifetime") {
    return `${symbol}70`;
  }

  return "";
}

function planLabel(plan: string | null, lifetime: boolean, currency: string | null): string {
  if (lifetime) {
    return "Lifetime membership";
  }

  if (plan === "invite") {
    return `Invite pass · ${planPrice(plan, currency)}`;
  }

  if (plan === "monthly") {
    return `Monthly membership · ${planPrice(plan, currency)}`;
  }

  if (plan === "yearly") {
    return `Yearly membership · ${planPrice(plan, currency)}`;
  }

  return "No active membership";
}

function providerLabel(provider: PaymentProvider): string {
  if (provider === "razorpay") {
    return "Razorpay";
  }

  if (provider === "stripe") {
    return "Stripe";
  }

  return "";
}

function fmtCurrency(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency.toUpperCase()}`;
  }
}

function BillingPage() {
  const env = getStripeEnvironment();

  const q = useQuery({
    queryKey: ["founding_billing", env],

    queryFn: () =>
      getFoundingBilling({
        data: {
          environment: env,
        },
      }),
  });

  const portal = useMutation({
    mutationFn: async () => {
      const res = await createPortalSession({
        data: {
          environment: env,
          returnUrl: `${window.location.origin}/billing`,
        },
      });

      if ("error" in res) {
        throw new Error(res.error);
      }

      return res.url;
    },

    onSuccess: (url) => {
      window.open(url, "_blank");
    },

    onError: (error: Error) => {
      toast.error(error.message ?? "Couldn't open billing portal");
    },
  });

  const data = q.data && !("error" in q.data) ? q.data : null;

  const membership = data?.membership;

  const invoices = data?.invoices ?? [];
  const charges = data?.charges ?? [];
  const razorpayCharges = data?.razorpayCharges ?? [];

  const paymentProvider = membership?.paymentProvider ?? null;

  const paymentCurrency = membership?.paymentCurrency ?? null;

  const isStripe = paymentProvider === "stripe";

  const isRazorpay = paymentProvider === "razorpay";

  return (
    <main className="min-h-dvh bg-background">
      <header className="border-b border-border bg-card/90 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center gap-2 px-4 py-3">
          <Button asChild variant="ghost" size="sm" className="rounded-full">
            <Link to="/profile">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>

          <h1 className="font-display text-lg">Billing</h1>
        </div>
      </header>

      <div className="mx-auto max-w-md px-5 py-6">
        {q.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

        {q.data && "error" in q.data && <p className="text-sm text-destructive">{q.data.error}</p>}

        {membership && (
          <section className="rounded-3xl bg-card p-5 shadow-sm">
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
              <Sparkles className="h-3 w-3" />
              Membership
            </span>

            <h2 className="mt-3 font-display text-2xl leading-tight">
              {planLabel(membership.plan, membership.lifetime, paymentCurrency)}
            </h2>

            {!membership.lifetime && membership.expiresAt && (
              <p className="mt-1 text-sm text-muted-foreground">
                {membership.plan === "invite"
                  ? "Expires"
                  : membership.cancelAtPeriodEnd
                    ? "Ends"
                    : "Renews"}{" "}
                on {new Date(membership.expiresAt).toLocaleDateString()}
              </p>
            )}

            {membership.lifetime && (
              <p className="mt-1 text-sm text-muted-foreground">Never expires · no renewals</p>
            )}

            {!membership.active && (
              <p className="mt-1 text-sm text-muted-foreground">
                You don't have active access yet.
              </p>
            )}

            {paymentProvider && (
              <div className="mt-4 rounded-2xl bg-secondary/60 px-4 py-3">
                <p className="text-xs text-muted-foreground">Payment provider</p>

                <p className="mt-0.5 text-sm font-medium">
                  {providerLabel(paymentProvider)}
                  {paymentCurrency ? ` · ${paymentCurrency.toUpperCase()}` : ""}
                </p>
              </div>
            )}

            <div className="mt-5 flex flex-wrap gap-2">
              {/*
               * Stripe subscriptions can be managed through
               * Stripe's billing portal.
               *
               * Razorpay payments currently use one-time
               * payment orders, so we deliberately don't show
               * a Stripe management button for them.
               */}
              {isStripe && !membership.lifetime && (
                <Button
                  className="rounded-full"
                  disabled={portal.isPending}
                  onClick={() => portal.mutate()}
                >
                  {portal.isPending ? "Opening…" : "Manage in Stripe"}

                  <ExternalLink className="ml-1 h-3.5 w-3.5" />
                </Button>
              )}

              {isRazorpay && !membership.lifetime && (
                <div className="rounded-full bg-secondary px-4 py-2 text-xs text-muted-foreground">
                  Payments managed through Razorpay
                </div>
              )}

              {!membership.active && (
                <Button asChild variant="secondary" className="rounded-full">
                  <Link to="/join" search={{ back: "/billing" }}>
                    Join now
                  </Link>
                </Button>
              )}

              {membership.active && !membership.lifetime && (
                <Button asChild variant="ghost" className="rounded-full">
                  <Link to="/join" search={{ back: "/billing" }}>
                    Change plan
                  </Link>
                </Button>
              )}
            </div>
          </section>
        )}

        <section className="mt-8">
          <h2 className="font-display text-lg">Charge history</h2>

          {invoices.length === 0 && charges.length === 0 && razorpayCharges.length === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">Nothing yet.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {invoices.map((inv) => (
                <li
                  key={inv.id}
                  className="flex items-center justify-between gap-3 rounded-2xl bg-card p-4"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{fmtCurrency(inv.amount, inv.currency)}</p>

                    <p className="text-[11px] text-muted-foreground">
                      {inv.created ? new Date(inv.created).toLocaleDateString() : ""} · {inv.status}
                    </p>
                  </div>

                  {inv.hostedInvoiceUrl && (
                    <a
                      href={inv.hostedInvoiceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary underline"
                    >
                      <ReceiptText className="h-3.5 w-3.5" />
                      Invoice
                    </a>
                  )}
                </li>
              ))}

              {charges.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between gap-3 rounded-2xl bg-card p-4"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{fmtCurrency(c.amount, c.currency)}</p>

                    <p className="text-[11px] text-muted-foreground">
                      {c.created ? new Date(c.created).toLocaleDateString() : ""} · {c.status}
                    </p>

                    {c.description && (
                      <p className="text-[11px] text-muted-foreground">{c.description}</p>
                    )}
                  </div>

                  {c.receiptUrl && (
                    <a
                      href={c.receiptUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary underline"
                    >
                      <ReceiptText className="h-3.5 w-3.5" />
                      Receipt
                    </a>
                  )}
                </li>
              ))}

              {razorpayCharges.map((payment) => (
                <li
                  key={payment.id}
                  className="flex items-center justify-between gap-3 rounded-2xl bg-card p-4"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {fmtCurrency(payment.amount, payment.currency)}
                    </p>

                    <p className="text-[11px] text-muted-foreground">
                      {payment.created ? new Date(payment.created).toLocaleDateString() : ""} ·{" "}
                      {payment.status}
                    </p>

                    <p className="text-[11px] text-muted-foreground">
                      Razorpay · Order {payment.orderId}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
