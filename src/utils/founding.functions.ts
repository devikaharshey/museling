import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GROUP_SIZE = 8;

type Cand = {
  user_id: string;
  full_name: string | null;
  age: number | null;
  include_age: boolean;
  genres: string[];
};

function jaccard(a: string[], b: string[]): number {
  const A = new Set(a.map((x) => x.toLowerCase()));
  const B = new Set(b.map((x) => x.toLowerCase()));
  if (A.size === 0 && B.size === 0) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const uni = A.size + B.size - inter;
  return uni === 0 ? 0 : inter / uni;
}
function ageScore(a: Cand, b: Cand): number {
  if (!a.include_age || !b.include_age || a.age == null || b.age == null) return 0.5;
  return Math.max(0, Math.min(1, 1 - Math.abs(a.age - b.age) / 15));
}
function compat(a: Cand, b: Cand): number {
  return jaccard(a.genres, b.genres) * 0.5 + ageScore(a, b) * 0.5;
}

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("user_id")
    .eq("user_id", userId)
    .eq("role", "admin")
    .limit(1);
  if (error) throw new Error(`Admin check failed: ${error.message}`);
  if (!data || data.length === 0) throw new Error("Forbidden: admin only");
}

/** List concerts with ≥ GROUP_SIZE join_group_chat attendees, with counts. */
export const listFoundingEligibleConcerts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const nowIso = new Date().toISOString();

    const { data: intents } = await supabaseAdmin
      .from("concert_intents")
      .select("user_id, concert_id")
      .eq("join_group_chat", true)
      .not("concert_id", "is", null);

    const counts = new Map<string, Set<string>>();
    for (const r of (intents ?? []) as any[]) {
      if (!counts.has(r.concert_id)) counts.set(r.concert_id, new Set());
      counts.get(r.concert_id)!.add(r.user_id);
    }
    const eligibleIds = Array.from(counts.entries())
      .filter(([, s]) => s.size >= GROUP_SIZE)
      .map(([id]) => id);
    if (!eligibleIds.length) return [];

    const { data: concerts } = await supabaseAdmin
      .from("concerts")
      .select("id, name, venue, location, concert_at, genre")
      .in("id", eligibleIds)
      .gte("concert_at", nowIso)
      .order("concert_at", { ascending: true });

    // Exclude concerts that already have an active/pending founding group.
    const { data: chats } = await supabaseAdmin
      .from("concert_group_chats")
      .select("concert_id, status")
      .in("concert_id", eligibleIds);
    const used = new Set(
      ((chats ?? []) as any[])
        .filter((c) => c.status === "pending_payment" || c.status === "active")
        .map((c) => c.concert_id),
    );

    return ((concerts ?? []) as any[])
      .filter((c) => !used.has(c.id))
      .map((c) => ({ ...c, attendee_count: counts.get(c.id)?.size ?? 0 }));
  });

