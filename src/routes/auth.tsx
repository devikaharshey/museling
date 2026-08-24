import { MuselingLogo } from "@/components/MuselingLogo";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { setRemember } from "@/lib/remember-me";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign in · Museling" }] }),
  component: AuthPage,
});

export function AuthPage({ initialMode = "signup" }: { initialMode?: "signup" | "signin" }) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signup" | "signin">(initialMode);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [remember, setRememberState] = useState(true);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    if (initialMode === "signin") return;

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/discover" });
    });
  }, [initialMode, navigate]);

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      setRemember(remember);
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        toast.success("Welcome to Museling!");
        navigate({ to: "/signup" });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/discover" });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setRemember(remember);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin + "/signup",
    });
    if (result.error) {
      toast.error("Couldn't sign in with Google");
      return;
    }
    if (!result.redirected) navigate({ to: "/signup" });
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen max-w-md flex-col px-5 pt-10 pb-8">
        <MuselingLogo />

        <div className="mt-10 grid grid-cols-2 gap-1 rounded-full bg-muted p-1">
          {(["signup", "signin"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`h-10 rounded-full text-sm transition-colors ${
                mode === m
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {m === "signup" ? "Create account" : "Sign in"}
            </button>
          ))}
        </div>

        <div className="mt-8">
          <h1 className="font-display text-4xl leading-tight">
            {mode === "signup" ? "Start your Museling" : "Welcome back"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {mode === "signup"
              ? "Create an account to get matched with your first group."
              : "Sign in to see your invitations."}
          </p>
        </div>

        <div className="mt-8 space-y-3">
          <Button
            type="button"
            variant="outline"
            className="h-12 w-full rounded-full"
            onClick={handleGoogle}
          >
            <GoogleIcon /> Continue with Google
          </Button>

          <div className="flex items-center gap-3 py-2">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">or</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={handleEmail} className="space-y-3">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-12 mt-1.5"
                placeholder="you@oxford.example"
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
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
            {mode === "signin" && (
              <div className="flex justify-end">
                <Link
                  to="/forgot-password"
                  className="text-sm text-muted-foreground underline-offset-4 hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
            )}
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <Checkbox checked={remember} onCheckedChange={(v) => setRememberState(v === true)} />
              Remember me on this device
            </label>
            <Button type="submit" className="h-12 w-full rounded-full" disabled={loading}>
              {loading ? "..." : mode === "signup" ? "Create account" : "Sign in"}
            </Button>
          </form>
        </div>

        <button
          type="button"
          onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
          className="mt-6 text-center text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          {mode === "signup" ? "Already have an account? Sign in" : "New here? Create an account"}
        </button>
      </div>
    </main>
  );
}

function GoogleIcon() {
  return (
    <svg className="h-4 w-4 mr-2" viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.83z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
      />
    </svg>
  );
}
