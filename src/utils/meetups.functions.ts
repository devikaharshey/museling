import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MAX_GROUP = 8;
const MIN_GROUP = 3;
const MIN_COMPAT = 0.3;

type Candidate = {
  user_id: string;
  age: number | null;
  include_age: boolean;
  genres: string[];
};

async function fetchProfileNames(
  ids: string[],
): Promise<Array<{ id: string; full_name: string | null }>> {
  if (!ids.length) return [];
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("profiles").select("id, full_name").in("id", ids);
  return (data ?? []) as any[];
}

function jaccard(a: string[], b: string[]): number {
  const A = new Set(a.map((x) => x.toLowerCase()));
  const B = new Set(b.map((x) => x.toLowerCase()));
  if (A.size === 0 && B.size === 0) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const uni = A.size + B.size - inter;
  return uni === 0 ? 0 : inter / uni;
}

function ageScore(a: Candidate, b: Candidate): number {
  if (!a.include_age || !b.include_age || a.age == null || b.age == null) return 0.5;
  const diff = Math.abs(a.age - b.age);
  return Math.max(0, Math.min(1, 1 - diff / 15));
}

function compatibility(a: Candidate, b: Candidate): number {
  return jaccard(a.genres, b.genres) * 0.5 + ageScore(a, b) * 0.5;
}

/**
 * Run matching pass for a single concert. Groups eligible attendees into
 * concert_group_chats of size ≤8. Adds newcomers to existing groups when
 * they have positive average compatibility with current members and space exists.
 * Uses the service-role admin client to bypass RLS for group formation.
 */
