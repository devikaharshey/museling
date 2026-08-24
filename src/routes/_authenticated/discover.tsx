import { MuselingLogo } from "@/components/MuselingLogo";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { TabBar, TabBarSpacer } from "@/components/TabBar";
import { useGeolocation } from "@/hooks/use-geolocation";
import { ArrowUpDown, Check, Crosshair, MapPin, Navigation, Search, Users, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { MarkerClusterer } from "@googlemaps/markerclusterer";
import { useServerFn } from "@tanstack/react-start";
import { geocodeArea } from "@/lib/geocode.functions";
import { runConcertMatching } from "@/utils/meetups.functions";
import { getConcertIntentCounts } from "@/utils/intents.functions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type CompanionMode = "solo_happy" | "meet_others" | "group_open";

export const Route = createFileRoute("/_authenticated/discover")({
  head: () => ({ meta: [{ title: "Discover · Museling" }] }),
  component: Discover,
});

const OXFORD = { lat: 51.752, lng: -1.2577 };
const LONDON = { lat: 51.5074, lng: -0.1278 };
// Bounds that comfortably contain Oxford + Greater London
const DEFAULT_BOUNDS_SW = { lat: 51.28, lng: -1.35 };
const DEFAULT_BOUNDS_NE = { lat: 51.78, lng: 0.3 };

function formatDbDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const day = d.toLocaleDateString("en-GB", { weekday: "short" });
  const dm = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const t = d
    .toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true })
    .toLowerCase()
    .replace(" ", "");
  return `${day} ${dm} · ${t}`;
}
function formatDbPrice(pence: number | null, maxPence?: number | null): string {
  if (pence == null || pence <= 0) return "Free";
  const fmt = (p: number) => {
    const pounds = p / 100;
    return `£${pounds % 1 === 0 ? pounds.toFixed(0) : pounds.toFixed(2)}`;
  };
  if (maxPence != null && maxPence > pence) return `${fmt(pence)}–${fmt(maxPence)}`;
  return fmt(pence);
}

type ConcertPin = {
  id: string;
  title: string;
  venue: string;
  address: string;
  position: { lat: number; lng: number };
  dateLabel: string;
  priceLabel: string;
  url: string;
  blurb?: string;
  genres: string[];
  eras: string[];
  formats: string[];
  newArtists?: boolean;
};

