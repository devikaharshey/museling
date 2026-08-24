import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CalendarDays, ChevronLeft, Globe, Lock, MapPin, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { upsertConcertLog } from "@/utils/concerts.functions";

export const Route = createFileRoute("/_authenticated/concerts/$id")({
  head: () => ({ meta: [{ title: "Concert · Museling" }] }),
  component: ConcertDetail,
});

function ConcertDetail() {
  const { id } = Route.useParams();
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: concert, isLoading } = useQuery({
    queryKey: ["user_concert", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_concerts")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const { data: log } = useQuery({
    queryKey: ["concert_log", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("concert_logs")
        .select("*")
        .eq("user_concert_id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const [rating, setRating] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [moment, setMoment] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [saving, setSaving] = useState(false);
  const [logHydrated, setLogHydrated] = useState(false);

  useEffect(() => {
    if (log && !logHydrated) {
      setRating(log.rating ?? null);
      setNotes(log.notes ?? "");
      setMoment(log.favourite_moment ?? "");
      setVisibility((log as any).visibility === "private" ? "private" : "public");
      setLogHydrated(true);
    }
  }, [log, logHydrated]);

  if (!concert) {
    if (isLoading) {
      return (
        <main className="min-h-screen bg-background">
          <div className="mx-auto max-w-md px-5 pt-6 pb-12">
            <div className="mt-6 h-64 rounded-3xl bg-card animate-pulse" />
            <div className="mt-6 h-80 rounded-3xl bg-card animate-pulse" />
          </div>
        </main>
      );
    }
    return (
      <main className="min-h-screen bg-background">
        <div className="mx-auto max-w-md px-5 pt-10">
          <p className="text-sm text-muted-foreground">Concert not found.</p>
          <Link to="/profile" className="mt-4 inline-block text-sm underline">
            Back
          </Link>
        </div>
      </main>
    );
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await upsertConcertLog({
        data: {
          user_concert_id: id,
          rating: rating ?? null,
          notes: notes.trim() || null,
          favourite_moment: moment.trim() || null,
          visibility,
        },
      });
      toast.success("Log saved");
      qc.invalidateQueries({ queryKey: ["concert_log", id] });
      qc.invalidateQueries({ queryKey: ["my_concert_logs", user.id] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  }

  const date = concert.concert_at ? new Date(concert.concert_at) : null;

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-md px-5 pt-6 pb-12">
        <button
          onClick={() => navigate({ to: "/profile" })}
          className="inline-flex items-center text-sm text-muted-foreground"
        >
          <ChevronLeft className="h-4 w-4" /> Back
        </button>

        <div className="mt-6 rounded-3xl bg-card p-5">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {concert.source === "independent" ? "Self-added" : "From an invitation"}
          </span>
          <h1 className="mt-1 font-display text-3xl leading-tight">{concert.concert_name}</h1>
          {concert.artists && concert.artists.length > 0 && (
            <p className="mt-2 text-sm text-muted-foreground">{concert.artists.join(", ")}</p>
          )}
          <div className="mt-3 space-y-1.5 text-sm">
            {date && (
              <p className="flex items-center gap-2 text-muted-foreground">
                <CalendarDays className="h-4 w-4" />
                {date.toLocaleString(undefined, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            )}
            {concert.venue && (
              <p className="flex items-center gap-2 text-muted-foreground">
                <MapPin className="h-4 w-4" /> {concert.venue}
              </p>
            )}
          </div>
          {concert.genres && concert.genres.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {concert.genres.map((g) => (
                <Badge key={g} variant="secondary" className="rounded-full">
                  {g}
                </Badge>
              ))}
            </div>
          )}
          {concert.programme && (
            <div className="mt-4">
              <p className="text-xs font-medium text-muted-foreground">Programme</p>
              <p className="mt-1 text-sm whitespace-pre-wrap">{concert.programme}</p>
            </div>
          )}
          {concert.duration_minutes && (
            <p className="mt-3 text-xs text-muted-foreground">{concert.duration_minutes} minutes</p>
          )}
        </div>

        <form onSubmit={save} className="mt-6 space-y-4 rounded-3xl bg-card p-5">
          <h2 className="font-display text-lg">Your event log</h2>

          <div>
            <Label className="text-sm">Rating</Label>
            <div className="mt-2 flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  type="button"
                  key={n}
                  onClick={() => setRating(rating === n ? null : n)}
                  aria-label={`${n} star${n > 1 ? "s" : ""}`}
                  className="p-1"
                >
                  <Star
                    className={
                      "h-7 w-7 " +
                      ((rating ?? 0) >= n ? "fill-primary text-primary" : "text-muted-foreground")
                    }
                  />
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-sm">Favourite moment</Label>
            <Input
              className="mt-1.5"
              value={moment}
              onChange={(e) => setMoment(e.target.value)}
              placeholder="The encore…"
            />
          </div>

          <div>
            <Label className="text-sm">Notes</Label>
            <Textarea
              className="mt-1.5"
              rows={5}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What stood out?"
            />
          </div>

          <div>
            <Label className="text-sm">Who can see this</Label>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setVisibility("public")}
                className={
                  "flex items-center justify-center gap-2 rounded-full border px-3 py-2 text-sm transition " +
                  (visibility === "public"
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-foreground")
                }
              >
                <Globe className="h-4 w-4" /> Available to all
              </button>
              <button
                type="button"
                onClick={() => setVisibility("private")}
                className={
                  "flex items-center justify-center gap-2 rounded-full border px-3 py-2 text-sm transition " +
                  (visibility === "private"
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-foreground")
                }
              >
                <Lock className="h-4 w-4" /> Only me
              </button>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {visibility === "private"
                ? "Hidden from the feed and other Muselings."
                : "Shared to the feed for reactions and comments."}
            </p>
          </div>

          <Button type="submit" className="h-12 w-full rounded-full" disabled={saving}>
            {saving ? "Saving…" : log ? "Update log" : "Save log"}
          </Button>
        </form>
      </div>
    </main>
  );
}
