import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";

// UK viewport bias — Oxford (SW) to east of London (NE)
const BOUNDS = "51.28,-1.35|51.78,0.30";

export const geocodeArea = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ query: z.string().trim().min(2).max(120) }).parse(data))

  .handler(async ({ data }) => {
    const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
    const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
    if (!LOVABLE_API_KEY || !GOOGLE_MAPS_API_KEY) {
      throw new Error("Google Maps connector not configured");
    }
    const params = new URLSearchParams({
      address: data.query,
      region: "uk",
      bounds: BOUNDS,
    });
    const res = await fetch(`${GATEWAY_URL}/maps/api/geocode/json?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": GOOGLE_MAPS_API_KEY,
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Geocoding failed (${res.status}): ${body.slice(0, 200)}`);
    }
    const json = (await res.json()) as {
      status: string;
      results?: Array<{
        formatted_address: string;
        geometry: { location: { lat: number; lng: number } };
      }>;
    };
    if (json.status !== "OK" || !json.results?.length) {
      return { ok: false as const, reason: json.status };
    }
    const r = json.results[0];
    return {
      ok: true as const,
      lat: r.geometry.location.lat,
      lng: r.geometry.location.lng,
      label: r.formatted_address,
    };
  });
