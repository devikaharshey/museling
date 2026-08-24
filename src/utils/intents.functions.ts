import { createServerFn } from "@tanstack/react-start";

export const getConcertIntentCounts = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("get_concert_intent_counts");
  if (error) throw new Error(error.message);
  return (data ?? []) as { concert_slug: string; going_count: number }[];
});