export const runConcertMatching = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ concertId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // Authorization: caller must be an admin OR have an active meetup intent
    // for this concert. Prevents any signed-in user from triggering privileged
    // matching runs on arbitrary concerts.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: adminRow }, { data: intentRow }] = await Promise.all([
      supabaseAdmin
        .from("user_roles")
        .select("user_id")
        .eq("user_id", context.userId)
        .eq("role", "admin")
        .maybeSingle(),
      supabaseAdmin
        .from("concert_intents")
        .select("user_id")
        .eq("concert_id", data.concertId)
        .eq("user_id", context.userId)
        .eq("join_group_chat", true)
        .maybeSingle(),
    ]);
    if (!adminRow && !intentRow) {
      throw new Error("Forbidden: must have a meetup intent for this concert");
    }

    const sb: any = supabaseAdmin;
    const concertId = data.concertId;

    // 1. Concert
    const { data: concert } = await sb
      .from("concerts")
      .select("id, name, concert_at")
      .eq("id", concertId)
      .maybeSingle();
    if (!concert) return { ok: false, reason: "no_concert" };

    // 2. Pool
    const { data: intents } = await sb
      .from("concert_intents")
      .select("user_id, join_group_chat")
      .eq("concert_id", concertId)
      .eq("join_group_chat", true);
    const userIds: string[] = Array.from(new Set(((intents ?? []) as any[]).map((r) => r.user_id)));
    if (userIds.length === 0) return { ok: true, formed: 0, added: 0 };

    const { data: profs } = await sb
      .from("profiles")
      .select(
        "id, age, include_age_in_matching, open_to_meetups, genres, account_status, founding_expires_at",
      )
      .in("id", userIds);

    const nowIso = new Date().toISOString();
    const candidates: Candidate[] = ((profs ?? []) as any[])
      .filter(
        (p) =>
          p.open_to_meetups &&
          (p.account_status ?? "active") === "active" &&
          p.founding_expires_at &&
          p.founding_expires_at > nowIso,
      )
      .map((p) => ({
        user_id: p.id,
        age: p.age ?? null,
        include_age: !!p.include_age_in_matching,
        genres: (p.genres ?? []) as string[],
      }));
    if (candidates.length === 0) return { ok: true, formed: 0, added: 0 };

    // 3. Blocks
    const { data: blockRows } = await sb
      .from("blocks")
      .select("blocker_id, blocked_id")
      .in(
        "blocker_id",
        candidates.map((c) => c.user_id),
      );
    const blocked = new Set<string>();
    for (const b of (blockRows ?? []) as any[]) {
      blocked.add(`${b.blocker_id}|${b.blocked_id}`);
      blocked.add(`${b.blocked_id}|${b.blocker_id}`);
    }
    const areBlocked = (a: string, b: string) => blocked.has(`${a}|${b}`);

    // 4. Existing groups for this concert
    const { data: existingChats } = await sb
      .from("concert_group_chats")
      .select("id, status, concert_group_chat_members(user_id, left_at)")
      .eq("concert_id", concertId)
      .in("status", ["forming", "active"]);
    const existing = ((existingChats ?? []) as any[]).map((g) => ({
      id: g.id as string,
      members: (g.concert_group_chat_members ?? [])
        .filter((m: any) => !m.left_at)
        .map((m: any) => m.user_id as string),
    }));

    const alreadyPlaced = new Set<string>();
    for (const g of existing) for (const u of g.members) alreadyPlaced.add(u);

    // 5. Try to add unplaced candidates to existing groups
    const byId = new Map(candidates.map((c) => [c.user_id, c]));
    const unplaced = candidates.filter((c) => !alreadyPlaced.has(c.user_id));

    const closesAt = new Date(
      new Date(concert.concert_at).getTime() + 7 * 24 * 60 * 60 * 1000,
    ).toISOString();
    let addedCount = 0;
    const notify: { user_id: string; group_id: string; kind: "added" | "formed" }[] = [];

    async function addToGroup(groupId: string, user: Candidate) {
      const { error } = await sb
        .from("concert_group_chat_members")
        .insert({ group_chat_id: groupId, user_id: user.user_id });
      if (!error) {
        addedCount++;
        alreadyPlaced.add(user.user_id);
        notify.push({ user_id: user.user_id, group_id: groupId, kind: "added" });
      }
    }

    const stillUnplaced: Candidate[] = [];
    for (const cand of unplaced) {
      const options = existing
        .filter((g) => g.members.length < MAX_GROUP)
        .map((g) => {
          const members = g.members
            .map((id: string) => byId.get(id))
            .filter(Boolean) as Candidate[];
          const blockedInGroup = members.some((m) => areBlocked(cand.user_id, m.user_id));
          if (blockedInGroup) return { g, score: -1 };
          const scores = members.map((m) => compatibility(cand, m));
          const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
          return { g, score: avg };
        })
        .filter((o) => o.score >= MIN_COMPAT)
        .sort((a, b) => b.score - a.score);
      if (options.length) {
        await addToGroup(options[0].g.id, cand);
        options[0].g.members.push(cand.user_id);
      } else {
        stillUnplaced.push(cand);
      }
    }

    // 6. Greedy formation from remaining pool
    let formed = 0;
    const remaining = new Map(stillUnplaced.map((c) => [c.user_id, c]));

    while (remaining.size >= MIN_GROUP) {
      // find pair with highest compat
      const arr = Array.from(remaining.values());
      let best: { a: Candidate; b: Candidate; s: number } | null = null;
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          if (areBlocked(arr[i].user_id, arr[j].user_id)) continue;
          const s = compatibility(arr[i], arr[j]);
          if (s < MIN_COMPAT) continue;
          if (!best || s > best.s) best = { a: arr[i], b: arr[j], s };
        }
      }
      if (!best) break;

      const group: Candidate[] = [best.a, best.b];
      remaining.delete(best.a.user_id);
      remaining.delete(best.b.user_id);

      // grow group up to MAX_GROUP
      while (group.length < MAX_GROUP) {
        let bestAdd: { c: Candidate; s: number } | null = null;
        for (const c of remaining.values()) {
          if (group.some((g) => areBlocked(g.user_id, c.user_id))) continue;
          const scores = group.map((g) => compatibility(g, c));
          const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
          if (avg < MIN_COMPAT) continue;
          if (!bestAdd || avg > bestAdd.s) bestAdd = { c, s: avg };
        }
        if (!bestAdd) break;
        group.push(bestAdd.c);
        remaining.delete(bestAdd.c.user_id);
      }

      if (group.length < MIN_GROUP) {
        // put back
        for (const g of group) remaining.set(g.user_id, g);
        break;
      }

      // insert group
      const { data: chat, error: cErr } = await sb
        .from("concert_group_chats")
        .insert({ concert_id: concertId, status: "active", closes_at: closesAt })
        .select("id")
        .single();
      if (cErr || !chat) break;
      const chatId = (chat as any).id as string;

      await sb
        .from("concert_group_chat_members")
        .insert(group.map((g) => ({ group_chat_id: chatId, user_id: g.user_id })));

      const concertAt = new Date(concert.concert_at).toLocaleDateString();
      await sb.from("group_chat_messages").insert({
        group_chat_id: chatId,
        sender_id: null,
        is_system: true,
        body: `You're all going to ${concert.name} on ${concertAt}. You were matched because you share similar musical tastes. Say hello and maybe grab a drink beforehand.`,
      });

      for (const g of group) {
        notify.push({ user_id: g.user_id, group_id: chatId, kind: "formed" });
      }
      formed++;
    }

    if (notify.length) {
      await sb.from("notifications").insert(
        notify.map((n) => ({
          user_id: n.user_id,
          kind: n.kind === "formed" ? "group_formed" : "group_added",
          title:
            n.kind === "formed"
              ? `Your concert group for ${concert.name} is ready`
              : `You joined a group for ${concert.name}`,
          body:
            n.kind === "formed"
              ? `People with similar taste are going. Say hello ↗`
              : `An open group had room for you — pop in and say hi.`,
          link: `/groups/${n.group_id}`,
          payload: { group_id: n.group_id, concert_id: concertId },
        })),
      );
    }

    return { ok: true, formed, added: addedCount };
  });

