import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ChevronLeft, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { addIndependentConcert, searchConcertsCatalog } from "@/utils/concerts.functions";

export const Route = createFileRoute("/_authenticated/concerts/new")({
  head: () => ({ meta: [{ title: "Add a concert · Museling" }] }),
  component: NewConcert,
});

type CatalogConcert = {
  id: string;
  name: string;
  venue: string | null;
  location: string | null;
  concert_at: string | null;
  genre: string | null;
  description: string | null;
};

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function NewConcert() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [catalogId, setCatalogId] = useState<string | null>(null);
  const [form, setForm] = useState({
    concert_name: "",
    artists: "",
    venue: "",
    concert_at: "",
    genres: "",
    programme: "",
    duration_minutes: "",
  });

  const [search, setSearch] = useState("");
  const [results, setResults] = useState<CatalogConcert[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    const term = search.trim();
    if (term.length < 2) {
      setResults(null);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const rows = await searchConcertsCatalog({ data: { q: term } });
        if (!cancelled) setResults(rows as CatalogConcert[]);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [search]);

  function set<K extends keyof typeof form>(key: K, val: string) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  function selectConcert(c: CatalogConcert) {
    setForm((f) => ({
      ...f,
      concert_name: c.name,
      venue: c.venue ?? f.venue,
      concert_at: toLocalInput(c.concert_at) || f.concert_at,
      genres: c.genre ? c.genre : f.genres,
      programme: c.description ?? f.programme,
    }));
    setCatalogId(c.id);
    setShowResults(false);
    setSearch("");
    setResults(null);
    toast.success("Auto-filled from catalogue");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await addIndependentConcert({
        data: {
          concert_name: form.concert_name.trim(),
          artists: form.artists
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          venue: form.venue.trim() || null,
          concert_at: form.concert_at ? new Date(form.concert_at).toISOString() : null,
          genres: form.genres
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          programme: form.programme.trim() || null,
          duration_minutes: form.duration_minutes ? Number(form.duration_minutes) : null,
          catalog_concert_id: catalogId,
        },
      });
      toast.success("Concert added");
      navigate({ to: "/concerts/$id", params: { id: result.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-md px-5 pt-6 pb-12">
        <Link to="/profile" className="inline-flex items-center text-sm text-muted-foreground">
          <ChevronLeft className="h-4 w-4" /> Back
        </Link>
        <h1 className="mt-6 font-display text-3xl leading-tight">Add a concert you went to</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Independent concerts count toward your badges and unlock event logging.
        </p>

        <div className="mt-6 rounded-2xl border border-border bg-card p-4">
          <Label className="text-sm">Search the Museling catalogue</Label>
          <div className="relative mt-1.5">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setShowResults(true);
              }}
              onFocus={() => setShowResults(true)}
              placeholder="Search by concert or venue name…"
              className="pl-9 pr-9"
            />
            {search && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setResults(null);
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-muted"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {showResults && search.trim().length >= 2 && (
            <div className="mt-2 max-h-72 overflow-y-auto rounded-xl border border-border bg-background">
              {searching && (
                <div className="px-3 py-3 text-xs text-muted-foreground">Searching…</div>
              )}
              {!searching && results && results.length === 0 && (
                <div className="px-3 py-3 text-xs text-muted-foreground">
                  No matches — fill the form below manually.
                </div>
              )}
              {!searching &&
                results &&
                results.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => selectConcert(c)}
                    className="block w-full border-b border-border px-3 py-2.5 text-left last:border-b-0 hover:bg-muted"
                  >
                    <div className="text-sm font-medium leading-tight">{c.name}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {[
                        c.venue,
                        c.concert_at
                          ? new Date(c.concert_at).toLocaleDateString(undefined, {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </button>
                ))}
            </div>
          )}
          <p className="mt-2 text-[11px] text-muted-foreground">
            Pick a concert to auto-fill name, venue, date and programme. You can still edit anything
            below.
          </p>
        </div>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <Field label="Concert name" required>
            <Input
              value={form.concert_name}
              onChange={(e) => set("concert_name", e.target.value)}
              required
            />
          </Field>
          <Field label="Artists (comma separated)">
            <Input
              value={form.artists}
              onChange={(e) => set("artists", e.target.value)}
              placeholder="e.g. Alina Ibragimova, Cédric Tiberghien"
            />
          </Field>
          <Field label="Venue">
            <Input
              value={form.venue}
              onChange={(e) => set("venue", e.target.value)}
              placeholder="Holywell Music Room"
            />
          </Field>
          <Field label="Date & time">
            <Input
              type="datetime-local"
              value={form.concert_at}
              onChange={(e) => set("concert_at", e.target.value)}
            />
          </Field>
          <Field label="Genres (comma separated)">
            <Input
              value={form.genres}
              onChange={(e) => set("genres", e.target.value)}
              placeholder="classical, chamber"
            />
          </Field>
          <Field label="Programme (optional)">
            <Textarea
              rows={3}
              value={form.programme}
              onChange={(e) => set("programme", e.target.value)}
            />
          </Field>
          <Field label="Duration (minutes, optional)">
            <Input
              type="number"
              min={1}
              max={600}
              value={form.duration_minutes}
              onChange={(e) => set("duration_minutes", e.target.value)}
            />
          </Field>

          <Button type="submit" className="h-12 w-full rounded-full" disabled={loading}>
            {loading ? "Saving…" : "Add concert"}
          </Button>
        </form>
      </div>
    </main>
  );
}

function Field({
  label,
  children,
  required,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label className="text-sm">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
