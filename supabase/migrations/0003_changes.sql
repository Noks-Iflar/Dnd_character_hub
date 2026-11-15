-- 0003: journal of player edits between sessions. Append-only; the GM marks rows applied.
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.

-- Paths inside the Foundry actor source that players may change (CLAUDE.md, "Редактируемые поля").
-- Item paths use the 16-character Foundry item id: items.<id>.system....
create function public.is_editable_path(path text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select path ~ '^system\.attributes\.hp\.(value|temp)$'
      or path ~ '^system\.attributes\.death\.(success|failure)$'
      or path ~ '^system\.attributes\.(exhaustion|inspiration)$'
      or path ~ '^system\.spells\.(spell[1-9]|pact)\.value$'
      or path ~ '^system\.currency\.(pp|gp|ep|sp|cp)$'
      or path ~ '^items\.[A-Za-z0-9]{16}\.system\.(quantity|equipped|uses\.spent|hd\.spent)$';
$$;

create table public.changes (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters (id) on delete cascade,
  -- The snapshot the player was looking at when making the edit
  snapshot_id uuid not null references public.snapshots (id) on delete cascade,
  path text not null check (public.is_editable_path(path)),
  old_value jsonb,
  new_value jsonb not null check (jsonb_typeof(new_value) in ('number', 'boolean')),
  author_id uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  applied_at timestamptz
);

create index changes_character_created_idx on public.changes (character_id, created_at);

alter table public.changes enable row level security;

-- The owner sees edits of their character, the GM sees all
create policy "changes: read own character or gm"
  on public.changes for select to authenticated
  using (
    public.is_gm()
    or exists (select 1 from public.characters c where c.id = character_id and c.owner_id = auth.uid())
  );

-- The owner adds edits only between sessions, on the character's own snapshot, as themselves.
-- The GM may add edits at any time.
create policy "changes: owner insert between sessions, or gm"
  on public.changes for insert to authenticated
  with check (
    author_id = auth.uid()
    and applied_at is null
    and exists (select 1 from public.snapshots s where s.id = snapshot_id and s.character_id = character_id)
    and (
      public.is_gm()
      or exists (
        select 1 from public.characters c
        where c.id = character_id and c.owner_id = auth.uid() and c.status = 'between_sessions'
      )
    )
  );

-- Only the GM changes rows, and only the applied mark
create policy "changes: gm marks applied"
  on public.changes for update to authenticated
  using (public.is_gm())
  with check (public.is_gm());

revoke update, delete on public.changes from authenticated, anon;
grant update (applied_at) on public.changes to authenticated;