/** Toggle attending + join_group_chat for a concert. */
export const setConcertIntent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        concertId: z.string().uuid().nullable(),
        concertSlug: z.string().min(1),
        going: z.boolean(),
        joinGroupChat: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    if (!data.going) {
      await supabase
        .from("concert_intents")
        .delete()
        .eq("user_id", userId)
        .eq("concert_slug", data.concertSlug);
      return { ok: true };
    }

    // upsert intent
    const { data: existing } = await supabase
      .from("concert_intents")
      .select("id")
      .eq("user_id", userId)
      .eq("concert_slug", data.concertSlug)
      .maybeSingle();

    const payload: any = {
      user_id: userId,
      concert_slug: data.concertSlug,
      concert_id: data.concertId,
      join_group_chat: !!data.joinGroupChat,
    };
    if (existing) {
      await supabase
        .from("concert_intents")
        .update({ concert_id: data.concertId, join_group_chat: !!data.joinGroupChat })
        .eq("id", (existing as any).id);
    } else {
      await (supabase.from("concert_intents") as any).insert(payload);
    }
    return { ok: true };
  });

// --- Group read APIs ---

export const listMyGroups = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: memberships, error } = await supabase
      .from("concert_group_chat_members")
      .select("group_chat_id, joined_at, left_at")
      .eq("user_id", userId)
      .is("left_at", null);
    if (error) throw new Error(error.message);
    const groupIds = ((memberships ?? []) as any[]).map((m) => m.group_chat_id);
    if (!groupIds.length) return [];

    const { data: chats } = await supabase
      .from("concert_group_chats")
      .select(
        "id, status, closes_at, created_at, concert_id, concerts(id, name, venue, location, concert_at)",
      )
      .in("id", groupIds);

    const { data: allMembers } = await supabase
      .from("concert_group_chat_members")
      .select("group_chat_id, user_id, left_at")
      .in("group_chat_id", groupIds)
      .is("left_at", null);

    const { data: lastMsgs } = await supabase
      .from("group_chat_messages")
      .select("group_chat_id, body, created_at, is_system")
      .in("group_chat_id", groupIds)
      .order("created_at", { ascending: false })
      .limit(200);

    const memberMap: Record<string, string[]> = {};
    for (const m of (allMembers ?? []) as any[]) {
      (memberMap[m.group_chat_id] ||= []).push(m.user_id);
    }
    const lastByGroup: Record<string, any> = {};
    for (const m of (lastMsgs ?? []) as any[]) {
      if (!lastByGroup[m.group_chat_id]) lastByGroup[m.group_chat_id] = m;
    }

    return ((chats ?? []) as any[]).map((c) => ({
      ...c,
      member_ids: memberMap[c.id] ?? [],
      last_message: lastByGroup[c.id] ?? null,
    }));
  });

