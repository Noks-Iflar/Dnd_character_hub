-- 0004: personal notes of a character. Live only in the app, never go to Foundry.
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.

create table public.character_notes (
  character_id uuid primary key references public.characters (id) on delete cascade,
  body text not null default '' check (length(body) <= 20000),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null default auth.uid()
);

alter table public.character_notes enable row level security;

-- Owner of the character or the GM: read and write, at any time (notes are not part of the sheet)
create policy "notes: owner or gm read"
  on public.character_notes for select to authenticated
  using (
    public.is_gm()
    or exists (select 1 from public.characters c where c.id = character_id and c.owner_id = auth.uid())
  );

create policy "notes: owner or gm insert"
  on public.character_notes for insert to authenticated
  with check (
    updated_by = auth.uid()
    and (
      public.is_gm()
      or exists (select 1 from public.characters c where c.id = character_id and c.owner_id = auth.uid())
    )
  );

create policy "notes: owner or gm update"
  on public.character_notes for update to authenticated
  using (
    public.is_gm()
    or exists (select 1 from public.characters c where c.id = character_id and c.owner_id = auth.uid())
  )
  with check (
    updated_by = auth.uid()
    and (
      public.is_gm()
      or exists (select 1 from public.characters c where c.id = character_id and c.owner_id = auth.uid())
    )
  );

revoke delete on public.character_notes from authenticated, anon;
