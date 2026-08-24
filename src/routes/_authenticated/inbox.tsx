import { MuselingLogo } from "@/components/MuselingLogo";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Users, MessageCircle, CalendarDays, MapPin, Sparkles, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TabBar, TabBarSpacer } from "@/components/TabBar";
import { supabase } from "@/integrations/supabase/client";
import { listMyGroups } from "@/utils/meetups.functions";
import { listNotifications, markNotificationRead } from "@/utils/notifications.functions";

export const Route = createFileRoute("/_authenticated/inbox")({
  head: () => ({ meta: [{ title: "Groups · Museling" }] }),
  component: InboxPage,
});

function InboxPage() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const groupsQ = useQuery({ queryKey: ["my_groups"], queryFn: () => listMyGroups() });
  const notifQ = useQuery({ queryKey: ["notifications"], queryFn: () => listNotifications() });
  const membershipQ = useQuery({
    queryKey: ["membership_state", user.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("founding_lifetime, founding_expires_at")
        .eq("id", user.id)
        .maybeSingle();
      return data;
    },
  });

  const groups = groupsQ.data ?? [];
  const active = groups.filter((g: any) => g.status !== "closed");
  const closed = groups.filter((g: any) => g.status === "closed");
  const unread = (notifQ.data ?? []).filter((n: any) => !n.read_at);
  const m: any = membershipQ.data;
  const activeMember =
    !!m?.founding_lifetime ||
    (!!m?.founding_expires_at && new Date(m.founding_expires_at) > new Date());

  return (
    <main className="min-h-[100dvh] bg-background pb-24">
      <div className="mx-auto max-w-md px-5 pt-6">
        <MuselingLogo />
      </div>
      <header className="border-b border-border bg-card/80 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center justify-between gap-3 px-5 py-4">
          <div className="flex items-center gap-3">
            <Users className="h-5 w-5 text-primary" />
            <h1 className="font-display text-2xl">My groups</h1>
          </div>
          <Link
            to={activeMember ? "/billing" : "/join"}
            search={activeMember ? undefined : { back: "/inbox" }}
            className={
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium " +
              (activeMember ? "bg-secondary" : "bg-primary text-primary-foreground")
            }
          >
            <Sparkles className="h-3.5 w-3.5" />
            {activeMember ? "Member" : "Join"}
          </Link>
        </div>
      </header>

      {!activeMember && (
        <section className="mx-auto max-w-md px-5 pt-5">
          <div className="rounded-2xl bg-primary/10 p-4">
            <p className="text-sm font-medium">Membership needed to open the chat</p>
            <p className="mt-1 text-xs text-muted-foreground">
              You can be matched into a group for free, but chat opens once you're a member.
            </p>
            <Link
              to="/join"
              search={{ back: "/inbox" }}
              className="mt-3 inline-flex rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
            >
              See plans
            </Link>
          </div>
        </section>
      )}

      {unread.length > 0 && (
        <section className="mx-auto max-w-md px-5 pt-5">
          <div className="rounded-2xl bg-primary/10 p-4">
            <p className="mb-2 inline-flex items-center gap-1.5 text-xs font-medium text-primary">
              <Bell className="h-3.5 w-3.5" /> {unread.length} new
            </p>
            <ul className="space-y-2">
              {unread.slice(0, 4).map((n: any) => (
                <li key={n.id}>
                  <button
                    onClick={async () => {
                      await markNotificationRead({ data: { id: n.id } });
                      if (n.link) navigate({ to: n.link });
                    }}
                    className="w-full rounded-xl bg-background p-3 text-left text-sm"
                  >
                    <p className="font-medium">{n.title}</p>
                    {n.body && <p className="mt-0.5 text-xs text-muted-foreground">{n.body}</p>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <section className="mx-auto max-w-md space-y-4 px-5 py-6">
        {groupsQ.isLoading && <p className="text-sm text-muted-foreground">Loading your groups…</p>}
        {!groupsQ.isLoading && groups.length === 0 && (
          <div className="rounded-3xl border border-dashed border-border bg-card p-8 text-center">
            <Users className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 font-medium">No groups yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Mark yourself going on a concert with "Join a group chat" enabled — we'll match you.
            </p>
            <Button asChild variant="outline" className="mt-4 rounded-full">
              <Link to="/discover">Browse concerts</Link>
            </Button>
          </div>
        )}

        {active.map((g: any) => (
          <GroupRow key={g.id} g={g} />
        ))}

        {closed.length > 0 && (
          <>
            <p className="pt-4 text-[11px] uppercase tracking-wide text-muted-foreground">Closed</p>
            {closed.map((g: any) => (
              <GroupRow key={g.id} g={g} muted />
            ))}
          </>
        )}
      </section>

      <TabBarSpacer />
      <TabBar />
    </main>
  );
}

function GroupRow({ g, muted }: { g: any; muted?: boolean }) {
  const c = g.concerts;
  const last = g.last_message;
  return (
    <Link
      to="/groups/$id"
      params={{ id: g.id }}
      className={
        "block rounded-3xl bg-card p-5 shadow-sm transition hover:shadow-md " +
        (muted ? "opacity-60" : "")
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate font-display text-lg leading-tight">{c?.name}</h2>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            <MapPin className="mr-1 inline h-3 w-3" />
            {c?.venue}
          </p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-1 text-[10px] font-medium">
          <Users className="h-3 w-3" />
          {g.member_ids?.length ?? 0}
        </span>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        <CalendarDays className="mr-1 inline h-3 w-3" />
        {c?.concert_at
          ? new Date(c.concert_at).toLocaleString(undefined, {
              weekday: "short",
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })
          : ""}
      </p>
      {last && (
        <p className="mt-3 flex items-start gap-1.5 text-xs">
          <MessageCircle className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
          <span className="line-clamp-2 text-foreground/80">
            {last.is_system ? <em>{last.body}</em> : last.body}
          </span>
        </p>
      )}
    </Link>
  );
}
