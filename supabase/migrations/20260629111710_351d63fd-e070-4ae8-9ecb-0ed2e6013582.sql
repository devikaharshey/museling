
-- Enums
do $$ begin
  create type public.affinity_level as enum ('boost','neutral','reduce','rare');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.report_status as enum ('pending','under_review','resolved_no_action','resolved_warning','resolved_suspended','resolved_banned');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.account_status as enum ('active','suspended','banned');
exception when duplicate_object then null; end $$;

alter table public.profiles
  add column if not exists account_status public.account_status not null default 'active';

-- affinity_preferences
create table public.affinity_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  target_user_id uuid not null references auth.users(id) on delete cascade,
  preference_level public.affinity_level not null default 'neutral',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint affinity_no_self check (user_id <> target_user_id),
  unique (user_id, target_user_id)
);
grant select, insert, update, delete on public.affinity_preferences to authenticated;
grant all on public.affinity_preferences to service_role;
alter table public.affinity_preferences enable row level security;
create policy "owner manages own affinity"
  on public.affinity_preferences for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create policy "admin reads affinity"
  on public.affinity_preferences for select
  using (public.has_role(auth.uid(),'admin'));
create trigger affinity_set_updated_at
  before update on public.affinity_preferences
  for each row execute function public.set_updated_at();

-- blocks
create table public.blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  extend_to_network boolean not null default false,
  created_at timestamptz not null default now(),
  constraint blocks_no_self check (blocker_id <> blocked_id),
  unique (blocker_id, blocked_id)
);
grant select, insert, update, delete on public.blocks to authenticated;
grant all on public.blocks to service_role;
alter table public.blocks enable row level security;
create policy "blocker manages own blocks"
  on public.blocks for all
  using (auth.uid() = blocker_id)
  with check (auth.uid() = blocker_id);
create policy "admin reads blocks"
  on public.blocks for select
  using (public.has_role(auth.uid(),'admin'));

create or replace function public.users_blocked(_a uuid, _b uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = _a and blocked_id = _b)
       or (blocker_id = _b and blocked_id = _a)
  );
$$;

-- reports
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete set null,
  reported_user_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid references public.concerts(id) on delete set null,
  description text not null,
  evidence_url text,
  status public.report_status not null default 'pending',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  constraint reports_no_self check (reporter_id <> reported_user_id),
  constraint reports_description_len check (char_length(description) between 1 and 4000)
);
grant select, insert, update on public.reports to authenticated;
grant all on public.reports to service_role;
alter table public.reports enable row level security;
create policy "reporter inserts own report"
  on public.reports for insert
  with check (auth.uid() = reporter_id);
create policy "reporter reads own report"
  on public.reports for select
  using (auth.uid() = reporter_id);
create policy "admin reads all reports"
  on public.reports for select
  using (public.has_role(auth.uid(),'admin'));
create policy "admin updates reports"
  on public.reports for update
  using (public.has_role(auth.uid(),'admin'))
  with check (public.has_role(auth.uid(),'admin'));

create or replace function public.handle_report_resolution()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status
     and new.status in ('resolved_no_action','resolved_warning','resolved_suspended','resolved_banned') then
    new.resolved_at := coalesce(new.resolved_at, now());
    new.resolved_by := coalesce(new.resolved_by, auth.uid());
  end if;
  if new.status = 'resolved_suspended' and old.status is distinct from new.status then
    update public.profiles set account_status = 'suspended' where id = new.reported_user_id;
  elsif new.status = 'resolved_banned' and old.status is distinct from new.status then
    update public.profiles set account_status = 'banned' where id = new.reported_user_id;
  end if;
  return new;
end; $$;
create trigger reports_resolution_trigger
  before update on public.reports
  for each row execute function public.handle_report_resolution();

-- Restrictive RLS to hide blocked users' social content from the viewer
create policy "hide blocked logs"
  on public.concert_logs as restrictive
  for select
  using (auth.uid() = user_id or not public.users_blocked(auth.uid(), user_id));
create policy "hide blocked reactions"
  on public.log_reactions as restrictive
  for select
  using (auth.uid() = user_id or not public.users_blocked(auth.uid(), user_id));
create policy "hide blocked comments"
  on public.log_comments as restrictive
  for select
  using (auth.uid() = user_id or not public.users_blocked(auth.uid(), user_id));
