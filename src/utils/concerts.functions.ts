import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const addConcertSchema = z.object({
  concert_name: z.string().min(1).max(200),
  artists: z.array(z.string().min(1).max(120)).max(20).default([]),
  venue: z.string().max(200).optional().nullable(),
  concert_at: z.string().datetime().optional().nullable(),
  genres: z.array(z.string().min(1).max(60)).max(10).default([]),
  programme: z.string().max(4000).optional().nullable(),
  duration_minutes: z.number().int().positive().max(600).optional().nullable(),
  catalog_concert_id: z.string().uuid().optional().nullable(),
});

export const addIndependentConcert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => addConcertSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("user_concerts")
      .insert({
        user_id: context.userId,
        source: "independent",
        concert_name: data.concert_name,
        artists: data.artists,
        venue: data.venue ?? null,
        concert_at: data.concert_at ?? null,
        genres: data.genres,
        programme: data.programme ?? null,
        duration_minutes: data.duration_minutes ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    // First logger fills in any blank catalogue fields (never overwrites existing values).
    // Uses the caller's RLS-scoped client so only admins can actually write; non-admins are
    // silently rejected by the "Admins manage concerts" policy.
    if (data.catalog_concert_id) {
      const { data: existing } = await context.supabase
        .from("concerts")
        .select("venue, concert_at, genre, description")
        .eq("id", data.catalog_concert_id)
        .maybeSingle();
      if (existing) {
        const patch: Record<string, unknown> = {};
        if (!existing.venue && data.venue) patch.venue = data.venue;
        if (!existing.concert_at && data.concert_at) patch.concert_at = data.concert_at;
        if (!existing.genre && data.genres[0]) patch.genre = data.genres[0];
        if (!existing.description && data.programme) patch.description = data.programme;
        if (Object.keys(patch).length) {
          patch.updated_at = new Date().toISOString();
          await context.supabase
            .from("concerts")
            .update(patch as never)
            .eq("id", data.catalog_concert_id);
        }
      }
    }

    return { id: row.id };
  });

const searchSchema = z.object({ q: z.string().trim().max(120) });

export const searchConcertsCatalog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => searchSchema.parse(data))
  .handler(async ({ data, context }) => {
    let query = context.supabase
      .from("concerts")
      .select("id, name, venue, location, concert_at, genre, description")
      .order("concert_at", { ascending: true })
      .limit(15);
    if (data.q.length > 0) {
      const term = `%${data.q.replace(/[%_]/g, "")}%`;
      query = query.or(`name.ilike.${term},venue.ilike.${term}`);
    }
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

const logSchema = z.object({
  user_concert_id: z.string().uuid(),
  rating: z.number().int().min(1).max(5).nullable(),
  notes: z.string().max(4000).nullable(),
  favourite_moment: z.string().max(500).nullable(),
  visibility: z.enum(["public", "private"]).default("public"),
});

export const upsertConcertLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => logSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("concert_logs").upsert(
      {
        user_concert_id: data.user_concert_id,
        user_id: context.userId,
        rating: data.rating,
        notes: data.notes,
        favourite_moment: data.favourite_moment,
        visibility: data.visibility,
      },
      { onConflict: "user_concert_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });
