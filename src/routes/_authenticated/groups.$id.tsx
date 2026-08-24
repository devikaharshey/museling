import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Send,
  Users,
  CalendarDays,
  MapPin,
  LogOut,
  UserPlus,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { TabBar, TabBarSpacer } from "@/components/TabBar";
import {
  getGroupDetails,
  leaveGroup,
  listGroupMessages,
  sendGroupMessage,
} from "@/utils/meetups.functions";
import { followUser, unfollowUser } from "@/utils/follows.functions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/groups/$id")({
  head: () => ({ meta: [{ title: "Group · Museling" }] }),
  component: GroupPage,
});

function initials(name?: string | null) {
  if (!name || name === "a member") return "·";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");
}

function fmtCountdown(iso?: string | null): string {
  if (!iso) return "";
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "happening now";
  const days = Math.floor(ms / 86_400_000);
  if (days >= 1) return `in ${days} day${days === 1 ? "" : "s"}`;
  const hours = Math.floor(ms / 3_600_000);
  return `in ${hours}h`;
}

function GroupPage() {
  const { id } = Route.useParams();
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [followed, setFollowed] = useState<Set<string>>(new Set());

  const foundingQ = useQuery({
    queryKey: ["my_founding", user.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("founding_expires_at")
        .eq("id", user.id)
        .maybeSingle();
      const exp = (data as any)?.founding_expires_at as string | null | undefined;
      return { active: !!exp && new Date(exp) > new Date(), exp: exp ?? null };
    },
  });

  useEffect(() => {
    if (foundingQ.data && !foundingQ.data.active) {
      navigate({ to: "/join", search: { back: `/groups/${id}`, group: id } });
    }
  }, [foundingQ.data, id, navigate]);

  const detailQ = useQuery({
    queryKey: ["group_details", id],
    queryFn: () => getGroupDetails({ data: { groupId: id } }),
    enabled: !!foundingQ.data?.active,
  });
  const msgQ = useQuery({
    queryKey: ["group_messages", id],
    queryFn: () => listGroupMessages({ data: { groupId: id } }),
    enabled: !!foundingQ.data?.active,
  });

  const [draft, setDraft] = useState("");
  const sendMut = useMutation({
    mutationFn: () => sendGroupMessage({ data: { groupId: id, body: draft.trim() } }),
    onSuccess: () => {
      setDraft("");
      qc.invalidateQueries({ queryKey: ["group_messages", id] });
    },
    onError: (e: any) => toast.error(e.message ?? "Couldn't send"),
  });
  const leaveMut = useMutation({
    mutationFn: () => leaveGroup({ data: { groupId: id } }),
    onSuccess: () => {
      toast.success("You've left the group");
      qc.invalidateQueries({ queryKey: ["my_groups"] });
      history.back();
    },
  });

  const scrollerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight });
  }, [msgQ.data?.length]);

  useEffect(() => {
    const channel = supabase
      .channel(`group_chat_messages:${id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "group_chat_messages",
          filter: `group_chat_id=eq.${id}`,
        },
        () => qc.invalidateQueries({ queryKey: ["group_messages", id] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, qc]);

  const chat: any = detailQ.data?.chat;
  const concert: any = chat?.concerts;
  const members = (detailQ.data?.members ?? []) as any[];
  const isClosed = chat?.status === "closed";
  const countdown = useMemo(() => fmtCountdown(concert?.concert_at), [concert?.concert_at]);

  async function toggleFollow(uid: string) {
    if (followed.has(uid)) {
      await unfollowUser({ data: { userId: uid } });
      setFollowed((s) => {
        const n = new Set(s);
        n.delete(uid);
        return n;
      });
    } else {
      await followUser({ data: { userId: uid } });
      setFollowed((s) => new Set(s).add(uid));
    }
  }

  return (
    <main className="flex min-h-[100dvh] flex-col bg-background pb-24">
      <header className="border-b border-border bg-card/90 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center gap-2 px-3 py-3">
          <Button asChild variant="ghost" size="sm" className="rounded-full">
            <Link to="/inbox">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-lg">{concert?.name ?? "Group"}</h1>
            <p className="truncate text-[11px] text-muted-foreground">
              {concert?.venue} · {countdown}
            </p>
          </div>
          {!isClosed && (
            <Button
              variant="ghost"
              size="sm"
              className="rounded-full text-muted-foreground"
              onClick={() => {
                if (confirm("Leave this group? You can't rejoin.")) leaveMut.mutate();
              }}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          )}
        </div>
      </header>

      <section className="mx-auto w-full max-w-md px-5 py-4">
        <div className="rounded-2xl bg-card p-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {isClosed ? "This group has closed" : "Your group"}
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            {members.map((m) => {
              const isMe = m.user_id === user.id;
              const name = m.profiles?.full_name ?? "a member";
              const inner = (
                <>
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="text-[11px]">{initials(name)}</AvatarFallback>
                  </Avatar>
                  <div className="text-xs">
                    <p className="font-medium">{isMe ? "You" : name}</p>
                  </div>
                </>
              );
              return isMe || m.hidden ? (
                <div key={m.id} className="flex items-center gap-2">
                  {inner}
                </div>
              ) : (
                <Link
                  key={m.id}
                  to="/people/$id"
                  params={{ id: m.user_id }}
                  className="flex items-center gap-2 rounded-full px-1 -mx-1 hover:bg-muted/60"
                >
                  {inner}
                </Link>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {concert?.location}
            </span>
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="h-3 w-3" />
              {concert?.concert_at ? new Date(concert.concert_at).toLocaleDateString() : ""}
            </span>
            <span className="inline-flex items-center gap-1">
              <Users className="h-3 w-3" />
              {members.length}/6
            </span>
          </div>
        </div>
      </section>

      {isClosed && (
        <section className="mx-auto w-full max-w-md px-5 pb-4">
          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
            <p className="text-sm font-medium">Keep in touch?</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Follow anyone you'd like to stay connected with.
            </p>
            <div className="mt-3 space-y-2">
              {members
                .filter((m) => m.user_id !== user.id && !m.hidden)
                .map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between gap-3 rounded-xl bg-background px-3 py-2"
                  >
                    <span className="text-sm">{m.profiles?.full_name ?? "a member"}</span>
                    <Button
                      size="sm"
                      variant={followed.has(m.user_id) ? "secondary" : "default"}
                      className="rounded-full"
                      onClick={() => toggleFollow(m.user_id)}
                    >
                      {followed.has(m.user_id) ? (
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
                  </div>
                ))}
            </div>
          </div>
        </section>
      )}

      <section className="mx-auto flex w-full max-w-md flex-1 flex-col px-5">
        <div
          ref={scrollerRef}
          className="flex-1 space-y-2 overflow-y-auto rounded-2xl bg-card p-3"
          style={{ maxHeight: "55dvh" }}
        >
          {(msgQ.data ?? []).length === 0 && (
            <p className="py-8 text-center text-xs text-muted-foreground">
              Say hi — your group is here.
            </p>
          )}
          {(msgQ.data ?? []).map((m: any) => {
            if (m.is_system) {
              return (
                <div key={m.id} className="my-2 text-center">
                  <p className="mx-auto max-w-[85%] text-[11px] italic text-muted-foreground">
                    {m.body}
                  </p>
                </div>
              );
            }
            const mine = m.sender_id === user.id;
            return (
              <div key={m.id} className={"flex " + (mine ? "justify-end" : "justify-start")}>
                <div
                  className={
                    "max-w-[78%] rounded-2xl px-3 py-2 text-sm " +
                    (mine ? "bg-primary text-primary-foreground" : "bg-muted")
                  }
                >
                  {!mine && (
                    <p className="mb-0.5 text-[10px] font-medium opacity-70">{m.display_name}</p>
                  )}
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                </div>
              </div>
            );
          })}
        </div>
        {!isClosed ? (
          <form
            className="mt-3 flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (draft.trim() && !sendMut.isPending) sendMut.mutate();
            }}
          >
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, 300))}
              placeholder="Message your group…"
              className="rounded-full"
              maxLength={300}
            />
            <Button
              type="submit"
              size="icon"
              className="rounded-full"
              disabled={!draft.trim() || sendMut.isPending}
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
        ) : (
          <p className="mt-3 text-center text-[11px] text-muted-foreground">
            This chat is read-only.
          </p>
        )}
      </section>

      <TabBarSpacer />
      <TabBar />
    </main>
  );
}
