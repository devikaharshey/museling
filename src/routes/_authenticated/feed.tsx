import { MuselingLogo } from "@/components/MuselingLogo";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CalendarDays, MapPin, MessageCircle, Sparkles, Star, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { TabBar, TabBarSpacer } from "@/components/TabBar";
import { toast } from "sonner";
import { listPublicProfiles } from "@/utils/safety.functions";

export const Route = createFileRoute("/_authenticated/feed")({
  head: () => ({ meta: [{ title: "Feed · Museling" }] }),
  component: Feed,
});

type FeedLog = {
  id: string;
  user_id: string;
  user_concert_id: string;
  rating: number | null;
  notes: string | null;
  favourite_moment: string | null;
  created_at: string;
  user_concerts: {
    concert_name: string;
    venue: string | null;
    concert_at: string | null;
    artists: string[] | null;
    genres: string[] | null;
  } | null;
};

function Feed() {
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();

  const { data: logs, isLoading } = useQuery({
    queryKey: ["feed_logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("concert_logs")
        .select(
          "id, user_id, user_concert_id, rating, notes, favourite_moment, created_at, user_concerts(concert_name, venue, concert_at, artists, genres)",
        )
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as FeedLog[];
    },
  });

  const logIds = (logs ?? []).map((l) => l.id);
  const authorIds = [...new Set((logs ?? []).map((l) => l.user_id))];

  const { data: profiles } = useQuery({
    queryKey: ["feed_profiles", authorIds.join(",")],
    enabled: authorIds.length > 0,
    queryFn: async () => {
      return await listPublicProfiles({ data: { ids: authorIds } });
    },
  });

  const { data: reactions } = useQuery({
    queryKey: ["feed_reactions", logIds.join(",")],
    enabled: logIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("log_reactions")
        .select("id, log_id, user_id, reaction")
        .in("log_id", logIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: comments } = useQuery({
    queryKey: ["feed_comments", logIds.join(",")],
    enabled: logIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("log_comments")
        .select("id, log_id, user_id, body, created_at")
        .in("log_id", logIds)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const profileMap = new Map<string, string | null>(
    ((profiles ?? []) as any[]).map((p: any) => [
      p.id as string,
      (p.full_name ?? null) as string | null,
    ]),
  );
  const reactionsByLog = new Map<string, { id: string; user_id: string }[]>();
  for (const r of reactions ?? []) {
    const arr = reactionsByLog.get(r.log_id) ?? [];
    arr.push({ id: r.id, user_id: r.user_id });
    reactionsByLog.set(r.log_id, arr);
  }
  const commentsByLog = new Map<string, typeof comments>();
  for (const c of comments ?? []) {
    const arr = (commentsByLog.get(c.log_id) ?? []) as any[];
    arr.push(c);
    commentsByLog.set(c.log_id, arr as any);
  }

  // Need profiles for commenters too
  const commenterIds = [...new Set((comments ?? []).map((c) => c.user_id))];
  const missingCommenters = commenterIds.filter((id) => !profileMap.has(id));
  const { data: commenterProfiles } = useQuery({
    queryKey: ["feed_commenter_profiles", missingCommenters.join(",")],
    enabled: missingCommenters.length > 0,
    queryFn: async () => {
      return await listPublicProfiles({ data: { ids: missingCommenters } });
    },
  });
  for (const p of (commenterProfiles ?? []) as any[])
    profileMap.set(p.id as string, (p.full_name ?? null) as string | null);

  const toggleEncore = useMutation({
    mutationFn: async ({ logId, mine }: { logId: string; mine: { id: string } | undefined }) => {
      if (mine) {
        const { error } = await supabase.from("log_reactions").delete().eq("id", mine.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("log_reactions")
          .insert({ log_id: logId, user_id: user.id, reaction: "encore" });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["feed_reactions"] }),
    onError: (e: any) => toast.error(e.message ?? "Couldn't react"),
  });

  const addComment = useMutation({
    mutationFn: async ({ logId, body }: { logId: string; body: string }) => {
      const { error } = await supabase
        .from("log_comments")
        .insert({ log_id: logId, user_id: user.id, body });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["feed_comments"] }),
    onError: (e: any) => toast.error(e.message ?? "Couldn't comment"),
  });

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-md px-5 pt-8">
        <MuselingLogo />
        <h1 className="mt-6 font-display text-4xl leading-tight">Feed</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Concert logs from your fellow Muselings.
        </p>

        <div className="mt-6 space-y-4">
          {isLoading ? (
            <div className="h-40 animate-pulse rounded-3xl bg-card" />
          ) : (logs ?? []).length === 0 ? (
            <div className="rounded-3xl border border-dashed border-border bg-card p-8 text-center">
              <Sparkles className="mx-auto h-5 w-5 text-primary" />
              <p className="mt-3 text-sm font-medium">No logs yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Be the first to share an evening.
              </p>
            </div>
          ) : (
            (logs ?? []).map((log) => {
              const logReactions = reactionsByLog.get(log.id) ?? [];
              const mine = logReactions.find((r) => r.user_id === user.id);
              const logComments = (commentsByLog.get(log.id) ?? []) as any[];
              return (
                <FeedCard
                  key={log.id}
                  log={log}
                  authorName={profileMap.get(log.user_id) ?? "A Museling"}
                  encoreCount={logReactions.length}
                  encored={Boolean(mine)}
                  onEncore={() => toggleEncore.mutate({ logId: log.id, mine })}
                  comments={logComments}
                  profileMap={profileMap}
                  onComment={(body) => addComment.mutate({ logId: log.id, body })}
                />
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

function FeedCard({
  log,
  authorName,
  encoreCount,
  encored,
  onEncore,
  comments,
  profileMap,
  onComment,
}: {
  log: FeedLog;
  authorName: string;
  encoreCount: number;
  encored: boolean;
  onEncore: () => void;
  comments: { id: string; user_id: string; body: string; created_at: string }[];
  profileMap: Map<string, string | null>;
  onComment: (body: string) => void;
}) {
  const c = log.user_concerts;
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const date = c?.concert_at ? new Date(c.concert_at) : null;

  const handleSend = () => {
    const body = draft.trim();
    if (!body) return;
    onComment(body);
    setDraft("");
  };

  return (
    <article className="rounded-3xl bg-card p-5">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">{authorName}</p>
          <h3 className="mt-0.5 font-display text-xl leading-tight">
            {c?.concert_name ?? "A concert"}
          </h3>
          {c?.artists && c.artists.length > 0 && (
            <p className="mt-0.5 text-xs text-muted-foreground">{c.artists.join(" · ")}</p>
          )}
        </div>
        {log.rating != null && (
          <div className="flex shrink-0 items-center gap-0.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <Star
                key={n}
                className={
                  "h-3.5 w-3.5 " +
                  ((log.rating ?? 0) >= n
                    ? "fill-primary text-primary"
                    : "text-muted-foreground/40")
                }
              />
            ))}
          </div>
        )}
      </header>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {date && (
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="h-3 w-3" />
            {date.toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </span>
        )}
        {c?.venue && (
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            {c.venue}
          </span>
        )}
      </div>

      {log.favourite_moment && (
        <p className="mt-4 border-l-2 border-primary/50 pl-3 text-sm italic">
          "{log.favourite_moment}"
        </p>
      )}
      {log.notes && <p className="mt-3 whitespace-pre-wrap text-sm">{log.notes}</p>}

      <div className="mt-4 flex items-center gap-2">
        <button
          onClick={onEncore}
          className={
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition " +
            (encored
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-foreground hover:bg-muted/70")
          }
        >
          <Sparkles className="h-3.5 w-3.5" />
          Encore {encoreCount > 0 && <span className="opacity-80">· {encoreCount}</span>}
        </button>
        <button
          onClick={() => setOpen((o) => !o)}
          className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/70"
        >
          <MessageCircle className="h-3.5 w-3.5" />
          {comments.length} {comments.length === 1 ? "comment" : "comments"}
        </button>
      </div>

      {(open || comments.length > 0) && (
        <div className="mt-4 space-y-2 border-t border-border pt-3">
          {comments.map((cm) => (
            <div key={cm.id} className="text-sm">
              <span className="font-medium">{profileMap.get(cm.user_id) ?? "Museling"}: </span>
              <span className="text-foreground/90">{cm.body}</span>
            </div>
          ))}
          <div className="mt-2 flex items-start gap-2">
            <Textarea
              rows={1}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Add a comment…"
              className="min-h-[40px] resize-none rounded-xl"
            />
            <Button
              size="icon"
              className="h-10 w-10 shrink-0 rounded-full"
              onClick={handleSend}
              disabled={!draft.trim()}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </article>
  );
}
