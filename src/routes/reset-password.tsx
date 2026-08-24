import { MuselingLogo } from "@/components/MuselingLogo";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "New password · Museling" }] }),
  component: ResetPasswordPage,
});

function parseHash(hash: string) {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const record: Record<string, string> = {};
  for (const [k, v] of params) record[k] = v;
  return record;
}

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [ready, setReady] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const hash = window.location.hash;
    const params = parseHash(hash);
    if (params.type !== "recovery") {
      setInvalid(true);
      return;
    }
    if (params.access_token && params.refresh_token) {
      supabase.auth
        .setSession({ access_token: params.access_token, refresh_token: params.refresh_token })
        .then(({ error }) => {
          if (error) {
            console.error(error);
            setInvalid(true);
          } else {
            setReady(true);
          }
        });
    } else {
      setInvalid(true);
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      toast.error("Passwords do not match");
      return;
    }
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Password updated — sign in with your new password.");
      navigate({ to: "/signin" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update password");
    } finally {
      setLoading(false);
    }
  }

  if (invalid) {
    return (
      <main className="min-h-screen bg-background">
        <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-5 text-center">
          <h1 className="font-display text-4xl leading-tight">Link expired</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This reset link is invalid or has already been used.
          </p>
          <Link
            to="/forgot-password"
            className="mt-6 inline-block rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Request a new link
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen max-w-md flex-col px-5 pt-10 pb-8">
        <MuselingLogo />
        <div className="mt-12">
          <h1 className="font-display text-4xl leading-tight">New password</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Choose a strong password for your account.
          </p>
        </div>
        {!ready ? (
          <div className="mt-8 text-center text-sm text-muted-foreground">Loading...</div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-8 space-y-3">
            <div>
              <Label htmlFor="password">New password</Label>
              <Input
                id="password"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-12 mt-1.5"
                placeholder="At least 8 characters"
              />
            </div>
            <div>
              <Label htmlFor="confirm">Confirm password</Label>
              <Input
                id="confirm"
                type="password"
                required
                minLength={8}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="h-12 mt-1.5"
                placeholder="Re-enter your password"
              />
            </div>
            <Button type="submit" className="h-12 w-full rounded-full" disabled={loading}>
              {loading ? "Saving..." : "Update password"}
            </Button>
          </form>
        )}
      </div>
    </main>
  );
}
