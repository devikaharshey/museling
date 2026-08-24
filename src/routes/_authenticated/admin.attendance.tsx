import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listAttendanceAdmin } from "@/utils/admin.functions";

export const Route = createFileRoute("/_authenticated/admin/attendance")({
  head: () => ({ meta: [{ title: "Attendance · Admin" }] }),
  component: AdminAttendance,
});

function companionLabel(mode: string | null, count: number | null): string {
  if (mode === "solo_happy") return "Solo — happy alone";
  if (mode === "meet_others") return "Wants to meet others";
  if (mode === "group_open")
    return `+${count ?? 1} companion${(count ?? 1) === 1 ? "" : "s"}, open to matching`;
  return "—";
}

function AdminAttendance() {
  const q = useQuery({ queryKey: ["admin_attendance"], queryFn: () => listAttendanceAdmin() });
  const rows = (q.data ?? []) as any[];

  // Group by concert
  const groups = new Map<
    string,
    { title: string; venue?: string; concert_at?: string; items: any[] }
  >();
  for (const r of rows) {
    const key = r.concert?.id ?? r.concert_slug;
    if (!groups.has(key)) {
      groups.set(key, {
        title: r.concert?.name ?? r.concert_slug,
        venue: r.concert?.venue,
        concert_at: r.concert?.concert_at,
        items: [],
      });
    }
    groups.get(key)!.items.push(r);
  }

  return (
    <main className="min-h-[100dvh] bg-background">
      <header className="border-b border-border bg-card/90 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-2 px-4 py-3">
          <Button asChild variant="ghost" size="sm" className="rounded-full">
            <Link to="/profile">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="font-display text-lg">Attendance</h1>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-4 py-6">
        {q.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!q.isLoading && groups.size === 0 && (
          <p className="text-sm text-muted-foreground">No attendance yet.</p>
        )}
        <div className="space-y-6">
          {[...groups.entries()].map(([key, g]) => (
            <section key={key} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="font-display text-base">{g.title}</h2>
                  {g.venue && <p className="text-xs text-muted-foreground">{g.venue}</p>}
                  {g.concert_at && (
                    <p className="text-xs text-muted-foreground">
                      {new Date(g.concert_at).toLocaleString()}
                    </p>
                  )}
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-medium text-secondary-foreground">
                  <Users className="h-3 w-3" /> {g.items.length}
                </span>
              </div>
              <ul className="mt-3 divide-y divide-border">
                {g.items.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="truncate">
                      {i.profile?.full_name ?? i.user_id.slice(0, 8)}
                    </span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {companionLabel(i.companion_mode, i.companion_count)}
                      {i.join_group_chat ? " · chat" : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
