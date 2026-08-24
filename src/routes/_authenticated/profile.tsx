import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { getStripeEnvironment } from "@/lib/stripe";
import { syncFoundingMembership } from "@/utils/payments.functions";
import { MuselingLogo } from "@/components/MuselingLogo";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import {
  Award,
  Lock,
  LogOut,
  Shield,
  Settings,
  CalendarDays,
  MapPin,
  Sparkles,
  Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { computeBadges, type ConcertForBadges, type LogForBadges } from "@/lib/badges";
import { checkIsAdmin } from "@/utils/admin.functions";
import { TabBar, TabBarSpacer } from "@/components/TabBar";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({ meta: [{ title: "Profile · Museling" }] }),
  component: Profile,
});

function companionLabel(mode: string | null | undefined, count: number | null | undefined): string {
  if (mode === "solo_happy") return "Going solo — happy by myself";
  if (mode === "meet_others") return "Open to meeting others";
  if (mode === "group_open")
    return `Coming with ${count ?? 1} other${(count ?? 1) === 1 ? "" : "s"}, still open to matching`;
  return "Going";
}

function Profile() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const cancelIntent = useMutation({
    mutationFn: async (intentId: string) => {
      const { error } = await supabase
        .from("concert_intents")
        .delete()
        .eq("id", intentId)
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Removed from your plans");
      qc.invalidateQueries({ queryKey: ["my_intents", user.id] });
      qc.invalidateQueries({ queryKey: ["nearby_concerts"] });
      qc.invalidateQueries({ queryKey: ["concert_intents"] });
      qc.invalidateQueries({ queryKey: ["admin_attendance"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to update"),
  });

  const { data: profile } = useQuery({
    queryKey: ["profile", user.id],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
      return data;
    },
  });

  const { data: concerts } = useQuery({
    queryKey: ["my_concerts", user.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_concerts")
        .select("id, source, concert_name, venue, concert_at, genres, artists, programme")
        .eq("user_id", user.id)
        .order("concert_at", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: logs } = useQuery({
    queryKey: ["my_concert_logs_full", user.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("concert_logs")
        .select("id, user_concert_id, rating, notes, favourite_moment")
        .eq("user_id", user.id);
      return data ?? [];
    },
  });

  const { data: intents } = useQuery({
    queryKey: ["my_intents", user.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("concert_intents")
        .select(
          "id, concert_slug, companion_mode, companion_count, join_group_chat, concert:concerts(id, name, venue, concert_at)",
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const logIds = (logs ?? []).map((l: any) => l.id);
  const { data: encores } = useQuery({
    queryKey: ["my_log_encores", logIds.join(",")],
    enabled: logIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("log_reactions")
        .select("log_id")
        .in("log_id", logIds)
        .eq("reaction", "encore");
      return data ?? [];
    },
  });

  const { data: adminCheck } = useQuery({
    queryKey: ["is_admin", user.id],
    queryFn: () => checkIsAdmin(),
  });

  const nameParts = (profile?.full_name ?? "").trim().split(/\s+/).filter(Boolean);
  const firstName =
    (nameParts.length > 1 ? nameParts.slice(0, -1).join(" ") : nameParts[0]) || "there";

  const concertList = (concerts ?? []) as any[];
  const logList = (logs ?? []) as any[];

  // encore counts per log
  const encoreByLog = new Map<string, number>();
  for (const r of encores ?? []) encoreByLog.set(r.log_id, (encoreByLog.get(r.log_id) ?? 0) + 1);

  const enrichedLogs: LogForBadges[] = logList.map((l) => ({
    user_concert_id: l.user_concert_id,
    rating: l.rating,
    notes: l.notes,
    favourite_moment: l.favourite_moment,
    encore_count: encoreByLog.get(l.id) ?? 0,
  }));

  // "Completed" log = has rating, notes, or favourite moment
  const completedConcertIds = new Set(
    enrichedLogs
      .filter(
        (l) =>
          l.rating != null ||
          (l.notes && l.notes.trim()) ||
          (l.favourite_moment && l.favourite_moment.trim()),
      )
      .map((l) => l.user_concert_id),
  );
  const loggedConcerts = concertList.filter((c) => completedConcertIds.has(c.id));

  const badges = computeBadges(
    concertList.map((c) => ({
      id: c.id,
      source: c.source as ConcertForBadges["source"],
      genres: c.genres,
    })),
    enrichedLogs,
  );

  // Favourite genres weighted by encores received on that log
  const genreScores = new Map<string, number>();
  for (const l of enrichedLogs) {
    const c = concertList.find((x) => x.id === l.user_concert_id);
    if (!c) continue;
    if (!completedConcertIds.has(c.id)) continue;
    const weight = 1 + (l.encore_count ?? 0);
    for (const g of c.genres ?? []) genreScores.set(g, (genreScores.get(g) ?? 0) + weight);
  }
  const topGenres = [...genreScores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);

  const momentByConcert = new Map<string, string | null>();
  for (const l of logList) momentByConcert.set(l.user_concert_id, l.favourite_moment ?? null);
  const totalEncores = [...encoreByLog.values()].reduce((a, b) => a + b, 0);

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-md px-5 pt-8">
        <div className="flex items-center justify-between">
          <MuselingLogo />
          <div className="flex items-center gap-2">
            <Link
              to="/edit-preferences"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-secondary-foreground"
              aria-label="Settings"
            >
              <Settings className="h-4 w-4" />
            </Link>
            <button
              onClick={signOut}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-secondary-foreground"
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
        {adminCheck?.isAdmin && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Link
              to="/admin/reports"
              className="flex h-9 items-center gap-1.5 rounded-full bg-primary px-3 text-xs font-medium text-primary-foreground"
            >
              <Shield className="h-3.5 w-3.5" /> Reports
            </Link>
            <Link
              to="/admin/attendance"
              className="flex h-9 items-center gap-1.5 rounded-full bg-primary px-3 text-xs font-medium text-primary-foreground"
            >
              <Users className="h-3.5 w-3.5" /> Going
            </Link>
            <Link
              to="/admin/founding"
              className="flex h-9 items-center gap-1.5 rounded-full bg-primary px-3 text-xs font-medium text-primary-foreground"
            >
              <Users className="h-3.5 w-3.5" /> Founding
            </Link>
          </div>
        )}

        <h1 className="mt-8 font-display text-4xl leading-tight">{firstName}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {profile?.location ? `Based in ${profile.location}` : "Your concert life."}
        </p>

        <div className="mt-6 grid grid-cols-3 gap-2">
          <Stat label="Logged" value={loggedConcerts.length} />
          <Stat label="Encores" value={totalEncores} />
          <Stat label="Genres" value={topGenres.length} />
        </div>

        <MembershipSection profile={profile} />

        <section className="mt-8">
          <h2 className="font-display text-lg">Going to</h2>
          {!intents || intents.length === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">
              You haven't marked any concerts yet.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {(intents as any[]).map((i) => (
                <li key={i.id} className="rounded-2xl bg-card p-3">
                  <p className="text-sm font-medium">{i.concert?.name ?? i.concert_slug}</p>
                  {i.concert?.venue && (
                    <p className="text-xs text-muted-foreground">{i.concert.venue}</p>
                  )}
                  <p className="mt-1 text-[11px] text-primary">
                    {companionLabel(i.companion_mode, i.companion_count)}
                  </p>
                  <div className="mt-2 flex gap-1 rounded-full bg-secondary p-0.5 text-[11px] font-medium">
                    <span className="flex-1 rounded-full bg-primary px-3 py-1 text-center text-primary-foreground">
                      Going
                    </span>
                    <button
                      onClick={() => cancelIntent.mutate(i.id)}
                      disabled={cancelIntent.isPending}
                      className="flex-1 rounded-full px-3 py-1 text-center text-secondary-foreground transition hover:bg-background disabled:opacity-50"
                    >
                      Not going anymore
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-8">
          <h2 className="font-display text-lg">Badges</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {badges.earned.length === 0 && badges.locked.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Log your first concert to earn a badge.
              </p>
            ) : (
              <>
                {badges.earned.map((b) => (
                  <span
                    key={b.id}
                    title={b.description}
                    className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
                  >
                    <Award className="h-3.5 w-3.5" /> {b.name}
                  </span>
                ))}
                {badges.locked.map((b) => (
                  <span
                    key={b.id}
                    title={b.description}
                    className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground"
                  >
                    <Lock className="h-3 w-3" /> {b.name}
                  </span>
                ))}
              </>
            )}
          </div>
        </section>

        <section className="mt-8">
          <h2 className="font-display text-lg">Favourite genres</h2>
          {topGenres.length === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">
              No genres yet — they'll show up once you log concerts.
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {topGenres.map(([g, n]) => {
                const max = topGenres[0][1];
                return (
                  <div key={g}>
                    <div className="flex justify-between text-xs">
                      <span className="font-medium capitalize">{g}</span>
                      <span className="text-muted-foreground">
                        {n} {n === 1 ? "concert" : "concerts"}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${(n / max) * 100}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="mt-8">
          <h2 className="font-display text-lg">Concert log</h2>
          <div className="mt-3 space-y-2">
            {concertList.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nothing yet.</p>
            ) : (
              concertList.map((c) => {
                const moment = momentByConcert.get(c.id);
                return (
                  <Link
                    key={c.id}
                    to="/concerts/$id"
                    params={{ id: c.id }}
                    className="block rounded-2xl bg-card p-4 transition hover:bg-card/80"
                  >
                    {c.artists && c.artists.length > 0 && (
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {c.artists.join(" · ")}
                      </p>
                    )}
                    <p className="mt-1 font-medium">{c.concert_name}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                      {c.venue && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {c.venue}
                        </span>
                      )}
                      {c.concert_at && (
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays className="h-3 w-3" />
                          {new Date(c.concert_at).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </span>
                      )}
                    </p>
                    {(moment || c.programme) && (
                      <p className="mt-2 border-l-2 border-primary/40 pl-3 text-sm italic text-foreground/80">
                        {moment ?? (c.programme as string)?.split("\n")[0]}
                      </p>
                    )}
                  </Link>
                );
              })
            )}
          </div>
        </section>
      </div>
      <TabBarSpacer />
      <TabBar />
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-card p-3 text-center">
      <p className="font-display text-2xl leading-none">{value}</p>
      <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}

function MembershipSection({ profile }: { profile: any }) {
  const qc = useQueryClient();
  const lifetime = !!profile?.founding_lifetime;
  const expiresAt: string | null = profile?.founding_expires_at ?? null;
  const active = lifetime || (!!expiresAt && new Date(expiresAt) > new Date());
  const plan: string | null = profile?.founding_plan ?? null;

  // Self-heal: if a payment went through but the webhook hasn't landed,
  // reconcile with Stripe once and refresh the profile.
  const synced = useRef(false);
  useEffect(() => {
    if (!profile || active || synced.current) return;
    synced.current = true;
    (async () => {
      try {
        const res: any = await syncFoundingMembership({
          data: { environment: getStripeEnvironment() },
        });
        if (res?.active) qc.invalidateQueries({ queryKey: ["profile"] });
      } catch {
        /* no billing account yet — ignore */
      }
    })();
  }, [profile, active, qc]);
  const label = lifetime
    ? "Lifetime member"
    : plan === "invite"
      ? "Invite pass · 60 days"
      : plan === "monthly"
        ? "Monthly member · £5/mo"
        : plan === "yearly"
          ? "Yearly member · £50/yr"
          : active
            ? "Founding member"
            : "Not a member yet";

  return (
    <section className="mt-8 rounded-3xl bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h2 className="font-display text-lg">Membership</h2>
          </div>
          <p className="mt-2 text-sm font-medium">{label}</p>
          {active && !lifetime && expiresAt && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Renews {new Date(expiresAt).toLocaleDateString()}
            </p>
          )}
          {!active && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Join to unlock group chats and matching.
            </p>
          )}
        </div>
        {active ? (
          <Link
            to="/billing"
            className="shrink-0 rounded-full bg-secondary px-3 py-1.5 text-xs font-medium"
          >
            Manage
          </Link>
        ) : (
          <Link
            to="/join"
            search={{ back: "/profile" }}
            className="shrink-0 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
          >
            Join
          </Link>
        )}
      </div>
    </section>
  );
}
