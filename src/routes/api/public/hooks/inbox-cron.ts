import { createFileRoute } from "@tanstack/react-router";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type Sb = SupabaseClient<any, "public">;

/**
 * Meetup cron:
 *  1. Close chats where closes_at has passed and status is still active/forming.
 *  2. Notify members the day before their group closes.
 *  3. Send a "log your experience" nudge 1h after each concert.
 */
async function closeExpiredGroups(sb: Sb, stats: Record<string, number>) {
  const nowIso = new Date().toISOString();
  const { data: due } = await sb
    .from("concert_group_chats")
    .select("id, concert_id, concerts(name)")
    .lte("closes_at", nowIso)
    .neq("status", "closed");
  for (const g of (due ?? []) as any[]) {
    await sb.from("concert_group_chats").update({ status: "closed" }).eq("id", g.id);
    stats.closed++;
  }
}

async function notifyClosingSoon(sb: Sb, stats: Record<string, number>) {
  const soon = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();
  const { data: rows } = await sb
    .from("concert_group_chats")
    .select(
      "id, closes_at, concert_id, concerts(name), concert_group_chat_members(user_id, left_at)",
    )
    .gt("closes_at", now)
    .lte("closes_at", soon)
    .eq("status", "active");
  for (const g of (rows ?? []) as any[]) {
    // dedupe via notifications kind + payload key
    const active = (g.concert_group_chat_members ?? [])
      .filter((m: any) => !m.left_at)
      .map((m: any) => m.user_id);
    for (const uid of active) {
      const { data: exists } = await sb
        .from("notifications")
        .select("id")
        .eq("user_id", uid)
        .eq("kind", "group_closing")
        .contains("payload", { group_id: g.id })
        .maybeSingle();
      if (exists) continue;
      await sb.from("notifications").insert({
        user_id: uid,
        kind: "group_closing",
        title: `Your group chat for ${g.concerts?.name ?? "the concert"} closes tomorrow`,
        body: "Any connections you'd like to keep? Follow each other on Museling.",
        link: `/groups/${g.id}`,
        payload: { group_id: g.id },
      });
      stats.closingNotified++;
    }
  }
}

async function notifyPostConcertLog(sb: Sb, stats: Record<string, number>) {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();
  const { data: rows } = await sb
    .from("concert_group_chats")
    .select(
      "id, concert_id, concerts(name, concert_at), concert_group_chat_members(user_id, left_at)",
    )
    .in("status", ["active", "forming"]);
  for (const g of (rows ?? []) as any[]) {
    const cAt = g.concerts?.concert_at;
    if (!cAt) continue;
    if (cAt > oneHourAgo) continue; // concert hasn't ended yet (+1h)
    if (cAt > now) continue;
    const active = (g.concert_group_chat_members ?? [])
      .filter((m: any) => !m.left_at)
      .map((m: any) => m.user_id);
    for (const uid of active) {
      const { data: exists } = await sb
        .from("notifications")
        .select("id")
        .eq("user_id", uid)
        .eq("kind", "log_prompt")
        .contains("payload", { group_id: g.id })
        .maybeSingle();
      if (exists) continue;
      await sb.from("notifications").insert({
        user_id: uid,
        kind: "log_prompt",
        title: `How was ${g.concerts?.name ?? "the concert"}?`,
        body: "Log your experience and share it with your group.",
        link: `/log`,
        payload: { group_id: g.id, concert_id: g.concert_id },
      });
      stats.logNotified++;
    }
  }
}

export const Route = createFileRoute("/api/public/hooks/inbox-cron")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const cronSecret = process.env.CRON_SECRET;
        const provided = request.headers.get("x-cron-secret");
        if (!cronSecret || !provided || provided !== cronSecret) {
          return new Response("Forbidden", { status: 403 });
        }

        const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
        const stats = { closed: 0, closingNotified: 0, logNotified: 0 };
        try {
          await closeExpiredGroups(sb, stats);
          await notifyClosingSoon(sb, stats);
          await notifyPostConcertLog(sb, stats);
        } catch (e) {
          console.error("inbox-cron error", e);
        }
        return Response.json({ ok: true, ...stats });
      },
    },
  },
});
