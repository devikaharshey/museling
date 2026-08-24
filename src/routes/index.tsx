import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { motion } from "motion/react";
import { Music, Users, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import logo from "@/assets/museling-logo.png";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Museling — Hear music together" },
      {
        name: "description",
        content:
          "Live music discovery in Oxford. Get matched with a small group for an upcoming concert — or go solo with a curated pick.",
      },
      { property: "og:title", content: "Museling — Hear music together" },
      {
        property: "og:description",
        content:
          "Live music discovery in Oxford. Get matched with a small group for an upcoming concert — or go solo with a curated pick.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  const navigate = useNavigate();
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/discover", replace: true });
    });
  }, [navigate]);
  return (
    <main className="min-h-screen bg-background text-foreground">
      {/* Top bar */}
      <div className="mx-auto max-w-md px-5 pt-8">
        <Link to="/" className="inline-flex items-center gap-2" aria-label="Museling home">
          <img src={logo} alt="" className="h-12 w-12 rounded-full object-cover" />
          <span
            className="text-primary leading-none tracking-tight"
            style={{
              fontFamily: '"DM Serif Display", serif',
              fontWeight: 400,
              fontSize: "2.25rem",
            }}
          >
            Museling
          </span>
        </Link>
      </div>

      {/* Hero */}
      <section className="mx-auto max-w-md px-5 pt-6 pb-16">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
        >
          <div className="inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
            <Sparkles className="h-3.5 w-3.5" /> Oxford · invite only
          </div>
          <h1 className="mt-5 font-display text-5xl leading-[1.05] tracking-tight">
            Hear live music,
            <br />
            <span
              className="text-primary"
              style={{
                fontFamily: '"DM Serif Display", serif',
                fontWeight: 400,
                fontStyle: "italic",
              }}
            >
              together.
            </span>
          </h1>
          <p className="mt-5 text-base text-muted-foreground">
            Museling pairs you with five other listeners for a real concert in your city. Tell us
            what you love, when you're free, and we'll handle the rest.
          </p>

          <Link to="/auth" className="mt-8 block">
            <Button
              size="lg"
              className="w-full rounded-full text-base h-14 shadow-lg shadow-primary/20"
            >
              Get my invitation
            </Button>
          </Link>
          <p className="mt-3 text-center text-xs text-muted-foreground">
            Takes 60 seconds · No card required to sign up
          </p>
        </motion.div>

        {/* How it works */}
        <div className="mt-14 space-y-4">
          <Step
            n={1}
            icon={<Music className="h-4 w-4" />}
            title="Sign up with your taste"
            body="Share your musical taste, age, and post code — takes a minute."
          />
          <Step
            n={2}
            icon={<Sparkles className="h-4 w-4" />}
            title="Mark concerts you're into"
            body="Browse what's on nearby and tap 'Going' on the ones that catch your ear."
          />
          <Step
            n={3}
            icon={<Users className="h-4 w-4" />}
            title="Meet others at the show"
            body="Opt in to meet people, and once 3+ listeners are going, a group chat opens (up to 8 per chat) with pre-meet and post-concert picks."
          />
        </div>

        <div className="mt-14 rounded-3xl bg-primary p-6 text-primary-foreground">
          <p className="font-display text-2xl leading-tight">
            "If I had my life to live over again, I would have made a rule to read some poetry and
            listen to some music at least once every week."
          </p>
          <p className="mt-3 text-sm opacity-80">— Charles Darwin</p>
        </div>
      </section>

      <footer className="border-t border-border/60 py-6 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} Museling · Oxford
      </footer>
    </main>
  );
}

function Step({
  n,
  icon,
  title,
  body,
}: {
  n: number;
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.5 }}
      className="flex gap-4 rounded-2xl border border-border/60 bg-card p-5"
    >
      <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-secondary text-secondary-foreground">
        {icon}
      </div>
      <div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Step {n}</span>
        </div>
        <h3 className="mt-0.5 font-display text-lg">{title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{body}</p>
      </div>
    </motion.div>
  );
}