export const getGroupDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ groupId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: chat, error } = await supabase
      .from("concert_group_chats")
      .select(
        "id, status, closes_at, concert_id, concerts(id, name, venue, location, concert_at, genre)",
      )
      .eq("id", data.groupId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!chat) throw new Error("Group not found or no access");

    const { data: members } = await supabase
      .from("concert_group_chat_members")
      .select("id, user_id, joined_at, left_at")
      .eq("group_chat_id", data.groupId)
      .is("left_at", null);
    const memberIds = ((members ?? []) as any[]).map((m) => m.user_id);
    const profs = await fetchProfileNames(memberIds);
    const nameMap = new Map(profs.map((p) => [p.id, p.full_name]));

    // Blocks: users I've blocked or who blocked me — hide their names
    const { data: myBlocks } = await supabase
      .from("blocks")
      .select("blocker_id, blocked_id")
      .or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`);
    const hidden = new Set<string>();
    for (const b of (myBlocks ?? []) as any[]) {
      if (b.blocker_id === userId) hidden.add(b.blocked_id);
      if (b.blocked_id === userId) hidden.add(b.blocker_id);
    }

    return {
      chat,
      members: ((members ?? []) as any[]).map((m) => ({
        ...m,
        profiles: {
          full_name: hidden.has(m.user_id) ? "a member" : (nameMap.get(m.user_id) ?? null),
        },
        hidden: hidden.has(m.user_id),
      })),
      myMembership: ((members ?? []) as any[]).find((m) => m.user_id === userId) ?? null,
    };
  });

export const listGroupMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ groupId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: msgs, error } = await supabase
      .from("group_chat_messages")
      .select("id, group_chat_id, sender_id, body, is_system, created_at")
      .eq("group_chat_id", data.groupId)
      .order("created_at", { ascending: true })
      .limit(500);
    if (error) throw new Error(error.message);

    const ids = Array.from(
      new Set(((msgs ?? []) as any[]).map((m) => m.sender_id).filter(Boolean)),
    );
    const profs = await fetchProfileNames(ids as string[]);
    const nameMap = new Map(profs.map((p) => [p.id, p.full_name]));

    // Hidden users (blocks) or users who left → replace name with "a member"
    const { data: currentMembers } = await supabase
      .from("concert_group_chat_members")
      .select("user_id, left_at")
      .eq("group_chat_id", data.groupId);
    const activeMembers = new Set(
      ((currentMembers ?? []) as any[]).filter((m) => !m.left_at).map((m) => m.user_id),
    );
    const { data: myBlocks } = await supabase
      .from("blocks")
      .select("blocker_id, blocked_id")
      .or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`);
    const hidden = new Set<string>();
    for (const b of (myBlocks ?? []) as any[]) {
      if (b.blocker_id === userId) hidden.add(b.blocked_id);
      if (b.blocked_id === userId) hidden.add(b.blocker_id);
    }

    return ((msgs ?? []) as any[]).map((m) => {
      const sid = m.sender_id as string | null;
      const anonymize = !m.is_system && sid && (hidden.has(sid) || !activeMembers.has(sid));
      return {
        ...m,
        display_name: m.is_system
          ? null
          : anonymize
            ? "a member"
            : (nameMap.get(sid ?? "") ?? "Someone"),
      };
    });
  });

export const sendGroupMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ groupId: z.string().uuid(), body: z.string().min(1).max(300) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Gate on active founding membership.
    const { data: profile } = await supabase
      .from("profiles")
      .select("founding_expires_at")
      .eq("id", userId)
      .maybeSingle();
    const exp = (profile as any)?.founding_expires_at as string | null | undefined;
    if (!exp || new Date(exp) <= new Date()) {
      throw new Error("Founding membership required to send messages");
    }
    const { data: row, error } = await supabase
      .from("group_chat_messages")
      .insert({
        group_chat_id: data.groupId,
        sender_id: userId,
        body: data.body,
        is_system: false,
      } as any)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: (row as any).id };
  });

export const leaveGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ groupId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("concert_group_chat_members")
      .update({ left_at: new Date().toISOString() })
      .eq("group_chat_id", data.groupId)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
