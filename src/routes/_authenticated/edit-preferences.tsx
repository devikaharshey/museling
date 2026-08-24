import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { GENRES, AVAILABILITY, type GenreId, type AvailabilityId } from "@/lib/museling";

export const Route = createFileRoute("/_authenticated/edit-preferences")({
  head: () => ({ meta: [{ title: "Edit preferences · Museling" }] }),
  component: EditPreferences,
});

function EditPreferences() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [age, setAge] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [location, setLocation] = useState("");
  const [genres, setGenres] = useState<GenreId[]>([]);
  const [availability, setAvailability] = useState<AvailabilityId[]>([]);
  const [openToMeetups, setOpenToMeetups] = useState(false);
  const [includeAge, setIncludeAge] = useState(true);

  const { data: profile, isLoading } = useQuery({
    queryKey: ["profile", user.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (!profile) {
      const metaName =
        (user.user_metadata as Record<string, string> | undefined)?.full_name ||
        (user.user_metadata as Record<string, string> | undefined)?.name ||
        "";
      if (metaName) {
        const parts = metaName.trim().split(/\s+/);
        setLastName(parts.length > 1 ? parts.pop()! : "");
        setFirstName(parts.join(" "));
      }
      return;
    }
    const parts = (profile.full_name ?? "").trim().split(/\s+/).filter(Boolean);
    if (parts.length > 1) {
      setLastName(parts.pop()!);
      setFirstName(parts.join(" "));
    } else {
      setFirstName(parts[0] ?? "");
      setLastName("");
    }
    setAge(profile.age ? String(profile.age) : "");
    setWhatsapp(profile.whatsapp ?? "");
    setLocation(profile.location ?? "");
    setGenres((profile.genres ?? []) as GenreId[]);
    setAvailability((profile.availability ?? []) as AvailabilityId[]);
    setOpenToMeetups(!!(profile as any).open_to_meetups);
    setIncludeAge((profile as any).include_age_in_matching ?? true);
  }, [profile, user.user_metadata]);

  async function save() {
    setSaving(true);
    const { error } = await supabase.from("profiles").upsert({
      id: user.id,
      full_name: `${firstName.trim()} ${lastName.trim()}`,
      age: age ? parseInt(age, 10) : null,
      whatsapp: whatsapp.trim(),
      location: location.trim(),
      genres,
      availability,
      open_to_meetups: openToMeetups,
      include_age_in_matching: includeAge,
    } as any);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Preferences updated");
    navigate({ to: "/profile" });
  }

  const toggleGenre = (id: GenreId) =>
    setGenres((g) => (g.includes(id) ? g.filter((x) => x !== id) : [...g, id]));
  const toggleAvailability = (id: AvailabilityId) =>
    setAvailability((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));

  if (isLoading) {
    return <div className="min-h-screen bg-background" />;
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-md px-5 pb-32 pt-6">
        <Link
          to="/profile"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
        <h1 className="mt-6 font-display text-3xl">Edit preferences</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Update your details and matching preferences. Your plan stays the same.
        </p>

        <section className="mt-8 space-y-4">
          <Field label="First name">
            <Input
              className="h-12"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Jane"
            />
          </Field>
          <Field label="Last name">
            <Input
              className="h-12"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Listener"
            />
          </Field>
          <Field label="Age">
            <Input
              className="h-12"
              type="number"
              min={16}
              max={120}
              value={age}
              onChange={(e) => setAge(e.target.value)}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Your exact age is never shown to other users. It is only used to find people at a
              similar life stage.
            </p>
          </Field>
          <Field label="WhatsApp number">
            <Input
              className="h-12"
              type="tel"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
            />
          </Field>
          <Field label="Post code">
            <Input
              className="h-12"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="OX1 2AB"
            />
          </Field>
        </section>

        <section className="mt-8">
          <h2 className="text-sm font-medium">Concert meetups</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Opt in to be matched into a small group chat with people who share your taste and are
            going to the same concert.
          </p>

          <label className="mt-4 flex items-start justify-between gap-3 rounded-2xl border border-border bg-card p-4">
            <div className="min-w-0">
              <p className="text-sm font-medium">I'm open to meeting others at concerts</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Master switch. When off, you never appear in a group chat pool.
              </p>
            </div>
            <Switch checked={openToMeetups} onCheckedChange={setOpenToMeetups} />
          </label>

          <label
            className={
              "mt-3 flex items-start justify-between gap-3 rounded-2xl border border-border bg-card p-4 " +
              (openToMeetups ? "" : "pointer-events-none opacity-50")
            }
          >
            <div className="min-w-0">
              <p className="text-sm font-medium">Include my age in matching</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Off = matched on interests only.
              </p>
            </div>
            <Switch
              checked={includeAge}
              onCheckedChange={setIncludeAge}
              disabled={!openToMeetups}
            />
          </label>
        </section>

        <section className="mt-8">
          <h2 className="text-sm font-medium">Genres</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {GENRES.map((g) => {
              const on = genres.includes(g.id);
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => toggleGenre(g.id)}
                  className={
                    "rounded-full border px-4 py-2 text-sm font-medium transition-all " +
                    (on
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-foreground hover:border-primary/50")
                  }
                >
                  {g.label}
                </button>
              );
            })}
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-sm font-medium">Availability</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {AVAILABILITY.map((a) => {
              const on = availability.includes(a.id);
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => toggleAvailability(a.id)}
                  className={
                    "rounded-full border px-3 py-1.5 text-xs font-medium transition-all " +
                    (on
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-foreground hover:border-primary/50")
                  }
                >
                  {a.label}
                </button>
              );
            })}
          </div>
        </section>

        <div className="fixed inset-x-0 bottom-0 border-t border-border/60 bg-background/95 backdrop-blur">
          <div className="mx-auto max-w-md px-5 py-4">
            <Button
              size="lg"
              className="h-14 w-full rounded-full text-base"
              disabled={saving}
              onClick={save}
            >
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-sm">{label}</Label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