const CONCERTS: ConcertPin[] = [
  {
    id: "luck-be-a-lady",
    title: "Luck Be A Lady — LP Swing Orchestra",
    venue: "Festival Hall, Magdalen College School",
    address: "Cowley Place, Oxford OX4 1DZ",
    position: { lat: 51.7505, lng: -1.2417 },
    dateLabel: "Fri 10 Jul 2026 · 7:30pm",
    priceLabel: "£5 – £30",
    url: "https://www.ticketsoxford.com/events/luck-be-a-lady",
    blurb:
      "LP Swing Orchestra with Georgina Jackson, Nicola Emmanuelle & Julia Sullivan — a 16-piece big band celebration of swing.",
    genres: ["jazz"],
    eras: ["20th-century"],
    formats: ["big-band"],
  },
  {
    id: "aera-ensemble",
    title: "Aera Ensemble — Oxford Coffee Concerts",
    venue: "Holywell Music Room",
    address: "Holywell Street, Oxford OX1 3SD",
    position: { lat: 51.7556, lng: -1.253 },
    dateLabel: "Sun 5 Jul 2026 · 11:15am",
    priceLabel: "£8.50 – £17",
    url: "https://www.ticketsoxford.com/events/aera-ensemble",
    blurb:
      "Mozart Kegelstatt Trio, Bruch Eight Pieces, Bartók Contrasts — piano, violin/viola & clarinet.",
    genres: ["classical", "chamber"],
    eras: ["classical-era", "romantic", "20th-century"],
    formats: ["trio"],
  },
  {
    id: "early-career-artist-showcase",
    title: "Early Career Artist Showcase",
    venue: "Christ Church Cathedral",
    address: "St Aldate's, Oxford OX1 1DP",
    position: { lat: 51.7503, lng: -1.2556 },
    dateLabel: "Tue 7 Jul 2026 · 8:00pm",
    priceLabel: "£0 – £20",
    url: "https://www.ticketsoxford.com/events/early-career-artist-showcase",
    blurb: "Curated by Elizabeth Nurse — young UK baroque artists with IT&T ensemble players.",
    genres: ["classical", "baroque", "early"],
    eras: ["baroque"],
    formats: ["ensemble"],
    newArtists: true,
  },
  {
    id: "mathilde-milwidsky-viv-mclean",
    title: "Mathilde Milwidsky & Viv McLean",
    venue: "Holywell Music Room",
    address: "Holywell Street, Oxford OX1 3SD",
    position: { lat: 51.7556, lng: -1.253 },
    dateLabel: "Sun 12 Jul 2026 · 11:15am",
    priceLabel: "£8.50 – £17",
    url: "https://www.ticketsoxford.com/events/mathilde-milwidsky-viv-mclean",
    blurb: "Boulanger, Beethoven Violin Sonata op.30 no.3, Telemann Fantasia no.7.",
    genres: ["classical", "chamber"],
    eras: ["baroque", "classical-era", "20th-century"],
    formats: ["duo"],
  },
  {
    id: "madrigals-on-the-river-3",
    title: "Madrigals on the River",
    venue: "Magdalen College School",
    address: "Cowley Place, Oxford OX4 1DZ",
    position: { lat: 51.7505, lng: -1.2417 },
    dateLabel: "Fri 3 Jul 2026 · 8:00pm",
    priceLabel: "£15",
    url: "https://www.ticketsoxford.com/events/madrigals-on-the-river-3",
    blurb: "Magdalen College School · 1hr 30mins",
    genres: ["classical", "early"],
    eras: ["20th-century"],
    formats: ["ensemble"],
  },
  {
    id: "sacr%C3%A9-et-profane-of-the-ancien-r%C3%A9gime",
    title: "Sacré et Profane of the Ancien Régime",
    venue: "Christ Church Cathedral",
    address: "St Aldate\'s, Oxford OX1 1DP",
    position: { lat: 51.7503, lng: -1.2556 },
    dateLabel: "Tue 14 Jul 2026 · 8:00pm",
    priceLabel: "£10 – £25",
    url: "https://www.ticketsoxford.com/events/sacr%C3%A9-et-profane-of-the-ancien-r%C3%A9gime",
    blurb: "Christ Church Cathedral · 1hr",
    genres: ["baroque", "classical", "early"],
    eras: ["baroque"],
    formats: ["ensemble"],
  },
  {
    id: "an-evening-of-beethoven-2",
    title: "An Evening of Beethoven",
    venue: "Holywell Music Room",
    address: "Holywell Street, Oxford OX1 3SD",
    position: { lat: 51.7556, lng: -1.253 },
    dateLabel: "Wed 15 Jul 2026 · 8:00pm",
    priceLabel: "£15 – £25",
    url: "https://www.ticketsoxford.com/events/an-evening-of-beethoven-2",
    blurb: "Holywell Music Room · 2hrs",
    genres: ["classical"],
    eras: ["classical-era", "romantic"],
    formats: ["ensemble"],
  },
  {
    id: "adderbury-ensemble-viv-mclean",
    title: "Adderbury Ensemble & Viv Mclean",
    venue: "Holywell Music Room",
    address: "Holywell Street, Oxford OX1 3SD",
    position: { lat: 51.7556, lng: -1.253 },
    dateLabel: "Sun 19 Jul 2026 · 11:15am",
    priceLabel: "£8.50 – £17",
    url: "https://www.ticketsoxford.com/events/adderbury-ensemble-viv-mclean",
    blurb: "Holywell Music Room · 1hr",
    genres: ["chamber", "classical"],
    eras: ["20th-century"],
    formats: ["ensemble"],
  },
  {
    id: "an-evening-of-gershwin-the-roaring-20s",
    title: "An Evening of Gershwin: The Roaring 20s",
    venue: "Holywell Music Room",
    address: "Holywell Street, Oxford OX1 3SD",
    position: { lat: 51.7556, lng: -1.253 },
    dateLabel: "Sun 19 Jul 2026 · 8:00pm",
    priceLabel: "£15 – £25",
    url: "https://www.ticketsoxford.com/events/an-evening-of-gershwin-the-roaring-20s",
    blurb: "Holywell Music Room · 2hrs",
    genres: ["classical", "jazz"],
    eras: ["20th-century"],
    formats: ["ensemble"],
  },
  {
    id: "french-connections",
    title: "French Connections",
    venue: "Christ Church Cathedral",
    address: "St Aldate\'s, Oxford OX1 1DP",
    position: { lat: 51.7503, lng: -1.2556 },
    dateLabel: "Tue 21 Jul 2026 · 8:00pm",
    priceLabel: "£10 – £25",
    url: "https://www.ticketsoxford.com/events/french-connections",
    blurb: "Christ Church Cathedral · 1hr",
    genres: ["classical"],
    eras: ["20th-century"],
    formats: ["ensemble"],
  },
  {
    id: "an-evening-of-chopin-life-times-i",
    title: "An Evening of Chopin Life & Times I",
    venue: "Holywell Music Room",
    address: "Holywell Street, Oxford OX1 3SD",
    position: { lat: 51.7556, lng: -1.253 },
    dateLabel: "Wed 22 Jul 2026 · 8:00pm",
    priceLabel: "£15 – £25",
    url: "https://www.ticketsoxford.com/events/an-evening-of-chopin-life-times-i",
    blurb: "Holywell Music Room · 2hrs",
    genres: ["classical"],
    eras: ["classical-era", "romantic"],
    formats: ["duo"],
  },
  {
    id: "adderbury-ensemble-2",
    title: "Adderbury Ensemble",
    venue: "Holywell Music Room",
    address: "Holywell Street, Oxford OX1 3SD",
    position: { lat: 51.7556, lng: -1.253 },
    dateLabel: "Sun 26 Jul 2026 · 11:15am",
    priceLabel: "£8.50 – £17",
    url: "https://www.ticketsoxford.com/events/adderbury-ensemble-2",
    blurb: "Holywell Music Room · 1hr",
    genres: ["chamber", "classical"],
    eras: ["20th-century"],
    formats: ["ensemble"],
  },
  {
    id: "alon-goldstein-masterclass-oxford-piano-festival",
    title: "Alon Goldstein Masterclass — Oxford Piano Festival",
    venue: "St Hilda's College: Jacqueline Du Pré Music Building",
    address: "St Hilda's College, Cowley Pl, Oxford OX4 1DY",
    position: { lat: 51.7482, lng: -1.2413 },
    dateLabel: "Sat 25 Jul 2026 · 2:30pm",
    priceLabel: "£12.50",
    url: "https://oxfordpianofestival.com/event/alon-goldstein-masterclass/?utm_medium=display&utm_source=bachtrack.com&utm_campaign=listinglink",
    blurb:
      "Masterclass with pianist Alon Goldstein, part of the Oxford Piano Festival — at the Jacqueline Du Pré Music Building.",
    genres: ["classical"],
    eras: ["classical-era", "romantic", "20th-century"],
    formats: ["solo"],
  },
  {
    id: "steven-osborne-oxford-piano-festival",
    title: "Steven Osborne — Oxford Piano Festival",
    venue: "Christ Church Cathedral",
    address: "St Aldate's, Oxford OX1 1DP",
    position: { lat: 51.7503, lng: -1.2556 },
    dateLabel: "Sat 25 Jul 2026 · 7:30pm",
    priceLabel: "£12 – £32",
    url: "https://oxfordpianofestival.com/event/steven-osborne/",
    blurb:
      "Steven Osborne opens the festival with Schubert's Sonata D.960 and Beethoven's Diabelli Variations.",
    genres: ["classical"],
    eras: ["classical-era", "romantic"],
    formats: ["solo"],
  },
  {
    id: "steven-osborne-masterclass-opf",
    title: "Steven Osborne Masterclass — Oxford Piano Festival",
    venue: "St Hilda's College: Jacqueline Du Pré Music Building",
    address: "St Hilda's College, Cowley Pl, Oxford OX4 1DY",
    position: { lat: 51.7482, lng: -1.2413 },
    dateLabel: "Sun 26 Jul 2026 · 9:30am",
    priceLabel: "£12.50",
    url: "https://oxfordpianofestival.com/event/steven-osborne-masterclass/",
    blurb: "Masterclass with pianist Steven Osborne at the Jacqueline Du Pré Music Building.",
    genres: ["classical"],
    eras: ["classical-era", "romantic", "20th-century"],
    formats: ["solo"],
  },
  {
    id: "kathryn-stott-masterclass-opf-26jul",
    title: "Kathryn Stott Masterclass — Oxford Piano Festival",
    venue: "St Hilda's College: Jacqueline Du Pré Music Building",
    address: "St Hilda's College, Cowley Pl, Oxford OX4 1DY",
    position: { lat: 51.7482, lng: -1.2413 },
    dateLabel: "Sun 26 Jul 2026 · 2:30pm",
    priceLabel: "£12.50",
    url: "https://oxfordpianofestival.com/event/kathryn-stott-masterclass-5/",
    blurb: "Masterclass with pianist Kathryn Stott at the Jacqueline Du Pré Music Building.",
    genres: ["classical"],
    eras: ["classical-era", "romantic", "20th-century"],
    formats: ["solo"],
  },
  {
    id: "ingrid-fliter-opf",
    title: "Ingrid Fliter — Oxford Piano Festival",
    venue: "Holywell Music Room",
    address: "Holywell Street, Oxford OX1 3SD",
    position: { lat: 51.7556, lng: -1.253 },
    dateLabel: "Sun 26 Jul 2026 · 7:30pm",
    priceLabel: "£32",
    url: "https://oxfordpianofestival.com/event/ingrid-fliter/",
    blurb: "All-Chopin recital: Mazurkas, Nocturnes and the Piano Sonata No. 3 in B minor.",
    genres: ["classical"],
    eras: ["romantic"],
    formats: ["solo"],
  },
  {
    id: "ingrid-fliter-masterclass-opf",
    title: "Ingrid Fliter Masterclass — Oxford Piano Festival",
    venue: "St Hilda's College: Jacqueline Du Pré Music Building",
    address: "St Hilda's College, Cowley Pl, Oxford OX4 1DY",
    position: { lat: 51.7482, lng: -1.2413 },
    dateLabel: "Mon 27 Jul 2026 · 9:30am",
    priceLabel: "£12.50",
    url: "https://oxfordpianofestival.com/event/ingrid-fliter-masterclass/",
    blurb: "Masterclass with pianist Ingrid Fliter at the Jacqueline Du Pré Music Building.",
    genres: ["classical"],
    eras: ["classical-era", "romantic", "20th-century"],
    formats: ["solo"],
  },
  {
    id: "kathryn-stott-masterclass-opf-27jul",
    title: "Kathryn Stott Masterclass — Oxford Piano Festival",
    venue: "St Hilda's College: Jacqueline Du Pré Music Building",
    address: "St Hilda's College, Cowley Pl, Oxford OX4 1DY",
    position: { lat: 51.7482, lng: -1.2413 },
    dateLabel: "Mon 27 Jul 2026 · 2:30pm",
    priceLabel: "£12.50",
    url: "https://oxfordpianofestival.com/event/kathryn-stott-masterclass-5/",
    blurb: "Masterclass with pianist Kathryn Stott at the Jacqueline Du Pré Music Building.",
    genres: ["classical"],
    eras: ["classical-era", "romantic", "20th-century"],
    formats: ["solo"],
  },
  {
    id: "paul-lewis-opf",
    title: "Paul Lewis — Oxford Piano Festival",
    venue: "Sheldonian Theatre",
    address: "Broad Street, Oxford OX1 3AZ",
    position: { lat: 51.7546, lng: -1.2547 },
    dateLabel: "Mon 27 Jul 2026 · 7:30pm",
    priceLabel: "£15 – £38",
    url: "https://oxfordpianofestival.com/event/paul-lewis/",
    blurb: "Paul Lewis frames the programme with two Mozart sonatas alongside Poulenc and Debussy.",
    genres: ["classical"],
    eras: ["classical-era", "romantic", "20th-century"],
    formats: ["solo"],
  },
  {
    id: "paul-lewis-masterclass-opf",
    title: "Paul Lewis Masterclass — Oxford Piano Festival",
    venue: "St Hilda's College: Jacqueline Du Pré Music Building",
    address: "St Hilda's College, Cowley Pl, Oxford OX4 1DY",
    position: { lat: 51.7482, lng: -1.2413 },
    dateLabel: "Tue 28 Jul 2026 · 9:30am",
    priceLabel: "£12.50",
    url: "https://oxfordpianofestival.com/event/paul-lewis-masterclass/",
    blurb: "Masterclass with pianist Paul Lewis at the Jacqueline Du Pré Music Building.",
    genres: ["classical"],
    eras: ["classical-era", "romantic", "20th-century"],
    formats: ["solo"],
  },
  {
    id: "stephen-kovacevich-masterclass-opf",
    title: "Stephen Kovacevich Masterclass — Oxford Piano Festival",
    venue: "St Hilda's College: Jacqueline Du Pré Music Building",
    address: "St Hilda's College, Cowley Pl, Oxford OX4 1DY",
    position: { lat: 51.7482, lng: -1.2413 },
    dateLabel: "Tue 28 Jul 2026 · 2:30pm",
    priceLabel: "£12.50",
    url: "https://oxfordpianofestival.com/event/stephen-kovacevich-masterclass-4/",
    blurb: "Masterclass with pianist Stephen Kovacevich at the Jacqueline Du Pré Music Building.",
    genres: ["classical"],
    eras: ["classical-era", "romantic", "20th-century"],
    formats: ["solo"],
  },
  {
    id: "isata-kanneh-mason-opf",
    title: "Isata Kanneh-Mason — Oxford Piano Festival",
    venue: "Merton College Chapel",
    address: "Merton Street, Oxford OX1 4JD",
    position: { lat: 51.7511, lng: -1.2526 },
    dateLabel: "Tue 28 Jul 2026 · 7:30pm",
    priceLabel: "£12 – £32",
    url: "https://oxfordpianofestival.com/event/isata-kanneh-mason/",
    blurb: "Isata Kanneh-Mason plays Beethoven, Ravel and Tabakova at Merton College Chapel.",
    genres: ["classical"],
    eras: ["classical-era", "20th-century", "contemporary"],
    formats: ["solo"],
    newArtists: true,
  },
  {
    id: "momoro-ono-masterclass-opf",
    title: "Momoro Ono Masterclass — Oxford Piano Festival",
    venue: "St Hilda's College: Jacqueline Du Pré Music Building",
    address: "St Hilda's College, Cowley Pl, Oxford OX4 1DY",
    position: { lat: 51.7482, lng: -1.2413 },
    dateLabel: "Wed 29 Jul 2026 · 9:30am",
    priceLabel: "£12.50",
    url: "https://oxfordpianofestival.com/event/momoro-ono-masterclass/",
    blurb: "Masterclass with pianist Momoro Ono at the Jacqueline Du Pré Music Building.",
    genres: ["classical"],
    eras: ["classical-era", "romantic", "20th-century"],
    formats: ["solo"],
  },
  {
    id: "rustem-hayroudinoff-masterclass-opf",
    title: "Rustem Hayroudinoff Masterclass — Oxford Piano Festival",
    venue: "St Hilda's College: Jacqueline Du Pré Music Building",
    address: "St Hilda's College, Cowley Pl, Oxford OX4 1DY",
    position: { lat: 51.7482, lng: -1.2413 },
    dateLabel: "Wed 29 Jul 2026 · 2:30pm",
    priceLabel: "£12.50",
    url: "https://oxfordpianofestival.com/event/rustem-hayroudinoff-masterclass-4/",
    blurb: "Masterclass with pianist Rustem Hayroudinoff at the Jacqueline Du Pré Music Building.",
    genres: ["classical"],
    eras: ["classical-era", "romantic", "20th-century"],
    formats: ["solo"],
  },
  {
    id: "elisabeth-leonskaja-opf",
    title: "Elisabeth Leonskaja — Oxford Piano Festival",
    venue: "Sheldonian Theatre",
    address: "Broad Street, Oxford OX1 3AZ",
    position: { lat: 51.7546, lng: -1.2547 },
    dateLabel: "Wed 29 Jul 2026 · 7:30pm",
    priceLabel: "£15 – £38",
    url: "https://oxfordpianofestival.com/event/elisabeth-leonskaja/",
    blurb:
      "Elisabeth Leonskaja traverses Schubert's world with sonatas D.575, D.959 and the Four Impromptus.",
    genres: ["classical"],
    eras: ["romantic"],
    formats: ["solo"],
  },
  {
    id: "elisabeth-leonskaja-masterclass-opf",
    title: "Elisabeth Leonskaja Masterclass — Oxford Piano Festival",
    venue: "St Hilda's College: Jacqueline Du Pré Music Building",
    address: "St Hilda's College, Cowley Pl, Oxford OX4 1DY",
    position: { lat: 51.7482, lng: -1.2413 },
    dateLabel: "Thu 30 Jul 2026 · 9:30am",
    priceLabel: "£12.50",
    url: "https://oxfordpianofestival.com/event/elisabeth-leonskaja-masterclass-2/",
    blurb: "Masterclass with pianist Elisabeth Leonskaja at the Jacqueline Du Pré Music Building.",
    genres: ["classical"],
    eras: ["classical-era", "romantic", "20th-century"],
    formats: ["solo"],
  },
  {
    id: "ian-jones-masterclass-opf",
    title: "Ian Jones Masterclass — Oxford Piano Festival",
    venue: "St Hilda's College: Jacqueline Du Pré Music Building",
    address: "St Hilda's College, Cowley Pl, Oxford OX4 1DY",
    position: { lat: 51.7482, lng: -1.2413 },
    dateLabel: "Thu 30 Jul 2026 · 2:30pm",
    priceLabel: "£12.50",
    url: "https://oxfordpianofestival.com/event/ian-jones-masterclass-5/",
    blurb: "Masterclass with pianist Ian Jones at the Jacqueline Du Pré Music Building.",
    genres: ["classical"],
    eras: ["classical-era", "romantic", "20th-century"],
    formats: ["solo"],
  },
  {
    id: "grieg-piano-concerto-opf",
    title: "Grieg Piano Concerto — Oxford Philharmonic Orchestra",
    venue: "Sheldonian Theatre",
    address: "Broad Street, Oxford OX1 3AZ",
    position: { lat: 51.7546, lng: -1.2547 },
    dateLabel: "Thu 30 Jul 2026 · 7:30pm",
    priceLabel: "£15 – £48",
    url: "https://oxfordpianofestival.com/event/grieg-piano-concerto-2/",
    blurb:
      "Theodosia Ntokou and the Oxford Philharmonic under Marios Papadopoulos: Grieg Piano Concerto and Rachmaninov Symphony No. 2.",
    genres: ["classical"],
    eras: ["romantic"],
    formats: ["ensemble"],
  },
  {
    id: "marios-papadopoulos-masterclass-opf-31jul-am",
    title: "Marios Papadopoulos Masterclass — Oxford Piano Festival",
    venue: "St Hilda's College: Jacqueline Du Pré Music Building",
    address: "St Hilda's College, Cowley Pl, Oxford OX4 1DY",
    position: { lat: 51.7482, lng: -1.2413 },
    dateLabel: "Fri 31 Jul 2026 · 9:30am",
    priceLabel: "£12.50",
    url: "https://oxfordpianofestival.com/event/marios-papadopoulos-masterclass-5/",
    blurb: "Masterclass with pianist and Oxford Philharmonic music director Marios Papadopoulos.",
    genres: ["classical"],
    eras: ["classical-era", "romantic", "20th-century"],
    formats: ["solo"],
  },
  {
    id: "marios-papadopoulos-masterclass-opf-31jul-pm",
    title: "Marios Papadopoulos Masterclass — Oxford Piano Festival",
    venue: "St Hilda's College: Jacqueline Du Pré Music Building",
    address: "St Hilda's College, Cowley Pl, Oxford OX4 1DY",
    position: { lat: 51.7482, lng: -1.2413 },
    dateLabel: "Fri 31 Jul 2026 · 2:30pm",
    priceLabel: "£12.50",
    url: "https://oxfordpianofestival.com/event/marios-papadopoulos-masterclass-5/",
    blurb: "Afternoon masterclass with pianist Marios Papadopoulos.",
    genres: ["classical"],
    eras: ["classical-era", "romantic", "20th-century"],
    formats: ["solo"],
  },
  {
    id: "richard-goode-opf",
    title: "Richard Goode — Oxford Piano Festival",
    venue: "Holywell Music Room",
    address: "Holywell Street, Oxford OX1 3SD",
    position: { lat: 51.7556, lng: -1.253 },
    dateLabel: "Fri 31 Jul 2026 · 7:30pm",
    priceLabel: "£12 – £32",
    url: "https://oxfordpianofestival.com/event/richard-goode/",
    blurb:
      "Richard Goode plays Beethoven Op.90, Schoenberg Op.19, Brahms Op.118 and Schumann's Davidsbündlertänze.",
    genres: ["classical"],
    eras: ["classical-era", "romantic", "20th-century"],
    formats: ["solo"],
  },
  {
    id: "vanessa-latarche-masterclass-opf",
    title: "Vanessa Latarche Masterclass — Oxford Piano Festival",
    venue: "St Hilda's College: Jacqueline Du Pré Music Building",
    address: "St Hilda's College, Cowley Pl, Oxford OX4 1DY",
    position: { lat: 51.7482, lng: -1.2413 },
    dateLabel: "Sat 1 Aug 2026 · 9:30am",
    priceLabel: "£12.50",
    url: "https://oxfordpianofestival.com/event/vanessa-latarche-masterclass/",
    blurb: "Masterclass with pianist Vanessa Latarche at the Jacqueline Du Pré Music Building.",
    genres: ["classical"],
    eras: ["classical-era", "romantic", "20th-century"],
    formats: ["solo"],
  },
  {
    id: "richard-goode-masterclass-opf",
    title: "Richard Goode Masterclass — Oxford Piano Festival",
    venue: "St Hilda's College: Jacqueline Du Pré Music Building",
    address: "St Hilda's College, Cowley Pl, Oxford OX4 1DY",
    position: { lat: 51.7482, lng: -1.2413 },
    dateLabel: "Sat 1 Aug 2026 · 2:30pm",
    priceLabel: "£12.50",
    url: "https://oxfordpianofestival.com/event/richard-goode-masterclass/",
    blurb: "Masterclass with pianist Richard Goode at the Jacqueline Du Pré Music Building.",
    genres: ["classical"],
    eras: ["classical-era", "romantic", "20th-century"],
    formats: ["solo"],
  },
  {
    id: "arie-vardi-masterclass-opf",
    title: "Arie Vardi Masterclass — Oxford Piano Festival",
    venue: "St Hilda's College: Jacqueline Du Pré Music Building",
    address: "St Hilda's College, Cowley Pl, Oxford OX4 1DY",
    position: { lat: 51.7482, lng: -1.2413 },
    dateLabel: "Sun 2 Aug 2026 · 9:30am",
    priceLabel: "£12.50",
    url: "https://oxfordpianofestival.com/event/arie-vardi-masterclass/",
    blurb:
      "Masterclass with pianist and pedagogue Arie Vardi at the Jacqueline Du Pré Music Building.",
    genres: ["classical"],
    eras: ["classical-era", "romantic", "20th-century"],
    formats: ["solo"],
  },
  {
    id: "moonrakers-picnic-concert-2",
    title: "Moonrakers Picnic Concert",
    venue: "Waterperry Gardens, Oxfordshire, OX33 1JZ",
    address: "Waterperry, Oxfordshire OX33 1JZ",
    position: { lat: 51.7595, lng: -1.1424 },
    dateLabel: "Sun 26 Jul 2026 · 6:00pm",
    priceLabel: "£20",
    url: "https://www.ticketsoxford.com/events/moonrakers-picnic-concert-2",
    blurb: "Waterperry Gardens, Oxfordshire, OX33 1JZ · 2hrs 30mins",
    genres: ["classical", "folk"],
    eras: ["20th-century"],
    formats: ["ensemble"],
  },
  {
    id: "songs-for-these-distracted-times",
    title: "Songs for these Distracted Times",
    venue: "Christ Church Cathedral",
    address: "St Aldate\'s, Oxford OX1 1DP",
    position: { lat: 51.7503, lng: -1.2556 },
    dateLabel: "Tue 28 Jul 2026 · 8:00pm",
    priceLabel: "£10 – £25",
    url: "https://www.ticketsoxford.com/events/songs-for-these-distracted-times",
    blurb: "Christ Church Cathedral · 1hr",
    genres: ["classical"],
    eras: ["20th-century"],
    formats: ["ensemble"],
  },
  {
    id: "huw-watkins-ben-baker-emma-wernig-tim-posner",
    title: "Huw Watkins, Ben Baker, Emma Wernig & Tim Posner",
    venue: "Holywell Music Room",
    address: "Holywell Street, Oxford OX1 3SD",
    position: { lat: 51.7556, lng: -1.253 },
    dateLabel: "Sun 2 Aug 2026 · 11:15am",
    priceLabel: "£8.50 – £17",
    url: "https://www.ticketsoxford.com/events/huw-watkins-ben-baker-emma-wernig-tim-posner",
    blurb: "Holywell Music Room · 1hr",
    genres: ["chamber", "classical"],
    eras: ["20th-century"],
    formats: ["duo"],
  },
  {
    id: "bach-and-the-mendelssohn-family",
    title: "Bach and the Mendelssohn Family",
    venue: "Christ Church Cathedral",
    address: "St Aldate\'s, Oxford OX1 1DP",
    position: { lat: 51.7503, lng: -1.2556 },
    dateLabel: "Tue 4 Aug 2026 · 8:00pm",
    priceLabel: "£15 – £25",
    url: "https://www.ticketsoxford.com/events/bach-and-the-mendelssohn-family",
    blurb: "Christ Church Cathedral · 1hr",
    genres: ["baroque", "classical", "early"],
    eras: ["baroque", "classical-era", "romantic"],
    formats: ["ensemble"],
  },
  {
    id: "kleio-string-quartet-5",
    title: "Kleio String Quartet",
    venue: "Holywell Music Room",
    address: "Holywell Street, Oxford OX1 3SD",
    position: { lat: 51.7556, lng: -1.253 },
    dateLabel: "Sun 9 Aug 2026 · 11:15am",
    priceLabel: "£8.50 – £17",
    url: "https://www.ticketsoxford.com/events/kleio-string-quartet-5",
    blurb: "Holywell Music Room · 1hr",
    genres: ["chamber", "classical"],
    eras: ["20th-century"],
    formats: ["quartet"],
  },
  {
    id: "from-schubert-to-gershwin",
    title: "From Schubert To Gershwin",
    venue: "Holywell Music Room",
    address: "Holywell Street, Oxford OX1 3SD",
    position: { lat: 51.7556, lng: -1.253 },
    dateLabel: "Sun 9 Aug 2026 · 8:00pm",
    priceLabel: "£15 – £25",
    url: "https://www.ticketsoxford.com/events/from-schubert-to-gershwin",
    blurb: "Holywell Music Room · 2hrs",
    genres: ["classical", "jazz"],
    eras: ["20th-century", "classical-era", "romantic"],
    formats: ["ensemble"],
  },
  {
    id: "an-evening-hymn",
    title: "Ayres of the Night",
    venue: "Christ Church Cathedral",
    address: "St Aldate\'s, Oxford OX1 1DP",
    position: { lat: 51.7503, lng: -1.2556 },
    dateLabel: "Tue 11 Aug 2026 · 8:00pm",
    priceLabel: "£10 – £25",
    url: "https://www.ticketsoxford.com/events/an-evening-hymn",
    blurb: "Christ Church Cathedral · 1hr",
    genres: ["classical"],
    eras: ["20th-century"],
    formats: ["ensemble"],
  },
  {
    id: "adderbury-ensemble-with-fiona-cross",
    title: "Adderbury Ensemble with Fiona Cross",
    venue: "Holywell Music Room",
    address: "Holywell Street, Oxford OX1 3SD",
    position: { lat: 51.7556, lng: -1.253 },
    dateLabel: "Sun 16 Aug 2026 · 11:15am",
    priceLabel: "£8.50 – £17",
    url: "https://www.ticketsoxford.com/events/adderbury-ensemble-with-fiona-cross",
    blurb: "Holywell Music Room · 1hr",
    genres: ["chamber", "classical"],
    eras: ["20th-century"],
    formats: ["ensemble"],
  },
  {
    id: "bach-mozart-celebration",
    title: "Bach & Mozart Celebration",
    venue: "Holywell Music Room",
    address: "Holywell Street, Oxford OX1 3SD",
    position: { lat: 51.7556, lng: -1.253 },
    dateLabel: "Sun 16 Aug 2026 · 8:00pm",
    priceLabel: "£15 – £25",
    url: "https://www.ticketsoxford.com/events/bach-mozart-celebration",
    blurb: "Holywell Music Room · 2hrs",
    genres: ["baroque", "classical", "early"],
    eras: ["baroque", "classical-era"],
    formats: ["duo"],
  },
  {
    id: "london-serenata",
    title: "London Serenata",
    venue: "Holywell Music Room",
    address: "Holywell Street, Oxford OX1 3SD",
    position: { lat: 51.7556, lng: -1.253 },
    dateLabel: "Sun 23 Aug 2026 · 11:15am",
    priceLabel: "£8.50 – £17",
    url: "https://www.ticketsoxford.com/events/london-serenata",
    blurb: "Holywell Music Room · 1hr",
    genres: ["chamber", "classical"],
    eras: ["20th-century"],
    formats: ["ensemble"],
  },
  {
    id: "an-evening-of-gershwin-the-swinging-30s",
    title: "An Evening of Gershwin: The Swinging 30s",
    venue: "Holywell Music Room",
    address: "Holywell Street, Oxford OX1 3SD",
    position: { lat: 51.7556, lng: -1.253 },
    dateLabel: "Sun 23 Aug 2026 · 8:00pm",
    priceLabel: "£15 – £25",
    url: "https://www.ticketsoxford.com/events/an-evening-of-gershwin-the-swinging-30s",
    blurb: "Holywell Music Room · 2hrs",
    genres: ["classical", "jazz"],
    eras: ["20th-century"],
    formats: ["big-band"],
  },
  {
    id: "an-evening-of-chopin-life-and-times-ii",
    title: "An Evening of Chopin: Life and Times II",
    venue: "Holywell Music Room",
    address: "Holywell Street, Oxford OX1 3SD",
    position: { lat: 51.7556, lng: -1.253 },
    dateLabel: "Wed 26 Aug 2026 · 8:00pm",
    priceLabel: "£15 – £25",
    url: "https://www.ticketsoxford.com/events/an-evening-of-chopin-life-and-times-ii",
    blurb: "Holywell Music Room · 2hrs",
    genres: ["classical"],
    eras: ["classical-era", "romantic"],
    formats: ["ensemble"],
  },
  {
    id: "adderbury-ensemble-with-lawrence-cummings",
    title: "Adderbury Ensemble with Lawrence Cummings",
    venue: "Holywell Music Room",
    address: "Holywell Street, Oxford OX1 3SD",
    position: { lat: 51.7556, lng: -1.253 },
    dateLabel: "Sun 30 Aug 2026 · 11:15am",
    priceLabel: "£8.50 – £17",
    url: "https://www.ticketsoxford.com/events/adderbury-ensemble-with-lawrence-cummings",
    blurb: "Holywell Music Room · 1hr",
    genres: ["chamber", "classical"],
    eras: ["20th-century"],
    formats: ["ensemble"],
  },
  {
    id: "jack-gibbons-farewell-piano-party-4",
    title: "Jack Gibbons' Farewell Piano Party",
    venue: "Holywell Music Room",
    address: "Holywell Street, Oxford OX1 3SD",
    position: { lat: 51.7556, lng: -1.253 },
    dateLabel: "Sun 30 Aug 2026 · 8:00pm",
    priceLabel: "£15 – £25",
    url: "https://www.ticketsoxford.com/events/jack-gibbons-farewell-piano-party-4",
    blurb: "Holywell Music Room · 2hrs",
    genres: ["classical"],
    eras: ["20th-century"],
    formats: ["ensemble"],
  },
  {
    id: "welcome-joy-a-ceremony-of-carols",
    title: "Welcome Joy + A Ceremony of Carols",
    venue: "St Barnabas Church",
    address: "St Barnabas Street, Oxford OX2 6BG",
    position: { lat: 51.7575, lng: -1.2682 },
    dateLabel: "Thu 26 Nov 2026 · 7:30pm",
    priceLabel: "£15",
    url: "https://www.ticketsoxford.com/events/welcome-joy-a-ceremony-of-carols",
    blurb: "St Barnabas Church · 2hrs",
    genres: ["classical", "early"],
    eras: ["20th-century"],
    formats: ["ensemble"],
  },
  {
    id: "the-snowman-in-concert",
    title: "The Snowman in Concert",
    venue: "Sheldonian Theatre",
    address: "Broad Street, Oxford OX1 3AZ",
    position: { lat: 51.7546, lng: -1.2547 },
    dateLabel: "Mon 21 Dec 2026 · 1:30pm",
    priceLabel: "£18 – £35",
    url: "https://www.ticketsoxford.com/events/the-snowman-in-concert",
    blurb: "Sheldonian Theatre · 1hr",
    genres: ["classical"],
    eras: ["20th-century"],
    formats: ["ensemble"],
  },
  {
    id: "anna-clyne-looking-glass",
    title: "Anna Clyne: Looking Glass",
    venue: "Sohmen Concert Hall, Schwarzman Centre",
    address: "Radcliffe Observatory Quarter, Woodstock Road, Oxford OX2 6GG",
    position: { lat: 51.7625, lng: -1.2636 },
    dateLabel: "Wed 24 Jun 2026 · 7:30pm",
    priceLabel: "See box office",
    url: "https://www.schwarzmancentre.ox.ac.uk/whats-on/anna-clyne-looking-glass-r57m",
    blurb:
      "Dvořák, Stravinsky, Copland & Clyne — American chamber music with the Adler Quartet, Ensemble Isis, St Anne's Camerata, cond. Alpesh Chauhan. Premieres by Anna Clyne (with sound design by Jody Elff) and Alexander McNamee.",
    genres: ["classical"],
    eras: ["20th-century", "contemporary"],
    formats: ["ensemble", "chamber"],
    newArtists: true,
  },
];

