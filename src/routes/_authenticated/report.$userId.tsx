import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getPersonProfile, submitReport } from "@/utils/safety.functions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/report/$userId")({
  head: () => ({ meta: [{ title: "Report a concern · Museling" }] }),
  component: ReportPage,
});

function ReportPage() {
  const { userId } = Route.useParams();
  const navigate = useNavigate();
  const { user } = Route.useRouteContext();

  const personQ = useQuery({
    queryKey: ["person", userId],
    queryFn: () => getPersonProfile({ data: { userId } }),
  });
  // Concerts the user has marked attending (for the optional event picker)
  const eventsQ = useQuery({
    queryKey: ["my_events_for_report"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("concert_intents")
        .select("concert_id, concerts(name, concert_at)")
        .eq("user_id", user.id)
        .not("concert_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  const [description, setDescription] = useState("");
  const [eventId, setEventId] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const submitMut = useMutation({
    mutationFn: async () => {
      let evidenceUrl: string | null = null;
      if (file) {
        setUploading(true);
        const ext =
          file.name
            .split(".")
            .pop()
            ?.toLowerCase()
            .replace(/[^a-z0-9]/g, "") || "bin";
        const path = `${user.id}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage
          .from("report-evidence")
          .upload(path, file, { contentType: file.type || undefined, upsert: false });
        setUploading(false);
        if (error) throw new Error(error.message);
        evidenceUrl = path;
      }
      return submitReport({
        data: {
          reportedUserId: userId,
          eventId: eventId || null,
          description: description.trim(),
          evidenceUrl,
        },
      });
    },
    onSuccess: () => {
      toast.success("Report submitted. Our team will review it.");
      navigate({ to: "/profile" });
    },
    onError: (e: any) => toast.error(e.message ?? "Could not submit"),
  });

  const person: any = personQ.data;
  const valid = description.trim().length >= 5;

  return (
    <main className="flex min-h-[100dvh] flex-col bg-background pb-16">
      <header className="border-b border-border bg-card/90 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center gap-2 px-3 py-3">
          <Button asChild variant="ghost" size="sm" className="rounded-full">
            <Link to="/people/$id" params={{ id: userId }}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="font-display text-lg">Report a concern</h1>
        </div>
      </header>

      <section className="mx-auto w-full max-w-md px-5 py-5">
        <div className="rounded-2xl bg-card p-4">
          <p className="text-xs text-muted-foreground">Reporting</p>
          <p className="text-sm font-medium">{person?.full_name ?? "—"}</p>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Reports go to a human moderation team and may lead to account action against the
            reported person. Your identity is never shown to them.
          </p>
        </div>

        <form
          className="mt-5 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid && !submitMut.isPending) submitMut.mutate();
          }}
        >
          <div>
            <Label className="text-sm">Which event (optional)</Label>
            <Select value={eventId} onValueChange={(v) => setEventId(v === "__none" ? "" : v)}>
              <SelectTrigger className="mt-1.5 rounded-xl">
                <SelectValue placeholder="Select a concert…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Not related to a specific event</SelectItem>
                {(eventsQ.data ?? []).map((row: any) => (
                  <SelectItem key={row.concert_id} value={row.concert_id}>
                    {row.concerts?.name ?? "Concert"}
                    {row.concerts?.concert_at
                      ? ` · ${new Date(row.concerts.concert_at).toLocaleDateString()}`
                      : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-sm">What happened</Label>
            <Textarea
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what happened in as much detail as you're comfortable sharing."
              className="mt-1.5 min-h-32 rounded-xl"
              maxLength={4000}
            />
            <p className="mt-1 text-[10px] text-muted-foreground">{description.length}/4000</p>
          </div>

          <div>
            <Label className="text-sm">Supporting evidence (optional)</Label>
            <label className="mt-1.5 flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-border bg-card px-3 py-2 text-sm text-muted-foreground hover:border-primary/40">
              <Upload className="h-4 w-4" />
              <span className="truncate">
                {file ? file.name : "Attach a screenshot or document"}
              </span>
              <input
                type="file"
                className="hidden"
                accept="image/*,application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>

          <Button
            type="submit"
            disabled={!valid || submitMut.isPending}
            className="h-12 w-full rounded-full"
          >
            {uploading ? "Uploading…" : submitMut.isPending ? "Submitting…" : "Submit report"}
          </Button>
        </form>
      </section>
    </main>
  );
}
