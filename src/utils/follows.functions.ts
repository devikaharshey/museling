import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const followUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.userId === userId) throw new Error("You can't follow yourself");
    const { error } = await (supabase.from("follows") as any).upsert(
      { follower_id: userId, followed_id: data.userId },
      { onConflict: "follower_id,followed_id", ignoreDuplicates: true },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const unfollowUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("follows")
      .delete()
      .eq("follower_id", userId)
      .eq("followed_id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getFollowState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: rows } = await supabase
      .from("follows")
      .select("follower_id, followed_id")
      .or(
        `and(follower_id.eq.${userId},followed_id.eq.${data.userId}),and(follower_id.eq.${data.userId},followed_id.eq.${userId})`,
      );
    const iFollow = ((rows ?? []) as any[]).some(
      (r) => r.follower_id === userId && r.followed_id === data.userId,
    );
    const followsMe = ((rows ?? []) as any[]).some(
      (r) => r.follower_id === data.userId && r.followed_id === userId,
    );
    return { iFollow, followsMe };
  });