const GENRE_FILTERS = [
  { id: "jazz", label: "Jazz" },
  { id: "classical", label: "Classical" },
  { id: "baroque", label: "Baroque" },
  { id: "chamber", label: "Chamber" },
  { id: "early", label: "Early" },
];

const ERA_FILTERS = [
  { id: "baroque", label: "Baroque" },
  { id: "classical-era", label: "Classical" },
  { id: "romantic", label: "Romantic" },
  { id: "20th-century", label: "20th C." },
];

const FORMAT_FILTERS = [
  { id: "duo", label: "Duo" },
  { id: "trio", label: "Trio" },
  { id: "quartet", label: "Quartet" },
  { id: "ensemble", label: "Ensemble" },
  { id: "big-band", label: "Big Band" },
];

const PRICE_FILTERS = [
  { id: "free", label: "Free", min: 0, max: 0 },
  { id: "under-10", label: "Under £10", min: 0, max: 9.99 },
  { id: "10-20", label: "£10–£20", min: 10, max: 20 },
  { id: "20-plus", label: "£20+", min: 20, max: Infinity },
];

function parsePriceRange(label: string): [number, number] {
  const nums = (label.match(/\d+(?:\.\d+)?/g) || []).map(Number);
  if (nums.length === 0) return [0, 0];
  if (nums.length === 1) return [nums[0], nums[0]];
  return [Math.min(...nums), Math.max(...nums)];
}

