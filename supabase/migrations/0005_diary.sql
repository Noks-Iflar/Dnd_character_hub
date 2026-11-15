-- 0005: adventurers' diary. Lore sections and session recaps are written by the GM;
-- players add their memories and lore notes under them.
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.

create table public.lore_pages (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(title) between 1 and 200),
  body text not null default '' check (length(body) <= 50000),
  sort integer not null default 0,
  gm_only boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.diary_sessions (
  id uuid primary key default gen_random_uuid(),
  number integer not null unique check (number > 0),
  title text check (length(title) <= 200),
  played_on date,
  summary text not null default '' check (length(summary) <= 50000),
  -- Key moments, one per line
  highlights text not null default '' check (length(highlights) <= 20000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create type public.diary_entry_kind as enum ('memory', 'lore', 'general');

create table public.diary_entries (
  id uuid primary key default gen_random_uuid(),
  lore_page_id uuid references public.lore_pages (id) on delete cascade,
  session_id uuid references public.diary_sessions (id) on delete cascade,
  kind public.diary_entry_kind not null default 'memory',
  body text not null check (length(body) between 1 and 10000),
  -- Who signs the entry: a character name; empty for general notes.
  -- Imported entries keep the name from the old table until they are matched to players.
  character_name text check (length(character_name) <= 100),
  author_id uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- An entry belongs to exactly one lore page or one session
  check ((lore_page_id is null) <> (session_id is null))
);

create index diary_entries_page_idx on public.diary_entries (lore_page_id);
create index diary_entries_session_idx on public.diary_entries (session_id);

alter table public.lore_pages enable row level security;
alter table public.diary_sessions enable row level security;
alter table public.diary_entries enable row level security;

-- Lore: everyone signed in reads, except GM-only pages; only the GM writes
create policy "lore: read" on public.lore_pages for select to authenticated
  using (not gm_only or public.is_gm());
create policy "lore: gm insert" on public.lore_pages for insert to authenticated with check (public.is_gm());
create policy "lore: gm update" on public.lore_pages for update to authenticated using (public.is_gm()) with check (public.is_gm());
create policy "lore: gm delete" on public.lore_pages for delete to authenticated using (public.is_gm());

-- Sessions: everyone signed in reads; only the GM writes
create policy "sessions: read" on public.diary_sessions for select to authenticated using (true);
create policy "sessions: gm insert" on public.diary_sessions for insert to authenticated with check (public.is_gm());
create policy "sessions: gm update" on public.diary_sessions for update to authenticated using (public.is_gm()) with check (public.is_gm());
create policy "sessions: gm delete" on public.diary_sessions for delete to authenticated using (public.is_gm());

-- True when the entry's lore page is visible to the current user (sessions are always visible)
create function public.diary_target_visible(page_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select page_id is null
      or public.is_gm()
      or exists (select 1 from public.lore_pages p where p.id = page_id and not p.gm_only);
$$;

-- Entries: read where the page or session is visible; anyone signed in adds as themselves;
-- the author or the GM edits and deletes
create policy "entries: read" on public.diary_entries for select to authenticated
  using (public.diary_target_visible(lore_page_id));
create policy "entries: insert as self" on public.diary_entries for insert to authenticated
  with check (author_id = auth.uid() and public.diary_target_visible(lore_page_id));
create policy "entries: author or gm update" on public.diary_entries for update to authenticated
  using (author_id = auth.uid() or public.is_gm())
  with check ((author_id = auth.uid() or public.is_gm()) and public.diary_target_visible(lore_page_id));
create policy "entries: author or gm delete" on public.diary_entries for delete to authenticated
  using (author_id = auth.uid() or public.is_gm());

-- Players may change only the text, kind and signature of their own entries (not the author)
revoke update on public.diary_entries from authenticated, anon;
grant update (kind, body, character_name, updated_at) on public.diary_entries to authenticated;
