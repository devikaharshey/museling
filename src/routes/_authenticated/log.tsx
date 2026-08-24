import { MuselingLogo } from "@/components/MuselingLogo";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, ChevronRight, Plus, PencilLine, Check, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { TabBar, TabBarSpacer } from "@/components/TabBar";

export const Route = createFileRoute("/_authenticated/log")({
  head: () => ({ meta: [{ title: "Log · Museling" }] }),
  component: LogPage,
});

function LogPage() {
  const { user } = Route.useRouteContext();

  const { data: concerts } = useQuery({
    queryKey: ["my_concerts_with_logs", user.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_concerts")
        .select("id, concert_name, venue, concert_at, concert_logs(id, rating, visibility)")
        .eq("user_id", user.id)
        .order("concert_at", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-md px-5 pt-8">
        <MuselingLogo />
        <h1 className="mt-6 font-display text-4xl leading-tight">Log</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Capture how the night felt — the moment that stayed with you, the rating, the notes.
        </p>

        <Link
          to="/concerts/new"
          className="mt-6 flex items-center justify-between rounded-3xl bg-primary p-5 text-primary-foreground"
        >
          <div>
            <p className="font-display text-lg leading-tight">Add a new concert</p>
            <p className="mt-0.5 text-xs opacity-80">A gig you went to on your own.</p>
          </div>
          <Plus className="h-6 w-6" />
        </Link>

        <h2 className="mt-8 font-display text-lg">Your concerts</h2>
        <div className="mt-3 space-y-2">
          {(concerts ?? []).length === 0 ? (
            <div className="rounded-3xl border border-dashed border-border bg-card p-6 text-center">
              <p className="text-sm font-medium">Nothing logged yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Add a concert above to start your log.
              </p>
            </div>
          ) : (
            (concerts ?? []).map((c: any) => {
              const logged = (c.concert_logs ?? []).length > 0;
              const isPrivate = (c.concert_logs ?? [])[0]?.visibility === "private";
              return (
                <Link
                  key={c.id}
                  to="/concerts/$id"
                  params={{ id: c.id }}
                  className="flex items-center justify-between gap-3 rounded-2xl bg-card p-4 transition hover:bg-card/80"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{c.concert_name}</p>
                    <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                      {c.concert_at && (
                        <>
                          <CalendarDays className="h-3 w-3" />
                          {new Date(c.concert_at).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </>
                      )}
                      {c.venue && <span className="truncate">· {c.venue}</span>}
                    </p>
                  </div>
                  {logged && isPrivate && (
                    <Lock
                      className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                      aria-label="Only me"
                    />
                  )}
                  <span
                    className={
                      "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] " +
                      (logged ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")
                    }
                  >
                    {logged ? (
                      <>
                        <Check className="h-3 w-3" /> Logged
                      </>
                    ) : (
                      <>
                        <PencilLine className="h-3 w-3" /> Log
                      </>
                    )}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              );
            })
          )}
        </div>
      </div>
      <TabBarSpacer />
      <TabBar />
    </main>
  );
}