function parseDateLabel(label: string): Date | null {
  const m = label.match(/(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/);
  if (!m) return null;
  const d = new Date(`${m[2]} ${m[1]}, ${m[3]}`);
  return isNaN(d.getTime()) ? null : d;
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

declare global {
  interface Window {
    google?: any;
    __muselingInitMap?: () => void;
  }
}

function loadGoogleMaps(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.google?.maps) return Promise.resolve();
  const existing = document.getElementById("gmaps-sdk") as HTMLScriptElement | null;
  if (existing && existing.dataset.loaded === "true") return Promise.resolve();

  return new Promise((resolve, reject) => {
    window.__muselingInitMap = () => resolve();
    const key = import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY;
    const script = existing ?? document.createElement("script");
    script.id = "gmaps-sdk";
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&loading=async&callback=__muselingInitMap`;
    script.onerror = () => reject(new Error("Failed to load Google Maps"));
    script.onload = () => {
      script.dataset.loaded = "true";
    };
    if (!existing) document.head.appendChild(script);
  });
}

type FilterChipProps = {
  label: string;
  active: boolean;
  onClick: () => void;
};
function Chip({ label, active, onClick }: FilterChipProps) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition ${
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-foreground hover:border-primary/40"
      }`}
    >
      {label}
    </button>
  );
}

function Discover() {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const userMarkerRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const clustererRef = useRef<MarkerClusterer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dbPins, setDbPins] = useState<ConcertPin[]>([]);
  const { state: geo, request } = useGeolocation();
  const { user } = useAuth();

  // Fetch scraped/DB concerts that have coordinates and are upcoming
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const todayIso = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
      const { data, error: e } = await supabase
        .from("concerts")
        .select(
          "id,name,venue,location,concert_at,genre,ticket_price_pence,ticket_price_max_pence,description,booking_url,lat,lng,city",
        )
        .not("lat", "is", null)
        .not("lng", "is", null)
        .gte("concert_at", todayIso)
        .order("concert_at", { ascending: true })
        .limit(1000);
      if (cancelled || e || !data) return;
      const hardTitles = new Set(CONCERTS.map((c) => c.title.toLowerCase()));
      const pins: ConcertPin[] = data
        .filter((r: any) => !hardTitles.has((r.name ?? "").toLowerCase()))
        .map((r: any) => ({
          id: `db-${r.id}`,
          title: r.name,
          venue: r.venue,
          address: r.location ?? "",
          position: { lat: Number(r.lat), lng: Number(r.lng) },
          dateLabel: formatDbDate(r.concert_at),
          priceLabel: formatDbPrice(r.ticket_price_pence, r.ticket_price_max_pence),
          url: r.booking_url ?? "",
          blurb: r.description ?? undefined,
          genres: r.genre ? [String(r.genre).toLowerCase()] : [],
          eras: [],
          formats: [],
        }));
      setDbPins(pins);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const allConcerts = useMemo(() => [...CONCERTS, ...dbPins], [dbPins]);

  const [intentCounts, setIntentCounts] = useState<Record<string, number>>({});
  const [myIntents, setMyIntents] = useState<Set<string>>(new Set());
  const [myJoinChat, setMyJoinChat] = useState<Set<string>>(new Set());
  const [intentBusy, setIntentBusy] = useState<Set<string>>(new Set());
  const [openToMeetups, setOpenToMeetups] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from("profiles")
      .select("open_to_meetups")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }: any) => setOpenToMeetups(!!data?.open_to_meetups));
  }, [user?.id]);

  async function refreshIntents() {
    const [countsRes, mineRes] = await Promise.all([
      getConcertIntentCounts().then(
        (data: any) => ({ data, error: null as any }),
        (error: any) => ({ data: null, error }),
      ),
      user
        ? supabase
            .from("concert_intents")
            .select("concert_slug, join_group_chat")
            .eq("user_id", user.id)
        : Promise.resolve({ data: [], error: null } as any),
    ]);
    if (countsRes.error || mineRes.error) return;
    const counts: Record<string, number> = {};
    for (const row of (countsRes.data ?? []) as any[]) {
      counts[row.concert_slug] = Number(row.going_count) || 0;
    }

    const mine = new Set<string>();
    const mineChat = new Set<string>();
    for (const row of (mineRes.data ?? []) as any[]) {
      mine.add(row.concert_slug);
      if (row.join_group_chat) mineChat.add(row.concert_slug);
    }
    setIntentCounts(counts);
    setMyIntents(mine);
    setMyJoinChat(mineChat);
  }

  useEffect(() => {
    refreshIntents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Extract concert UUID from `db-<uuid>` slug (dbPins) — else null (static list)
  function slugToConcertId(slug: string): string | null {
    if (slug.startsWith("db-")) return slug.slice(3);
    return null;
  }

  const [pendingGoingSlug, setPendingGoingSlug] = useState<string | null>(null);
  const [pendingMode, setPendingMode] = useState<CompanionMode>("meet_others");
  const [pendingCount, setPendingCount] = useState<string>("1");

  async function toggleGoing(slug: string) {
    if (!user) {
      toast.error("Sign in to mark yourself going");
      return;
    }
    if (intentBusy.has(slug)) return;
    if (myIntents.has(slug)) {
      // going -> not going: remove immediately
      setIntentBusy((s) => new Set(s).add(slug));
      setMyIntents((s) => {
        const n = new Set(s);
        n.delete(slug);
        return n;
      });
      setIntentCounts((c) => ({ ...c, [slug]: Math.max(0, (c[slug] ?? 0) - 1) }));
      const { error } = await supabase
        .from("concert_intents")
        .delete()
        .eq("user_id", user.id)
        .eq("concert_slug", slug);
      setMyJoinChat((s) => {
        const n = new Set(s);
        n.delete(slug);
        return n;
      });
      setIntentBusy((s) => {
        const n = new Set(s);
        n.delete(slug);
        return n;
      });
      if (error) {
        toast.error(error.message);
        refreshIntents();
      }
      return;
    }
    // not going -> ask "who are you going with?"
    setPendingMode("meet_others");
    setPendingCount("1");
    setPendingGoingSlug(slug);
  }

  async function confirmGoing() {
    const slug = pendingGoingSlug;
    if (!slug || !user) return;
    const mode = pendingMode;
    const count =
      mode === "group_open"
        ? Math.min(3, Math.max(1, parseInt(pendingCount || "1", 10) || 1))
        : null;
    const wantChat = openToMeetups && (mode === "meet_others" || mode === "group_open");
    const concertId = slugToConcertId(slug);
    setPendingGoingSlug(null);
    setIntentBusy((s) => new Set(s).add(slug));
    setMyIntents((s) => new Set(s).add(slug));
    setIntentCounts((c) => ({ ...c, [slug]: (c[slug] ?? 0) + 1 }));
    const { error } = await (supabase.from("concert_intents") as any).insert({
      user_id: user.id,
      concert_slug: slug,
      concert_id: concertId,
      join_group_chat: wantChat,
      companion_mode: mode,
      companion_count: count,
    });
    if (!error && wantChat) {
      setMyJoinChat((s) => new Set(s).add(slug));
      if (concertId) runConcertMatching({ data: { concertId } }).catch(() => {});
    }
    setIntentBusy((s) => {
      const n = new Set(s);
      n.delete(slug);
      return n;
    });
    if (error) {
      toast.error(error.message);
      refreshIntents();
    } else {
      toast.success("You're going!");
    }
  }

  async function toggleJoinChat(slug: string) {
    if (!user) return;
    const concertId = slugToConcertId(slug);
    const on = !myJoinChat.has(slug);
    setMyJoinChat((s) => {
      const n = new Set(s);
      on ? n.add(slug) : n.delete(slug);
      return n;
    });
    const { error } = await supabase
      .from("concert_intents")
      .update({ join_group_chat: on })
      .eq("user_id", user.id)
      .eq("concert_slug", slug);
    if (error) {
      toast.error(error.message);
      refreshIntents();
      return;
    }
    if (on && concertId) runConcertMatching({ data: { concertId } }).catch(() => {});
  }

  const [search, setSearch] = useState("");
  const [genres, setGenres] = useState<string[]>([]);
  const [eras, setEras] = useState<string[]>([]);
  const [formats, setFormats] = useState<string[]>([]);
  const [prices, setPrices] = useState<string[]>([]);
  const [newArtistsOnly, setNewArtistsOnly] = useState(false);
  const [visibleCount, setVisibleCount] = useState(5);
  const [sortMode, setSortMode] = useState<"distance" | "date">("distance");
  const [areaQuery, setAreaQuery] = useState("");
  const [area, setArea] = useState<{ label: string; lat: number; lng: number } | null>(null);
  const [allMode, setAllMode] = useState(false);
  const [areaLoading, setAreaLoading] = useState(false);
  const runGeocode = useServerFn(geocodeArea);

  async function handleAreaSearch(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const q = areaQuery.trim();
    if (!q) return;
    setAreaLoading(true);
    try {
      const result = await runGeocode({ data: { query: q } });
      if (!result.ok) {
        toast.error(`Couldn't find "${q}". Try a nearby area or postcode.`);
        return;
      }
      setAllMode(false);
      setArea({ label: result.label, lat: result.lat, lng: result.lng });
      setSortMode("distance");
      const map = mapInstanceRef.current;
      if (map && window.google?.maps) {
        map.panTo({ lat: result.lat, lng: result.lng });
        if (map.getZoom() < 12) map.setZoom(13);
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Search failed");
    } finally {
      setAreaLoading(false);
    }
  }

  function clearArea() {
    setArea(null);
    setAreaQuery("");
  }

  function handleAllMode() {
    setAllMode(true);
    setArea(null);
    setAreaQuery("");
    setSortMode("distance");
    const map = mapInstanceRef.current;
    if (map && window.google?.maps) {
      const bounds = new window.google.maps.LatLngBounds(DEFAULT_BOUNDS_SW, DEFAULT_BOUNDS_NE);
      map.fitBounds(bounds, 24);
    }
  }

  const toggle = (val: string, list: string[], set: (v: string[]) => void) =>
    set(list.includes(val) ? list.filter((x) => x !== val) : [...list, val]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    return allConcerts.filter((c) => {
      const d = parseDateLabel(c.dateLabel);
      if (d && d.getTime() < startOfToday.getTime()) return false;

      if (genres.length && !c.genres.some((g) => genres.includes(g))) return false;
      if (eras.length && !c.eras.some((e) => eras.includes(e))) return false;
      if (formats.length && !c.formats.some((f) => formats.includes(f))) return false;
      if (newArtistsOnly && !c.newArtists) return false;
      if (prices.length) {
        const [pMin, pMax] = parsePriceRange(c.priceLabel);
        const ok = prices.some((id) => {
          const band = PRICE_FILTERS.find((p) => p.id === id);
          if (!band) return false;
          // Overlap between [pMin,pMax] and [band.min,band.max]
          return pMax >= band.min && pMin <= band.max;
        });
        if (!ok) return false;
      }
      if (q) {
        const hay =
          `${c.title} ${c.venue} ${c.address} ${c.blurb ?? ""} ${c.genres.join(" ")} ${c.eras.join(" ")} ${c.formats.join(" ")}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [allConcerts, search, genres, eras, formats, prices, newArtistsOnly]);

  const hasGeoLocation = geo.status === "granted";
  const hasOrigin = Boolean(area) || hasGeoLocation || allMode;
  const filterActive =
    genres.length > 0 ||
    eras.length > 0 ||
    formats.length > 0 ||
    prices.length > 0 ||
    newArtistsOnly ||
    search.length > 0;
  const showList = filterActive || hasOrigin;

  const ranked = useMemo(() => {
    const defaultCenter = {
      lat: (OXFORD.lat + LONDON.lat) / 2,
      lng: (OXFORD.lng + LONDON.lng) / 2,
    };
    const origin = area
      ? { lat: area.lat, lng: area.lng }
      : hasGeoLocation
        ? { lat: geo.lat, lng: geo.lng }
        : allMode
          ? defaultCenter
          : null;
    const mapped = filtered.map((c) => ({
      concert: c,
      distanceKm: origin ? haversineKm(origin, c.position) : null,
      date: parseDateLabel(c.dateLabel),
    }));
    if (sortMode === "date" || !origin) {
      mapped.sort((a, b) => (a.date?.getTime() ?? Infinity) - (b.date?.getTime() ?? Infinity));
    } else {
      mapped.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
    }
    return mapped;
  }, [filtered, geo, sortMode, hasGeoLocation, area, allMode]);

  const nearby = showList ? ranked : null;

  useEffect(() => {
    setVisibleCount(5);
  }, [search, genres, eras, formats, prices, newArtistsOnly]);

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then(() => {
        if (cancelled || !mapRef.current || !window.google?.maps) return;
        const map = new window.google.maps.Map(mapRef.current, {
          center: { lat: (OXFORD.lat + LONDON.lat) / 2, lng: (OXFORD.lng + LONDON.lng) / 2 },
          zoom: 9,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: "greedy",
        });
        const bounds = new window.google.maps.LatLngBounds(DEFAULT_BOUNDS_SW, DEFAULT_BOUNDS_NE);
        map.fitBounds(bounds, 24);
        mapInstanceRef.current = map;
      })
      .catch((e) => setError(e.message));
    return () => {
      cancelled = true;
    };
  }, []);

  // Rebuild markers when filter changes (or when nearby ordering updates)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !window.google?.maps) return;
    if (clustererRef.current) {
      clustererRef.current.clearMarkers();
    }
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];
    const infoWindow = new window.google.maps.InfoWindow();
    const nearbyOrder = new Map<string, number>();
    if (nearby) {
      nearby.slice(0, 5).forEach(({ concert }, idx) => nearbyOrder.set(concert.id, idx + 1));
    }
    filtered.forEach((c) => {
      const rank = nearbyOrder.get(c.id);
      const isNearby = rank !== undefined;
      const marker = new window.google.maps.Marker({
        position: c.position,
        title: c.title,
        zIndex: isNearby ? 1000 - (rank ?? 0) : 1,
        label: isNearby
          ? {
              text: String(rank),
              color: "#2B5B4B",
              fontSize: "11px",
              fontWeight: "700",
            }
          : undefined,
        icon: {
          // Classic Google pin path
          path: "M12 2C7.589 2 4 5.589 4 9.995 4 16.41 12 22 12 22s8-5.59 8-12.005C20 5.589 16.411 2 12 2z",
          fillColor: isNearby ? "#FFFFFF" : "#FFE7F9",
          fillOpacity: 1,
          strokeColor: "#2B5B4B",
          strokeWeight: isNearby ? 5 : 3,
          scale: isNearby ? 2 : 1.6,
          labelOrigin: new window.google.maps.Point(12, 9),
          anchor: new window.google.maps.Point(12, 22),
        },
      });

      marker.addListener("click", () => {
        const bookLabel = c.url
          ? (() => {
              try {
                return `Book on ${new URL(c.url).hostname.replace(/^www\./, "")} →`;
              } catch {
                return "Book tickets →";
              }
            })()
          : "";
        infoWindow.setContent(
          `<div style="max-width:240px;font-family:Inter,sans-serif;color:#1a1a1a">
            <div style="font-weight:600;font-size:14px;margin-bottom:4px">${isNearby ? `<span style="display:inline-block;min-width:18px;height:18px;line-height:18px;border-radius:9px;background:#2B5B4B;color:#FFE7F9;text-align:center;font-size:11px;margin-right:6px">${rank}</span>` : ""}${c.title}</div>
            <div style="font-size:12px;color:#555;margin-bottom:6px">${c.venue}${c.address ? `<br/>${c.address}` : ""}</div>
            <div style="font-size:12px;margin-bottom:2px"><strong>When:</strong> ${c.dateLabel}</div>
            <div style="font-size:12px;margin-bottom:8px"><strong>Tickets:</strong> ${c.priceLabel}</div>
            ${c.url ? `<a href="${c.url}" target="_blank" rel="noopener" style="font-size:12px;color:#2B5B4B;font-weight:600">${bookLabel}</a>` : ""}
          </div>`,
        );
        infoWindow.open({ anchor: marker, map });
        setSelectedId(c.id);
      });
      markersRef.current.push(marker);
    });

    // Cluster markers for performance / readability when zoomed out
    if (!clustererRef.current) {
      clustererRef.current = new MarkerClusterer({ map, markers: markersRef.current });
    } else {
      clustererRef.current.addMarkers(markersRef.current);
    }
  }, [filtered, nearby]);

  // Pan map when geolocation resolves
  useEffect(() => {
    if (geo.status === "granted" && mapInstanceRef.current && window.google?.maps) {
      const pos = { lat: geo.lat, lng: geo.lng };
      mapInstanceRef.current.panTo(pos);
      if (mapInstanceRef.current.getZoom() < 12) mapInstanceRef.current.setZoom(13);
      if (userMarkerRef.current) {
        userMarkerRef.current.setPosition(pos);
      } else {
        userMarkerRef.current = new window.google.maps.Marker({
          position: pos,
          map: mapInstanceRef.current,
          title: "You are here",
          icon: {
            path: window.google.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: "#2B5B4B",
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 2,
          },
        });
      }
    } else if (geo.status === "denied" || geo.status === "error") {
      toast.error(geo.message);
    }
  }, [geo]);

  function handleLocateMe() {
    if (geo.status === "granted" && mapInstanceRef.current) {
      mapInstanceRef.current.panTo({ lat: geo.lat, lng: geo.lng });
      if (mapInstanceRef.current.getZoom() < 12) mapInstanceRef.current.setZoom(13);
      return;
    }
    request();
  }

  function clearFilters() {
    setSearch("");
    setGenres([]);
    setEras([]);
    setFormats([]);
    setPrices([]);
    setNewArtistsOnly(false);
    setAllMode(false);
  }

  const featured =
    allConcerts.find(
      (c) =>
        c.title.toLowerCase().includes("gershwin") &&
        c.dateLabel.toLowerCase().includes("23 aug 2026"),
    ) ?? null;

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-md px-5 pt-8">
        <MuselingLogo />

        {featured && (
          <div className="mt-5 overflow-hidden rounded-2xl border border-primary/30 bg-primary/5 p-4">
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary">
              Highlighted event
            </div>
            <h2 className="mt-1.5 font-display text-lg leading-snug">{featured.title}</h2>
            <div className="mt-1 text-xs text-muted-foreground">
              {featured.venue} · {featured.dateLabel} · {featured.priceLabel}
            </div>
            <p className="mt-2 text-xs text-foreground/80">
              Tap <span className="font-semibold">I'm going</span> to join the Museling group for
              this concert.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <button
                onClick={() => toggleGoing(featured.id)}
                disabled={intentBusy.has(featured.id)}
                aria-pressed={myIntents.has(featured.id)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition disabled:opacity-60 ${
                  myIntents.has(featured.id)
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-primary bg-background text-primary hover:bg-primary hover:text-primary-foreground"
                }`}
              >
                <Check className="h-3.5 w-3.5" />
                {myIntents.has(featured.id) ? "Going" : "I'm going"}
              </button>
              <div className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-medium text-secondary-foreground">
                <Users className="h-3 w-3" />
                {intentCounts[featured.id] ?? 0} going
              </div>
            </div>
          </div>
        )}

        <h1 className="mt-6 font-display text-4xl leading-tight">Discover</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Jazz and classical concerts happening around Oxford and London.
        </p>

        {/* Search */}
        <div className="relative mt-5">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search concerts, venues, composers…"
            className="w-full rounded-full border border-border bg-card py-2.5 pl-9 pr-9 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-muted"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Location / area search */}
        <form onSubmit={handleAreaSearch} className="relative mt-2">
          <Navigation className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={areaQuery}
            onChange={(e) => setAreaQuery(e.target.value)}
            placeholder="Search area (e.g. Covent Garden, OX1)…"
            className="w-full rounded-full border border-border bg-card py-2.5 pl-9 pr-24 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
          />
          <button
            type="submit"
            disabled={areaLoading || areaQuery.trim().length < 2}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground disabled:opacity-50"
          >
            {areaLoading ? "…" : "Go"}
          </button>
        </form>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            onClick={handleAllMode}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition ${
              allMode
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:border-primary hover:text-foreground"
            }`}
          >
            <MapPin className="h-3 w-3" />
            All
          </button>
          {allMode && (
            <div className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              <span className="truncate">Ranking all concerts</span>
              <button
                onClick={() => setAllMode(false)}
                className="ml-1 shrink-0 rounded-full p-0.5 hover:bg-primary/20"
                aria-label="Clear all mode"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}
          {area && (
            <div className="mt-0 inline-flex max-w-full items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate">Ranking from {area.label}</span>
              <button
                onClick={clearArea}
                className="ml-1 shrink-0 rounded-full p-0.5 hover:bg-primary/20"
                aria-label="Clear area"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>

        {/* Filters */}
        <div className="mt-4 space-y-2">
          <div>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Genres
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {GENRE_FILTERS.map((g) => (
                <Chip
                  key={g.id}
                  label={g.label}
                  active={genres.includes(g.id)}
                  onClick={() => toggle(g.id, genres, setGenres)}
                />
              ))}
            </div>
          </div>
          <div>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Eras
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {ERA_FILTERS.map((e) => (
                <Chip
                  key={e.id}
                  label={e.label}
                  active={eras.includes(e.id)}
                  onClick={() => toggle(e.id, eras, setEras)}
                />
              ))}
            </div>
          </div>
          <div>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Concert format
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {FORMAT_FILTERS.map((f) => (
                <Chip
                  key={f.id}
                  label={f.label}
                  active={formats.includes(f.id)}
                  onClick={() => toggle(f.id, formats, setFormats)}
                />
              ))}
            </div>
          </div>
          <div>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Ticket price
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {PRICE_FILTERS.map((p) => (
                <Chip
                  key={p.id}
                  label={p.label}
                  active={prices.includes(p.id)}
                  onClick={() => toggle(p.id, prices, setPrices)}
                />
              ))}
            </div>
          </div>
          <div>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Artists
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              <Chip
                label="New artists"
                active={newArtistsOnly}
                onClick={() => setNewArtistsOnly((v) => !v)}
              />
              {filterActive && (
                <button
                  onClick={clearFilters}
                  className="shrink-0 rounded-full border border-dashed border-border px-3 py-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  Clear all
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="relative mt-4 aspect-[4/5] overflow-hidden rounded-3xl border border-border bg-card">
          <div ref={mapRef} className="absolute inset-0" />
          {error ? (
            <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-xs text-muted-foreground">
              {error}
            </div>
          ) : null}
          <button
            onClick={handleLocateMe}
            className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-background/90 shadow-sm backdrop-blur transition hover:bg-background"
            aria-label="Locate me"
            title="Locate me"
          >
            {geo.status === "loading" ? (
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            ) : (
              <Crosshair className="h-4 w-4 text-foreground" />
            )}
          </button>
          {geo.status === "granted" && (
            <div className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-full bg-background/90 px-3 py-1.5 text-xs font-medium text-foreground shadow-sm backdrop-blur">
              <MapPin className="h-3 w-3 text-primary" />
              <span>Using your location</span>
            </div>
          )}
        </div>

        {nearby && nearby.length > 0 && (
          <section className="mt-5">
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="font-display text-xl">
                {allMode
                  ? "All"
                  : area
                    ? `Near ${area.label.split(",")[0]}`
                    : hasGeoLocation
                      ? "Nearby concerts"
                      : "Matching concerts"}
              </h2>
              {hasOrigin && (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setSortMode("distance")}
                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider transition ${
                      sortMode === "distance"
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <MapPin className="h-3 w-3" />
                    Distance
                  </button>
                  <button
                    onClick={() => setSortMode("date")}
                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider transition ${
                      sortMode === "date"
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <ArrowUpDown className="h-3 w-3" />
                    Date
                  </button>
                </div>
              )}
            </div>

            <div className="mb-2 text-xs text-muted-foreground">
              {filtered.length} of {allConcerts.length} concerts
            </div>
            <ul className="space-y-2">
              {nearby.slice(0, visibleCount).map(({ concert: c, distanceKm }, idx) => (
                <li
                  key={`near-${c.id}`}
                  className="flex items-start justify-between gap-3 rounded-2xl border border-border bg-card p-3"
                >
                  <div className="flex min-w-0 items-start gap-2.5">
                    <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-primary bg-background text-[11px] font-bold text-primary">
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{c.title}</div>
                      <div className="truncate text-xs text-muted-foreground">{c.venue}</div>
                      <div className="mt-1 text-xs">
                        <span className="text-muted-foreground">{c.dateLabel}</span>
                        <span className="mx-1.5 text-muted-foreground">·</span>
                        <span>{c.priceLabel}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    {distanceKm !== null && (
                      <div className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                        {distanceKm < 1
                          ? `${Math.round(distanceKm * 1000)} m`
                          : `${distanceKm.toFixed(1)} km`}
                      </div>
                    )}
                    <button
                      onClick={() => toggleGoing(c.id)}
                      disabled={intentBusy.has(c.id)}
                      aria-pressed={myIntents.has(c.id)}
                      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition disabled:opacity-60 ${
                        myIntents.has(c.id)
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-card text-foreground hover:border-primary/40"
                      }`}
                    >
                      <Check className="h-3 w-3" />
                      {myIntents.has(c.id) ? "Going" : "I'm going"}
                    </button>
                    {openToMeetups && myIntents.has(c.id) && slugToConcertId(c.id) && (
                      <button
                        onClick={() => toggleJoinChat(c.id)}
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition ${
                          myJoinChat.has(c.id)
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-card text-muted-foreground hover:border-primary/40"
                        }`}
                      >
                        <Users className="h-3 w-3" />
                        {myJoinChat.has(c.id) ? "In group chat" : "Join group chat"}
                      </button>
                    )}
                    <div className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-medium text-secondary-foreground">
                      <Users className="h-3 w-3" />
                      {intentCounts[c.id] ?? 0} going
                    </div>
                    <a
                      href={c.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] font-semibold text-primary"
                    >
                      Book tickets →
                    </a>
                  </div>
                </li>
              ))}
            </ul>
            {visibleCount < nearby.length && (
              <button
                onClick={() => setVisibleCount((v) => v + 5)}
                className="mt-4 w-full rounded-full border border-primary bg-primary/5 py-2.5 text-sm font-semibold text-primary transition hover:bg-primary/10"
              >
                Load More
              </button>
            )}
          </section>
        )}

        {showList && nearby && nearby.length === 0 && (
          <div className="mt-5 rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No concerts match your filters.
          </div>
        )}

        {!showList && (
          <p className="mt-5 text-center text-xs text-muted-foreground">
            Showing all {allConcerts.length} concerts on the map. Apply a filter above or tap the
            crosshair to see a ranked list.
          </p>
        )}
      </div>
      <TabBarSpacer />
      <TabBar />

      <Dialog
        open={!!pendingGoingSlug}
        onOpenChange={(o) => {
          if (!o) setPendingGoingSlug(null);
        }}
      >
        <DialogContent className="max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">Who are you going with?</DialogTitle>
            <DialogDescription>
              This helps us know how to match you into a group chat. Group chats open once at least
              3 people going to the same concert are happy to be matched, with up to 8 per chat.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-2 space-y-2">
            {[
              {
                id: "solo_happy" as const,
                label: "I am happy by myself.",
                sub: "No group chat, just going solo.",
              },
              {
                id: "meet_others" as const,
                label: "I'd like to meet others.",
                sub: "Match me into a small group chat (3 - 8 curious minds).\u00a0",
              },
              {
                id: "group_open" as const,
                label: "Coming with others, but still open to be matched.",
                sub: "Tell us how many people are joining you.",
              },
            ].map((opt) => {
              const active = pendingMode === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setPendingMode(opt.id)}
                  className={
                    "w-full rounded-2xl border px-4 py-3 text-left transition " +
                    (active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card hover:border-primary/40")
                  }
                >
                  <p className="text-sm font-semibold">{opt.label}</p>
                  <p
                    className={
                      "mt-0.5 text-[11px] " + (active ? "opacity-80" : "text-muted-foreground")
                    }
                  >
                    {opt.sub}
                  </p>
                </button>
              );
            })}
            {pendingMode === "group_open" && (
              <div className="pt-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Number of other people coming with you (max 3)
                </label>
                <Input
                  type="number"
                  min={1}
                  max={3}
                  value={pendingCount}
                  onChange={(e) => {
                    const n = Math.min(3, Math.max(1, parseInt(e.target.value || "1", 10) || 1));
                    setPendingCount(String(n));
                  }}
                  className="mt-1 h-11"
                />
              </div>
            )}
          </div>
          <DialogFooter className="mt-3">
            <Button variant="ghost" onClick={() => setPendingGoingSlug(null)}>
              Cancel
            </Button>
            <Button onClick={confirmGoing}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
