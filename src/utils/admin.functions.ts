import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function isAdminUser(userId: string): Promise<boolean> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("user_id")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return !!data;
}

async function assertAdmin(ctx: { userId: string }) {
  if (!(await isAdminUser(ctx.userId))) throw new Error("Forbidden: admin only");
}

export const listConcertsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const todayIso = new Date().toISOString().slice(0, 10);
    const { data, error } = await context.supabase
      .from("concerts")
      .select("id, name, venue, location, genre, concert_at, ticket_price_pence, capacity")
      .gte("concert_at", todayIso)
      .order("concert_at", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const concertSchema = z.object({
  name: z.string().min(1).max(200),
  venue: z.string().min(1).max(200),
  location: z.string().min(1).max(200),
  concert_at: z.string().datetime(),
  genre: z.string().min(1).max(60),
  ticket_price_pence: z.number().int().min(0).max(100_000),
  capacity: z.number().int().min(1).max(50).default(6),
  description: z.string().max(2000).optional().nullable(),
});

export const createConcertAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => concertSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: row, error } = await context.supabase
      .from("concerts")
      .insert({
        name: data.name,
        venue: data.venue,
        location: data.location,
        concert_at: data.concert_at,
        genre: data.genre,
        ticket_price_pence: data.ticket_price_pence,
        capacity: data.capacity,
        description: data.description ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: (row as any).id };
  });

export const checkIsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    return { isAdmin: await isAdminUser(context.userId) };
  });

export const listAttendanceAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: intents, error } = await supabaseAdmin
      .from("concert_intents")
      .select(
        "id, user_id, concert_slug, concert_id, companion_mode, companion_count, join_group_chat, created_at",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const rows = intents ?? [];
    const userIds = Array.from(new Set(rows.map((r: any) => r.user_id)));
    const concertIds = Array.from(new Set(rows.map((r: any) => r.concert_id).filter(Boolean)));
    const [profilesRes, concertsRes] = await Promise.all([
      userIds.length
        ? supabaseAdmin.from("profiles").select("id, full_name").in("id", userIds)
        : Promise.resolve({ data: [] as any[], error: null }),
      concertIds.length
        ? supabaseAdmin
            .from("concerts")
            .select("id, name, venue, concert_at")
            .in("id", concertIds as string[])
        : Promise.resolve({ data: [] as any[], error: null }),
    ]);
    const pMap = new Map<string, any>();
    for (const p of (profilesRes.data as any[]) ?? []) pMap.set(p.id, p);
    const cMap = new Map<string, any>();
    for (const c of (concertsRes.data as any[]) ?? []) cMap.set(c.id, c);
    return rows.map((r: any) => ({
      ...r,
      profile: pMap.get(r.user_id) ?? null,
      concert: r.concert_id ? (cMap.get(r.concert_id) ?? null) : null,
    }));
  });
