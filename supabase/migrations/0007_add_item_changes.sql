-- 0007: "add an item from the library" as a kind of edit in the journal.
-- Needs 0003 (changes) and 0006 (library). Run once in Supabase: SQL Editor -> New query -> paste -> Run.

alter table public.changes
  add column kind text not null default 'set' check (kind in ('set', 'add_item')),
  -- For add_item: the library entry (Foundry compendium uuid), its name and type at the time of adding
  add column item_uuid text references public.library (uuid) on delete set null,
  add column item_name text check (length(item_name) <= 300),
  add column item_type text check (length(item_type) <= 50);

-- "set" edits keep the list of allowed fields; "add_item" uses the fixed path 'add-item',
-- a positive whole quantity in new_value and an existing library item.
alter table public.changes drop constraint changes_path_check;
alter table public.changes add constraint changes_edit_check check (
  (kind = 'set' and public.is_editable_path(path) and item_uuid is null)
  or (
    kind = 'add_item'
    and path = 'add-item'
    and item_uuid is not null
    and item_name is not null
    and jsonb_typeof(new_value) = 'number'
    and (new_value #>> '{}')::numeric between 1 and 999
    and (new_value #>> '{}')::numeric = trunc((new_value #>> '{}')::numeric)
  )
);
