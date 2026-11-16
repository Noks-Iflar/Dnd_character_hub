-- 0008: session planner. Free time of everyone (30-minute slots in UTC) and sessions set by the GM.
-- Also lets everyone signed in see names and time zones of the others (to show "Аня: 17:00").
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.

-- Profiles: name, role and time zone are visible to everyone signed in (e-mails stay in auth.users)
drop policy "profiles: read own or gm" on public.profiles;
create policy "profiles: read signed in" on public.profiles for select to authenticated using (true);

-- Time zone must be a real IANA name, e.g. Europe/Berlin (Postgres knows the same list)
create function public.is_valid_timezone(tz text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  perform now() at time zone tz;
  return true;
exception when others then
  return false;
end;
$$;

alter table public.profiles add constraint profiles_timezone_check check (public.is_valid_timezone(timezone));

create table public.availability (
  user_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  -- Start of a 30-minute slot in UTC
  slot_start timestamptz not null check (extract(epoch from slot_start)::bigint % 1800 = 0),
  primary key (user_id, slot_start)
);

create index availability_slot_idx on public.availability (slot_start);

alter table public.availability enable row level security;

-- Everyone signed in sees everyone's free time (to count who is free); each user marks only their own
create policy "availability: read signed in" on public.availability for select to authenticated using (true);
create policy "availability: insert own" on public.availability for insert to authenticated with check (user_id = auth.uid());
create policy "availability: delete own" on public.availability for delete to authenticated using (user_id = auth.uid());

create table public.planned_sessions (
  id uuid primary key default gen_random_uuid(),
  starts_at timestamptz not null,
  note text check (length(note) <= 500),
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

alter table public.planned_sessions enable row level security;

create policy "planned: read signed in" on public.planned_sessions for select to authenticated using (true);
create policy "planned: gm insert" on public.planned_sessions for insert to authenticated with check (public.is_gm());
create policy "planned: gm update" on public.planned_sessions for update to authenticated using (public.is_gm()) with check (public.is_gm());
create policy "planned: gm delete" on public.planned_sessions for delete to authenticated using (public.is_gm());
