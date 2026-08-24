import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { GENRES, type GenreId } from "@/lib/museling";

export const Route = createFileRoute("/_authenticated/signup")({
  head: () => ({ meta: [{ title: "Set up · Museling" }] }),
  component: SignupWizard,
});

type Step = 0 | 1;

function SignupWizard() {
  const navigate = useNavigate();
  const { user } = Route.useRouteContext();

  const [step, setStep] = useState<Step>(0);
  const [saving, setSaving] = useState(false);

  // Step 1
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [age, setAge] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [location, setLocation] = useState("");
  const [countryCode, setCountryCode] = useState("");

  // Step 2
  const [genres, setGenres] = useState<GenreId[]>([]);

  // Preload existing profile.
  useEffect(() => {
    (async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

      if (!profile) return;

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
      setCountryCode(profile.country_code ?? "");
      setGenres((profile.genres ?? []) as GenreId[]);

      if (profile.signup_complete) {
        navigate({ to: "/discover" });
      }
    })();
  }, [user.id, navigate]);

  const canNext = (() => {
    if (step === 0) {
      return (
        firstName.trim() &&
        lastName.trim() &&
        age &&
        whatsapp.trim() &&
        location.trim() &&
        countryCode
      );
    }

    if (step === 1) return genres.length > 0;

    return false;
  })();

  async function saveProfile(markComplete: boolean) {
    const { error } = await supabase.from("profiles").upsert({
      id: user.id,
      full_name: `${firstName.trim()} ${lastName.trim()}`,
      age: parseInt(age, 10),
      whatsapp: whatsapp.trim(),
      location: location.trim(),
      country_code: countryCode,
      genres,
      signup_complete: markComplete,
    });

    if (error) {
      toast.error(error.message);
      return false;
    }

    return true;
  }

  async function finish() {
    setSaving(true);

    const ok = await saveProfile(true);

    setSaving(false);

    if (!ok) return;

    toast.success("You're in! Start exploring concerts near you.");
    navigate({ to: "/discover" });
  }

  async function handleNext() {
    if (!canNext || saving) return;

    if (step === 1) {
      await finish();
      return;
    }

    setStep((s) => (s + 1) as Step);
  }

  return (
    <main className="min-h-[100dvh] bg-background">
      <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col px-5 pb-32 pt-6">
        <div className="flex items-center justify-between">
          {step > 0 ? (
            <button
              onClick={() => setStep((s) => (s - 1) as Step)}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-secondary-foreground"
              aria-label="Back"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          ) : (
            <Link to="/signin" className="flex items-center gap-2 text-sm text-muted-foreground">
              <ArrowLeft className="h-4 w-4" /> Back
            </Link>
          )}

          <span className="text-xs font-medium text-muted-foreground">Step {step + 1} of 2</span>
        </div>

        <Progress value={((step + 1) / 2) * 100} className="mt-4 h-1.5" />

        <div className="mt-8 flex-1">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.25 }}
            >
              {step === 0 && (
                <StepProfile
                  firstName={firstName}
                  setFirstName={setFirstName}
                  lastName={lastName}
                  setLastName={setLastName}
                  age={age}
                  setAge={setAge}
                  whatsapp={whatsapp}
                  setWhatsapp={setWhatsapp}
                  location={location}
                  setLocation={setLocation}
                  countryCode={countryCode}
                  setCountryCode={setCountryCode}
                />
              )}

              {step === 1 && <StepGenres value={genres} onChange={setGenres} />}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="fixed inset-x-0 bottom-0 border-t border-border/60 bg-background/95 backdrop-blur">
          <div className="mx-auto max-w-md px-5 py-4">
            <Button
              size="lg"
              className="h-14 w-full rounded-full text-base"
              disabled={!canNext || saving}
              onClick={handleNext}
            >
              {step === 1 ? (
                <>
                  Finish <Check className="ml-1 h-4 w-4" />
                </>
              ) : (
                <>
                  Continue <ArrowRight className="ml-1 h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
}

function StepHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <>
      <h1 className="font-display text-3xl leading-tight">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
    </>
  );
}

function StepProfile(props: {
  firstName: string;
  setFirstName: (v: string) => void;
  lastName: string;
  setLastName: (v: string) => void;
  age: string;
  setAge: (v: string) => void;
  whatsapp: string;
  setWhatsapp: (v: string) => void;
  location: string;
  setLocation: (v: string) => void;
  countryCode: string;
  setCountryCode: (v: string) => void;
}) {
  return (
    <div>
      <StepHeader title="A bit about you" subtitle="So we can send your invitation." />

      <div className="mt-6 space-y-4">
        <Field label="First name">
          <Input
            className="h-12"
            value={props.firstName}
            onChange={(e) => props.setFirstName(e.target.value)}
            placeholder="Jane"
          />
        </Field>

        <Field label="Last name">
          <Input
            className="h-12"
            value={props.lastName}
            onChange={(e) => props.setLastName(e.target.value)}
            placeholder="Listener"
          />
        </Field>

        <Field label="Age">
          <Input
            className="h-12"
            type="number"
            min={16}
            max={120}
            value={props.age}
            onChange={(e) => props.setAge(e.target.value)}
            placeholder="28"
          />
        </Field>

        <Field label="WhatsApp number">
          <Input
            className="h-12"
            type="tel"
            value={props.whatsapp}
            onChange={(e) => props.setWhatsapp(e.target.value)}
            placeholder="+44 7700 900000"
          />
        </Field>

        <Field label="Country">
          <select
            className="h-12 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={props.countryCode}
            onChange={(e) => props.setCountryCode(e.target.value)}
          >
            <option value="">Select your country</option>
            <option value="IN">India</option>
            <option value="GB">United Kingdom</option>
            <option value="US">United States</option>
            <option value="CA">Canada</option>
            <option value="AU">Australia</option>
            <option value="NZ">New Zealand</option>
            <option value="DE">Germany</option>
            <option value="FR">France</option>
            <option value="ES">Spain</option>
            <option value="IT">Italy</option>
            <option value="NL">Netherlands</option>
            <option value="IE">Ireland</option>
            <option value="SG">Singapore</option>
            <option value="AE">United Arab Emirates</option>
            <option value="JP">Japan</option>
            <option value="OTHER">Other</option>
          </select>
        </Field>

        <Field label="Post code">
          <Input
            className="h-12"
            value={props.location}
            onChange={(e) => props.setLocation(e.target.value)}
            placeholder="OX1 2AB"
          />
        </Field>
      </div>
    </div>
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

function StepGenres({ value, onChange }: { value: GenreId[]; onChange: (v: GenreId[]) => void }) {
  const toggle = (id: GenreId) =>
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);

  return (
    <div>
      <StepHeader title="What do you love?" subtitle="Pick all that move you." />

      <div className="mt-6 flex flex-wrap gap-2">
        {GENRES.map((g) => {
          const on = value.includes(g.id);

          return (
            <button
              key={g.id}
              type="button"
              onClick={() => toggle(g.id)}
              className={
                "rounded-full border px-4 py-2.5 text-sm font-medium transition-all " +
                (on
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-foreground hover:border-primary/50")
              }
            >
              {on && <Check className="mr-1 inline h-3.5 w-3.5" />}
              {g.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
