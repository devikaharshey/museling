import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Sparkles, Send, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  listFoundingEligibleConcerts,
  suggestFoundingGroup,
  inviteFoundingGroup,
} from "@/utils/founding.functions";

export const Route = createFileRoute("/_authenticated/admin/founding")({
  head: () => ({ meta: [{ title: "Founding groups · Admin" }] }),
  component: AdminFounding,
});

function AdminFounding() {
  const qc = useQueryClient();
  const concerts = useQuery({
    queryKey: ["admin_founding_eligible"],
    queryFn: () => listFoundingEligibleConcerts(),
  });

  const [openId, setOpenId] = useState<string | null>(null);
  const [suggested, setSuggested] = useState<any[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const suggest = useMutation({
    mutationFn: (concertId: string) => suggestFoundingGroup({ data: { concertId } }),
    onSuccess: (res) => {
      const cs = (res as any)?.candidates ?? [];
      setSuggested(cs);
      setSelected(new Set(cs.map((c: any) => c.user_id)));
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not suggest"),
  });

  const invite = useMutation({
    mutationFn: (payload: { concertId: string; userIds: string[] }) =>
      inviteFoundingGroup({ data: payload }),
    onSuccess: () => {
      toast.success("Invitations sent");
      setOpenId(null);
      setSuggested([]);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["admin_founding_eligible"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not invite"),
  });

  const rows = (concerts.data ?? []) as any[];

  return (
    <main className="min-h-[100dvh] bg-background">
      <header className="border-b border-border bg-card/90 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-2 px-4 py-3">
          <Button asChild variant="ghost" size="sm" className="rounded-full">
            <Link to="/profile">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="font-display text-lg">Founding groups</h1>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-4 py-6">
        <p className="text-xs text-muted-foreground">
          Concerts with 3+ attendees open to matching. Auto-suggest a group of up to 8, then invite.
          Members pay £5 to unlock the chat and 2 months of matching.
        </p>

        {concerts.isLoading && <p className="mt-6 text-sm text-muted-foreground">Loading…</p>}
        {!concerts.isLoading && rows.length === 0 && (
          <p className="mt-6 text-sm text-muted-foreground">No eligible concerts yet.</p>
        )}

        <div className="mt-4 space-y-3">
          {rows.map((c) => (
            <section key={c.id} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="truncate font-display text-base">{c.name}</h2>
                  <p className="text-xs text-muted-foreground">
                    {c.venue} · {c.location}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(c.concert_at).toLocaleString()}
                  </p>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-medium">
                  <Users className="h-3 w-3" /> {c.attendee_count}
                </span>
              </div>

              {openId !== c.id ? (
                <Button
                  size="sm"
                  className="mt-3 rounded-full"
                  onClick={() => {
                    setOpenId(c.id);
                    setSuggested([]);
                    setSelected(new Set());
                    suggest.mutate(c.id);
                  }}
                >
                  <Sparkles className="mr-1 h-3.5 w-3.5" /> Suggest group
                </Button>
              ) : (
                <div className="mt-3">
                  {suggest.isPending && <p className="text-xs text-muted-foreground">Matching…</p>}
                  {suggested.length > 0 && (
                    <>
                      <ul className="divide-y divide-border">
                        {suggested.map((s: any) => (
                          <li
                            key={s.user_id}
                            className="flex items-center justify-between gap-2 py-2 text-sm"
                          >
                            <label className="flex min-w-0 items-center gap-2">
                              <input
                                type="checkbox"
                                checked={selected.has(s.user_id)}
                                onChange={(e) => {
                                  const next = new Set(selected);
                                  if (e.target.checked) next.add(s.user_id);
                                  else next.delete(s.user_id);
                                  setSelected(next);
                                }}
                              />
                              <span className="truncate">
                                {s.full_name ?? s.user_id.slice(0, 8)}
                                {s.age != null && s.include_age ? ` · ${s.age}` : ""}
                              </span>
                            </label>
                            <span className="shrink-0 text-[11px] text-muted-foreground">
                              {(s.genres ?? []).slice(0, 2).join(", ")}
                            </span>
                          </li>
                        ))}
                      </ul>
                      <div className="mt-3 flex gap-2">
                        <Button
                          size="sm"
                          className="rounded-full"
                          disabled={selected.size < 2 || invite.isPending}
                          onClick={() =>
                            invite.mutate({ concertId: c.id, userIds: Array.from(selected) })
                          }
                        >
                          <Send className="mr-1 h-3.5 w-3.5" /> Invite {selected.size}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="rounded-full"
                          onClick={() => setOpenId(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
