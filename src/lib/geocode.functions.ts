import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

export const geocodeArea = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        query: z.string().trim().min(2).max(120),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const params = new URLSearchParams({
      q: data.query,
      format: "jsonv2",
      limit: "1",
      addressdetails: "1",
    });

    const res = await fetch(`${NOMINATIM_URL}?${params.toString()}`, {
      headers: {
        "User-Agent": "Museling/1.0 (http://localhost:8080/)",
      },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Geocoding failed (${res.status}): ${body.slice(0, 200)}`);
    }

    const results = (await res.json()) as Array<{
      display_name: string;
      lat: string;
      lon: string;
    }>;

    if (!results.length) {
      return {
        ok: false as const,
        reason: "NOT_FOUND",
      };
    }

    const result = results[0];

    return {
      ok: true as const,
      lat: Number(result.lat),
      lng: Number(result.lon),
      label: result.display_name,
    };
  });
