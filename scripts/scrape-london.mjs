/**
 * Scrape upcoming London events from Bachtrack listing pages and upsert into
 * public.concerts. Everything (title, venue, coords, timestamps, ticket link)
 * is available directly on the listing cards — no detail page or Google
 * geocoding needed.
 *
 * Env required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Usage:        node scripts/scrape-london.mjs [maxEvents=250]
 */
import { createClient } from "@supabase/supabase-js";
import * as cheerio from "cheerio";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY)
  throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");

const MAX = Number(process.argv[2] ?? 250);
const UA = "Mozilla/5.0 (compatible; MuselingBot/1.0; +https://museling.app)";

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Slash-joined slices — Bachtrack shows ~50 per URL and paginates via AJAX,
// so we widen the net with category filters.
const SLICES = [
  "city=london",
  "city=london/category=1",
  "city=london/category=2",
  "city=london/category=3",
  "city=london/category=4",
  "city=london/category=8",
];

function parseCard($, el) {
  const $el = $(el);
  const id = $el.attr("data-id");
  const dates = $el.attr("data-dates") ?? "";
  const [startStr] = dates.split(",");
  const startUnix = Number(startStr);
  if (!id || !Number.isFinite(startUnix) || startUnix <= 0) return null;

  const title = $el.find(".li-shortform-title").first().text().trim();
  const venueLinks = $el.find(".li-shortform-venue h2 a");
  const venue = venueLinks.eq(0).text().trim();
  const city = venueLinks.eq(1).text().trim() || "London";

  // lat/lng from the Google Maps link
  let lat = null,
    lng = null;
  const mapHref = $el.find("a.listing-maplink-shortform").attr("href") ?? "";
  const geoMatch = mapHref.match(/query=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (geoMatch) {
    lat = Number(geoMatch[1]);
    lng = Number(geoMatch[2]);
  }

  // slug (canonical event URL) — first /XYZ-event/...
  let slug = "";
  $el.find("a[href]").each((_, a) => {
    const h = $(a).attr("href") ?? "";
    if (!slug && /^\/[a-z-]+-event\/[^"?#]+\/\d+$/.test(h)) slug = h;
  });

  // Ticket handler link
  const handlerHref =
    $el.find("a.listing-buy-tickets").first().attr("href") ??
    $el.find("a[href*='/handler/listing/click/']").first().attr("href") ??
    "";
  const bookingUrl = handlerHref
    ? handlerHref.startsWith("http")
      ? handlerHref
      : `https://bachtrack.com${handlerHref}`
    : slug
      ? `https://bachtrack.com${slug}`
      : "";

  return {
    id,
    title,
    venue,
    city,
    lat,
    lng,
    startISO: new Date(startUnix * 1000).toISOString(),
    slug: slug ? `https://bachtrack.com${slug}` : "",
    bookingUrl,
  };
}

async function scrapeSlice(slug) {
  const url = `https://bachtrack.com/search-events/${slug}`;
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "en-GB,en" } });
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  const html = await res.text();
  const $ = cheerio.load(html);
  const rows = [];
  $("[data-id][data-dates]").each((_, el) => {
    const c = parseCard($, el);
    if (c) rows.push(c);
  });
  return rows;
}

// ---- Collect ----------------------------------------------------------------
const collected = new Map();
for (const slug of SLICES) {
  if (collected.size >= MAX) break;
  try {
    const rows = await scrapeSlice(slug);
    let added = 0;
    for (const r of rows) {
      if (!collected.has(r.id)) {
        collected.set(r.id, r);
        added += 1;
      }
      if (collected.size >= MAX) break;
    }
    console.log(`slice ${slug}: +${added} (total ${collected.size})`);
  } catch (e) {
    console.warn(`slice ${slug} failed: ${e.message}`);
  }
  await sleep(400);
}

// ---- Insert -----------------------------------------------------------------
const now = Date.now();
let inserted = 0,
  skippedPast = 0,
  skippedExisting = 0,
  missingGeo = 0,
  failed = 0;

for (const [id, c] of collected) {
  if (new Date(c.startISO).getTime() < now) {
    skippedPast += 1;
    continue;
  }
  if (c.lat == null || c.lng == null) {
    missingGeo += 1;
    continue;
  }
  if (!c.venue) {
    failed += 1;
    continue;
  }

  const { data: existing } = await sb
    .from("concerts")
    .select("id")
    .eq("source", "bachtrack")
    .eq("external_id", id)
    .maybeSingle();
  if (existing) {
    skippedExisting += 1;
    continue;
  }

  const row = {
    name: c.title,
    venue: c.venue,
    location: `${c.venue}, ${c.city}`,
    concert_at: c.startISO,
    genre: "classical",
    ticket_price_pence: 0, // Bachtrack listing pages don't expose price; treat as TBC (0 = "Free/TBC" fallback)
    capacity: 6,
    description: `Sourced from Bachtrack. ${c.slug || c.bookingUrl}`,
    booking_url: c.bookingUrl || c.slug,
    lat: c.lat,
    lng: c.lng,
    city: c.city,
    source: "bachtrack",
    external_id: id,
  };
  const { error } = await sb.from("concerts").insert(row);
  if (error) {
    console.warn(`insert ${id} failed: ${error.message}`);
    failed += 1;
  } else {
    inserted += 1;
    if (inserted % 20 === 0) console.log(`  inserted ${inserted}…`);
  }
}

console.log(
  `\nDone. inserted=${inserted}, skippedExisting=${skippedExisting}, skippedPast=${skippedPast}, missingGeo=${missingGeo}, failed=${failed}, collected=${collected.size}`,
);