/** Suggest the 8 most compatible attendees for a concert (or fewer if pool is smaller). */
export const suggestFoundingGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ concertId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: intents } = await supabaseAdmin
      .from("concert_intents")
      .select("user_id")
      .eq("concert_id", data.concertId)
      .eq("join_group_chat", true);
    const userIds = Array.from(new Set(((intents ?? []) as any[]).map((r) => r.user_id)));
    if (!userIds.length) return { candidates: [] as Cand[] };

    const { data: profs } = await supabaseAdmin
      .from("profiles")
      .select(
        "id, full_name, age, include_age_in_matching, open_to_meetups, genres, account_status",
      )
      .in("id", userIds);

    const cands: Cand[] = ((profs ?? []) as any[])
      .filter((p) => p.open_to_meetups && (p.account_status ?? "active") === "active")
      .map((p) => ({
        user_id: p.id,
        full_name: p.full_name ?? null,
        age: p.age ?? null,
        include_age: !!p.include_age_in_matching,
        genres: (p.genres ?? []) as string[],
      }));
    if (cands.length < 2) return { candidates: cands };

    // Blocks
    const { data: blockRows } = await supabaseAdmin
      .from("blocks")
      .select("blocker_id, blocked_id")
      .in(
        "blocker_id",
        cands.map((c) => c.user_id),
      );
    const blocked = new Set<string>();
    for (const b of (blockRows ?? []) as any[]) {
      blocked.add(`${b.blocker_id}|${b.blocked_id}`);
      blocked.add(`${b.blocked_id}|${b.blocker_id}`);
    }
    const isBlocked = (a: string, b: string) => blocked.has(`${a}|${b}`);

    // Greedy: seed with best-scoring pair, then add highest-avg-compat.
    let best: { a: Cand; b: Cand; s: number } | null = null;
    for (let i = 0; i < cands.length; i++) {
      for (let j = i + 1; j < cands.length; j++) {
        if (isBlocked(cands[i].user_id, cands[j].user_id)) continue;
        const s = compat(cands[i], cands[j]);
        if (!best || s > best.s) best = { a: cands[i], b: cands[j], s };
      }
    }
    if (!best) return { candidates: cands.slice(0, GROUP_SIZE) };

    const group: Cand[] = [best.a, best.b];
    const pool = cands.filter(
      (c) => c.user_id !== best!.a.user_id && c.user_id !== best!.b.user_id,
    );
    while (group.length < GROUP_SIZE && pool.length) {
      let pick: { c: Cand; s: number; i: number } | null = null;
      for (let i = 0; i < pool.length; i++) {
        const c = pool[i];
        if (group.some((g) => isBlocked(g.user_id, c.user_id))) continue;
        const s = group.reduce((sum, g) => sum + compat(g, c), 0) / group.length;
        if (!pick || s > pick.s) pick = { c, s, i };
      }
      if (!pick) break;
      group.push(pick.c);
      pool.splice(pick.i, 1);
    }
    return { candidates: group };
  });

/** Create a pending_payment group chat + notify each member with a pay link. */
export const inviteFoundingGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        concertId: z.string().uuid(),
        userIds: z.array(z.string().uuid()).min(2).max(GROUP_SIZE),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: concert } = await supabaseAdmin
      .from("concerts")
      .select("id, name, concert_at")
      .eq("id", data.concertId)
      .maybeSingle();
    if (!concert) throw new Error("Concert not found");

    const closesAt = new Date(
      new Date((concert as any).concert_at).getTime() + 7 * 24 * 60 * 60 * 1000,
    ).toISOString();

    const { data: chat, error: cErr } = await (supabaseAdmin.from("concert_group_chats") as any)
      .insert({ concert_id: data.concertId, status: "pending_payment", closes_at: closesAt })
      .select("id")
      .single();
    if (cErr || !chat) throw new Error(cErr?.message ?? "Could not create group");
    const groupId = (chat as any).id as string;

    await (supabaseAdmin.from("concert_group_chat_members") as any).insert(
      data.userIds.map((uid) => ({ group_chat_id: groupId, user_id: uid })),
    );

    await (supabaseAdmin.from("group_chat_messages") as any).insert({
      group_chat_id: groupId,
      sender_id: null,
      is_system: true,
      body: `You've been matched into a group of ${data.userIds.length} for ${(concert as any).name}. The chat opens once members join Museling membership.`,
    });

    await (supabaseAdmin.from("notifications") as any).insert(
      data.userIds.map((uid) => ({
        user_id: uid,
        kind: "founding_invite",
        title: `You're matched for ${(concert as any).name}`,
        body: `Unlock the group chat and ongoing matching — from £5/month.`,
        link: `/join?back=/groups/${groupId}&group=${groupId}`,
        payload: { group_id: groupId, concert_id: data.concertId },
      })),
    );

    return { ok: true, groupId };
  });

/** Fetch invite details for the pay page — only members of the group can read. */
export const getFoundingInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ groupId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // RLS on group members enforces access.
    const { data: chat, error } = await supabase
      .from("concert_group_chats")
      .select("id, status, closes_at, concerts(id, name, venue, location, concert_at, genre)")
      .eq("id", data.groupId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!chat) throw new Error("Invite not found or no access");

    const { data: profile } = await supabase
      .from("profiles")
      .select("founding_expires_at")
      .eq("id", userId)
      .maybeSingle();
    const exp = (profile as any)?.founding_expires_at as string | null | undefined;
    const active = !!exp && new Date(exp) > new Date();

    return { chat, hasActiveFounding: active, foundingExpiresAt: exp ?? null };
  });
