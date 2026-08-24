import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const affinityLevels = ["boost", "neutral", "reduce", "rare"] as const;

async function assertAdmin(ctx: { userId: string }) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("user_id")
    .eq("user_id", ctx.userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin only");
}

// ---------- Affinity ----------
export const getAffinityFor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ targetUserId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("affinity_preferences")
      .select("preference_level, updated_at")
      .eq("user_id", context.userId)
      .eq("target_user_id", data.targetUserId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row ?? { preference_level: "neutral" as const, updated_at: null };
  });

export const setAffinity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        targetUserId: z.string().uuid(),
        level: z.enum(affinityLevels),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    if (data.targetUserId === context.userId) throw new Error("Cannot set affinity on yourself");
    const { error } = await context.supabase.from("affinity_preferences").upsert(
      {
        user_id: context.userId,
        target_user_id: data.targetUserId,
        preference_level: data.level,
      },
      { onConflict: "user_id,target_user_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Blocks ----------
export const getBlockState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ targetUserId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("blocks")
      .select("id, extend_to_network, created_at")
      .eq("blocker_id", context.userId)
      .eq("blocked_id", data.targetUserId)
      .maybeSingle();
    return { blocked: !!row, extendToNetwork: !!row?.extend_to_network, id: row?.id ?? null };
  });

export const setBlock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        targetUserId: z.string().uuid(),
        extendToNetwork: z.boolean().default(false),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    if (data.targetUserId === context.userId) throw new Error("Cannot block yourself");
    const { error } = await context.supabase.from("blocks").upsert(
      {
        blocker_id: context.userId,
        blocked_id: data.targetUserId,
        extend_to_network: data.extendToNetwork,
      },
      { onConflict: "blocker_id,blocked_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeBlock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ targetUserId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("blocks")
      .delete()
      .eq("blocker_id", context.userId)
      .eq("blocked_id", data.targetUserId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Reports ----------
export const submitReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        reportedUserId: z.string().uuid(),
        eventId: z.string().uuid().nullable().optional(),
        description: z.string().trim().min(5).max(4000),
        evidenceUrl: z.string().max(500).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    if (data.reportedUserId === context.userId) throw new Error("Cannot report yourself");
    const { data: row, error } = await context.supabase
      .from("reports")
      .insert({
        reporter_id: context.userId,
        reported_user_id: data.reportedUserId,
        event_id: data.eventId ?? null,
        description: data.description,
        evidence_url: data.evidenceUrl ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

// ---------- Person summary (safe public fields only) ----------
const PUBLIC_PROFILE_COLS = "id, full_name, genres, account_status" as const;

async function fetchPublicProfiles(ids: string[]) {
  if (!ids.length)
    return [] as Array<{
      id: string;
      full_name: string | null;
      genres: string[] | null;
      account_status: string;
    }>;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select(PUBLIC_PROFILE_COLS)
    .in("id", ids);
  if (error) throw new Error(error.message);
  return (data ?? []) as any[];
}

export const getPersonProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const rows = await fetchPublicProfiles([data.userId]);
    return rows[0] ?? null;
  });

export const listPublicProfiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ ids: z.array(z.string().uuid()).max(200) }).parse(d))
  .handler(async ({ data }) => {
    return fetchPublicProfiles(data.ids);
  });

// ---------- Admin: reports ----------
export const listReportsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data: reports, error } = await context.supabase
      .from("reports")
      .select(
        "id, reported_user_id, event_id, description, evidence_url, status, created_at, resolved_at",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const userIds = Array.from(new Set((reports ?? []).map((r: any) => r.reported_user_id)));
    let nameById = new Map<string, string>();
    let statusById = new Map<string, string>();
    if (userIds.length) {
      const { data: profs } = await context.supabase
        .from("profiles")
        .select("id, full_name, account_status")
        .in("id", userIds);
      nameById = new Map((profs ?? []).map((p: any) => [p.id, p.full_name]));
      statusById = new Map((profs ?? []).map((p: any) => [p.id, p.account_status]));
    }
    return (reports ?? []).map((r: any) => ({
      ...r,
      reported_user_name: nameById.get(r.reported_user_id) ?? null,
      reported_user_account_status: statusById.get(r.reported_user_id) ?? "active",
    }));
  });

export const updateReportStatusAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        reportId: z.string().uuid(),
        status: z.enum([
          "pending",
          "under_review",
          "resolved_no_action",
          "resolved_warning",
          "resolved_suspended",
          "resolved_banned",
        ]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("reports")
      .update({ status: data.status })
      .eq("id", data.reportId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const signEvidenceUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ path: z.string().min(1).max(500) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: signed, error } = await context.supabase.storage
      .from("report-evidence")
      .createSignedUrl(data.path, 60 * 10);
    if (error) throw new Error(error.message);
    return { url: signed?.signedUrl ?? null };
  });
