import { MuselingLogo } from "@/components/MuselingLogo";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({ meta: [{ title: "Reset password · Museling" }] }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setSent(true);
      toast.success("Reset link sent — check your inbox.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send reset link");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen max-w-md flex-col px-5 pt-10 pb-8">
        <MuselingLogo />
        <div className="mt-12">
          <h1 className="font-display text-4xl leading-tight">Reset password</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Enter your email and we&apos;ll send you a link to set a new one.
          </p>
        </div>
        {sent ? (
          <div className="mt-8 rounded-2xl border border-border bg-card p-6 text-center">
            <p className="text-sm text-muted-foreground">
              If an account exists for <strong>{email}</strong>, you&apos;ll receive a reset link
              shortly.
            </p>
            <Link
              to="/signin"
              className="mt-4 inline-block text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-8 space-y-3">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-12 mt-1.5"
                placeholder="you@example.com"
              />
            </div>
            <Button type="submit" className="h-12 w-full rounded-full" disabled={loading}>
              {loading ? "Sending..." : "Send reset link"}
            </Button>
            <div className="text-center">
              <Link
                to="/signin"
                className="text-sm text-muted-foreground underline-offset-4 hover:underline"
              >
                Back to sign in
              </Link>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
