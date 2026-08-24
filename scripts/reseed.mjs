import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sb = createClient(url, key, { auth: { persistSession: false } });

const GENRES = [
  "classical",
  "jazz",
  "folk",
  "indie",
  "electronic",
  "rock",
  "hiphop",
  "world",
  "soul",
  "experimental",
];
const AVAIL = [
  "weekday_evenings",
  "weekend_afternoons",
  "weekend_evenings",
  "sunday_mornings",
  "late_night",
];
const PLANS = ["solo", "group", "unlimited"];
const FIRST = [
  "Alex",
  "Sam",
  "Maya",
  "Noah",
  "Liam",
  "Emma",
  "Olivia",
  "Zara",
  "Iris",
  "Theo",
  "Cleo",
  "Hugo",
  "Eden",
  "Rory",
  "Mira",
  "Jude",
  "Nora",
  "Owen",
  "Lola",
  "Finn",
  "Ada",
  "Kai",
  "Luca",
  "Eli",
  "Anya",
  "Ben",
  "Ivy",
  "Otto",
  "Nia",
  "Jonah",
];
const LAST = [
  "Park",
  "Chen",
  "Sato",
  "Reed",
  "Vidal",
  "Quinn",
  "Moss",
  "Iyer",
  "Lopez",
  "Tan",
  "Owen",
  "Gray",
  "Bell",
  "Ford",
  "Roy",
  "Wong",
  "Novak",
  "Jung",
  "Smith",
  "Patel",
  "Khan",
  "Adams",
  "Brown",
  "Hill",
  "Hart",
  "Lane",
  "Wells",
  "Price",
  "Reid",
  "Shaw",
];

const rand = (a) => a[Math.floor(Math.random() * a.length)];
const sample = (a, n) => [...a].sort(() => Math.random() - 0.5).slice(0, n);

// 1) Delete existing seed users
const { data: existing } = await sb.auth.admin.listUsers({ perPage: 200 });
const toDelete = (existing?.users ?? []).filter((u) => u.email?.includes("+seed@museling.test"));
console.log(`Deleting ${toDelete.length} existing seed users...`);
for (const u of toDelete) {
  await sb.auth.admin.deleteUser(u.id);
}

// 2) Create 30 new users
const used = new Set();
for (let i = 1; i <= 30; i++) {
  let name;
  do {
    name = `${rand(FIRST)} ${rand(LAST)}`;
  } while (used.has(name));
  used.add(name);

  const email = `persona${String(i).padStart(2, "0")}+seed@museling.test`;
  const { data: created, error } = await sb.auth.admin.createUser({
    email,
    password: "MuselingTest!2025",
    email_confirm: true,
    user_metadata: { full_name: name },
  });
  if (error) {
    console.error(i, error.message);
    continue;
  }
  const id = created.user.id;

  const age = 20 + Math.floor(Math.random() * 16); // 20-35
  const profile = {
    id,
    full_name: name,
    age,
    location: "Oxford",
    whatsapp: `+447${Math.floor(100000000 + Math.random() * 899999999)}`,
    genres: sample(GENRES, 2 + Math.floor(Math.random() * 4)),
    availability: sample(AVAIL, 1 + Math.floor(Math.random() * 3)),
    plan_preference: rand(PLANS),
    signup_complete: true,
  };
  const { error: pErr } = await sb.from("profiles").upsert(profile);
  if (pErr) console.error(i, "profile", pErr.message);
  else console.log(`#${i} ${name}, ${age}, Oxford`);
}
console.log("done");
