import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Check } from "lucide-react";
import { getStripeEnvironment } from "@/lib/stripe";
import { syncFoundingMembership } from "@/utils/payments.functions";

export const Route = createFileRoute("/_authenticated/checkout-return")({
  head: () => ({ meta: [{ title: "Payment received · Museling" }] }),
  validateSearch: (search: Record<string, unknown>) => ({
    session_id: typeof search.session_id === "string" ? search.session_id : undefined,
    redirect: typeof search.redirect === "string" ? search.redirect : "/billing",
  }),
  component: CheckoutReturn,
});

function CheckoutReturn() {
  const navigate = useNavigate();
  const { redirect } = Route.useSearch();
  const qc = useQueryClient();
  const [confirmed, setConfirmed] = useState(false);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    let cancelled = false;

    (async () => {
      // Reconcile with Stripe (webhooks can lag), retrying briefly.
      for (let attempt = 0; attempt < 5 && !cancelled; attempt++) {
        try {
          const res: any = await syncFoundingMembership({
            data: { environment: getStripeEnvironment() },
          });
          if (res?.active) break;
        } catch {
          /* keep retrying */
        }
        await new Promise((r) => setTimeout(r, 1200));
      }
      if (cancelled) return;
      await qc.invalidateQueries();
      setConfirmed(true);
      setTimeout(() => navigate({ to: redirect as any }), 900);
    })();

    return () => {
      cancelled = true;
    };
  }, [redirect, navigate, qc]);

  return (
    <main className="min-h-[100dvh] bg-background">
      <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col items-center justify-center px-5 text-center">
        {confirmed ? (
          <Check className="h-10 w-10 text-primary" />
        ) : (
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        )}
        <h1 className="mt-6 font-display text-2xl">Payment received.</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {confirmed ? "Your membership is active." : "Setting up your membership…"}
        </p>
        <Link to="/billing" className="mt-6 text-xs text-muted-foreground underline">
          Or go to billing
        </Link>
      </div>
    </main>
  );
}
