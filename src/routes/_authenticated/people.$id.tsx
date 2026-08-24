import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ShieldAlert,
  Flag,
  Heart,
  Minus,
  EyeOff,
  AlertOctagon,
  UserPlus,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { TabBar, TabBarSpacer } from "@/components/TabBar";
import {
  getPersonProfile,
  getAffinityFor,
  setAffinity,
  getBlockState,
  setBlock,
  removeBlock,
} from "@/utils/safety.functions";
import { followUser, unfollowUser, getFollowState } from "@/utils/follows.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/people/$id")({
  head: () => ({ meta: [{ title: "Person · Museling" }] }),
  component: PersonPage,
});

function initials(name?: string | null) {
  if (!name) return "?";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");
}

const AFFINITY_OPTS = [
  {
    level: "boost" as const,
    label: "Meet again more often",
    sub: "+50% in future matching",
    Icon: Heart,
  },
  {
    level: "neutral" as const,
    label: "No preference",
    sub: "Default, no change",
    Icon: Minus,
  },
  {
    level: "reduce" as const,
    label: "Meet again less often",
    sub: "−50% in future matching",
    Icon: EyeOff,
  },
  {
    level: "rare" as const,
    label: "Rarely meet again",
    sub: "−90% (use block to fully avoid)",
    Icon: AlertOctagon,
  },
];

function PersonPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();

  const personQ = useQuery({
    queryKey: ["person", id],
    queryFn: () => getPersonProfile({ data: { userId: id } }),
  });
  const affQ = useQuery({
    queryKey: ["affinity", id],
    queryFn: () => getAffinityFor({ data: { targetUserId: id } }),
  });
  const blockQ = useQuery({
    queryKey: ["block", id],
    queryFn: () => getBlockState({ data: { targetUserId: id } }),
  });
  const followQ = useQuery({
    queryKey: ["follow", id],
    queryFn: () => getFollowState({ data: { userId: id } }),
  });

  const [extend, setExtend] = useState(false);
  useEffect(() => {
    if (blockQ.data) setExtend(blockQ.data.extendToNetwork);
  }, [blockQ.data?.extendToNetwork]);

  const affMut = useMutation({
    mutationFn: (level: "boost" | "neutral" | "reduce" | "rare") =>
      setAffinity({ data: { targetUserId: id, level } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["affinity", id] });
      toast.success("Preference saved");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const blockMut = useMutation({
    mutationFn: (extendToNetwork: boolean) =>
      setBlock({ data: { targetUserId: id, extendToNetwork } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["block", id] });
      toast.success("Blocked");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const unblockMut = useMutation({
    mutationFn: () => removeBlock({ data: { targetUserId: id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["block", id] });
      toast.success("Unblocked");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const person: any = personQ.data;
  const current = affQ.data?.preference_level ?? "neutral";
  const isBlocked = !!blockQ.data?.blocked;
  const iFollow = !!followQ.data?.iFollow;

  const followMut = useMutation({
    mutationFn: () =>
      iFollow ? unfollowUser({ data: { userId: id } }) : followUser({ data: { userId: id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["follow", id] }),
  });

  return (
    <main className="flex min-h-[100dvh] flex-col bg-background pb-24">
      <header className="border-b border-border bg-card/90 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center gap-2 px-3 py-3">
          <Button asChild variant="ghost" size="sm" className="rounded-full">
            <Link to="/inbox">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="font-display text-lg">Person</h1>
        </div>
      </header>

      <section className="mx-auto w-full max-w-md px-5 py-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Avatar className="h-14 w-14">
              <AvatarFallback>{initials(person?.full_name)}</AvatarFallback>
            </Avatar>
            <div>
              <p className="font-display text-xl">{person?.full_name ?? "—"}</p>
              <p className="text-xs text-muted-foreground">
                {(person?.genres ?? []).slice(0, 3).join(" · ")}
              </p>
            </div>
          </div>
          {!isBlocked && (
            <Button
              size="sm"
              variant={iFollow ? "secondary" : "default"}
              className="rounded-full"
              disabled={followMut.isPending}
              onClick={() => followMut.mutate()}
            >
              {iFollow ? (
                <>
                  <Check className="mr-1 h-3.5 w-3.5" />
                  Following
                </>
              ) : (
                <>
                  <UserPlus className="mr-1 h-3.5 w-3.5" />
                  Follow
                </>
              )}
            </Button>
          )}
        </div>

        {/* Affinity */}
        <div className="mt-6">
          <h2 className="text-sm font-semibold">Matching preference</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Private to you. Adjusts the chance you're grouped together again.
          </p>
          <div className="mt-3 grid grid-cols-1 gap-2">
            {AFFINITY_OPTS.map(({ level, label, sub, Icon }) => {
              const active = current === level;
              return (
                <button
                  key={level}
                  type="button"
                  disabled={affMut.isPending}
                  onClick={() => affMut.mutate(level)}
                  className={
                    "flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition " +
                    (active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card hover:border-primary/40")
                  }
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{label}</p>
                    <p
                      className={"text-[11px] " + (active ? "opacity-80" : "text-muted-foreground")}
                    >
                      {sub}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="my-6 h-px bg-border" />

        {/* Block */}
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
          <div className="flex items-start gap-2">
            <ShieldAlert className="mt-0.5 h-4 w-4 text-destructive" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-destructive">Block this person</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Instantly hides their logs, reactions and comments from you, and removes them from
                your matching pool. They aren't notified. You can undo this any time.
              </p>

              {!isBlocked && (
                <label className="mt-3 flex items-start gap-3 rounded-xl bg-card/70 p-3">
                  <Switch checked={extend} onCheckedChange={setExtend} />
                  <div className="min-w-0">
                    <p className="text-xs font-medium">
                      Also avoid groups that include people I've blocked
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      Deprioritises matches that overlap with anyone this person has blocked or been
                      reported by.
                    </p>
                  </div>
                </label>
              )}

              <div className="mt-3 flex gap-2">
                {isBlocked ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full"
                    disabled={unblockMut.isPending}
                    onClick={() => unblockMut.mutate()}
                  >
                    Unblock
                  </Button>
                ) : (
                  <Button
                    variant="destructive"
                    size="sm"
                    className="rounded-full"
                    disabled={blockMut.isPending}
                    onClick={() => blockMut.mutate(extend)}
                  >
                    Block
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Report — distinct, smaller, secondary */}
        <div className="mt-5 text-center">
          <Link
            to="/report/$userId"
            params={{ userId: id }}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            <Flag className="h-3.5 w-3.5" />
            Report a concern to moderators
          </Link>
          <p className="mt-1 text-[10px] text-muted-foreground">
            Reports go to a human moderation team and can lead to account action.
          </p>
        </div>
      </section>

      <TabBarSpacer />
      <TabBar />
    </main>
  );
}
