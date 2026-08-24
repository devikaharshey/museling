export type EarnedBadge = {
  id:
    | "first_night"
    | "genre_explorer"
    | "regular"
    | "independent_mind"
    | "crowd_favourite"
    | "encore_maestro";
  name: string;
  description: string;
};

const ALL: EarnedBadge[] = [
  { id: "first_night", name: "First Night", description: "Logged your first concert." },
  {
    id: "genre_explorer",
    name: "Genre Explorer",
    description: "Logged concerts across 3+ genres.",
  },
  { id: "regular", name: "Regular", description: "Logged 5+ concerts." },
  {
    id: "independent_mind",
    name: "Independent Mind",
    description: "Logged a concert you went to on your own.",
  },
  {
    id: "crowd_favourite",
    name: "Crowd Favourite",
    description: "Received 5+ encores across your logs.",
  },
  {
    id: "encore_maestro",
    name: "Encore Maestro",
    description: "A single log received 3+ encores.",
  },
];

export type ConcertForBadges = {
  id: string;
  source: "invitation" | "independent";
  genres: string[] | null;
};

export type LogForBadges = {
  user_concert_id: string;
  // a log "counts" when it has at least one of these populated
  rating?: number | null;
  notes?: string | null;
  favourite_moment?: string | null;
  encore_count?: number;
};

export function computeBadges(
  concerts: ConcertForBadges[],
  logs: LogForBadges[],
): { earned: EarnedBadge[]; locked: EarnedBadge[] } {
  const earnedIds = new Set<EarnedBadge["id"]>();

  const completed = logs.filter(
    (l) =>
      l.rating != null ||
      (l.notes && l.notes.trim()) ||
      (l.favourite_moment && l.favourite_moment.trim()),
  );
  const completedConcertIds = new Set(completed.map((l) => l.user_concert_id));
  const completedConcerts = concerts.filter((c) => completedConcertIds.has(c.id));

  if (completedConcerts.length >= 1) earnedIds.add("first_night");
  if (completedConcerts.length >= 5) earnedIds.add("regular");

  const genres = new Set<string>();
  for (const c of completedConcerts) for (const g of c.genres ?? []) genres.add(g.toLowerCase());
  if (genres.size >= 3) earnedIds.add("genre_explorer");

  if (completedConcerts.some((c) => c.source === "independent")) earnedIds.add("independent_mind");

  const totalEncores = completed.reduce((sum, l) => sum + (l.encore_count ?? 0), 0);
  if (totalEncores >= 5) earnedIds.add("crowd_favourite");
  if (completed.some((l) => (l.encore_count ?? 0) >= 3)) earnedIds.add("encore_maestro");

  return {
    earned: ALL.filter((b) => earnedIds.has(b.id)),
    locked: ALL.filter((b) => !earnedIds.has(b.id)),
  };
}

export const ALL_BADGES = ALL;
