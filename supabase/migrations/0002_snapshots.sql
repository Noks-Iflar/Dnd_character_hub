-- 0002: character snapshots from Foundry. Immutable history: rows are only added.
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.

create table public.snapshots (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters (id) on delete cascade,
  -- The whole snapshot file for one character (schemaVersion, meta, source, computed, portrait)
  data jsonb not null,
  foundry_version text,
  system_version text,
  exported_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null default auth.uid()
);

create index snapshots_character_created_idx on public.snapshots (character_id, created_at desc);

alter table public.snapshots enable row level security;

-- The owner of the character sees its snapshots, the GM sees all
create policy "snapshots: read own character or gm"
  on public.snapshots for select to authenticated
  using (
    public.is_gm()
    or exists (
      select 1 from public.characters c
      where c.id = character_id and c.owner_id = auth.uid()
    )
  );

-- Only the GM uploads snapshots
create policy "snapshots: gm insert"
  on public.snapshots for insert to authenticated
  with check (public.is_gm());

-- No update or delete policies: snapshots never change through the app.
revoke update, delete on public.snapshots from authenticated, anon;

-- The GM needs to list players to assign characters to them (already allowed by
-- "profiles: read own or gm"), nothing else changes in profiles or characters.
