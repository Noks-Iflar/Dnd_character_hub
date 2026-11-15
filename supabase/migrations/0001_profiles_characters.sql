-- 0001: users' profiles and characters, with row level security.
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.

-- Types ---------------------------------------------------------------------

create type public.user_role as enum ('gm', 'player');
create type public.character_status as enum ('in_game', 'between_sessions');

-- Profiles: one row per auth user --------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  role public.user_role not null default 'player',
  timezone text not null default 'UTC',
  created_at timestamptz not null default now()
);

-- Create a profile automatically when the GM adds a user in the dashboard
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(split_part(new.email, '@', 1), ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- True when the current user is the GM. Security definer avoids RLS recursion.
create function public.is_gm()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'gm'
  );
$$;

-- Characters -----------------------------------------------------------------

create table public.characters (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles (id) on delete set null,
  name text not null,
  foundry_actor_id text not null unique,
  status public.character_status not null default 'between_sessions',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index characters_owner_id_idx on public.characters (owner_id);

-- Row level security ----------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.characters enable row level security;

-- Profiles: everyone signed in sees their own profile, the GM sees all
create policy "profiles: read own or gm"
  on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_gm());

-- Profiles: a user edits only their own name and time zone (never the role)
create policy "profiles: update own"
  on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

revoke update on public.profiles from authenticated, anon;
grant update (display_name, timezone) on public.profiles to authenticated;

-- Characters: the owner sees their character, the GM sees all
create policy "characters: read own or gm"
  on public.characters for select to authenticated
  using (owner_id = auth.uid() or public.is_gm());

-- Characters: only the GM creates, changes and deletes them
create policy "characters: gm insert"
  on public.characters for insert to authenticated
  with check (public.is_gm());

create policy "characters: gm update"
  on public.characters for update to authenticated
  using (public.is_gm())
  with check (public.is_gm());

create policy "characters: gm delete"
  on public.characters for delete to authenticated
  using (public.is_gm());
