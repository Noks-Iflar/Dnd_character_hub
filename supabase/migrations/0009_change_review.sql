-- 0009: the GM accepts or rejects each player edit before it goes to Foundry.
-- Needs 0003 (changes). Run once in Supabase: SQL Editor -> New query -> paste -> Run.
--
-- review: null = not decided yet, 'accepted' = goes into the changes file,
-- 'rejected' = does not go to Foundry and disappears from the player's sheet.
-- applied_at keeps its meaning "the GM is done with this edit": accepted edits get it
-- after being applied in Foundry, rejected ones when the GM closes the round.
-- Edits applied before this migration have review = null and count as accepted.

alter table public.changes
  add column review text check (review in ('accepted', 'rejected'));

-- Players add edits without a decision; only the GM may set one (e.g. on own edits).
-- Same rule as in 0003 plus the review condition.
drop policy "changes: owner insert between sessions, or gm" on public.changes;
create policy "changes: owner insert between sessions, or gm"
  on public.changes for insert to authenticated
  with check (
    author_id = auth.uid()
    and applied_at is null
    and (review is null or public.is_gm())
    and exists (select 1 from public.snapshots s where s.id = snapshot_id and s.character_id = character_id)
    and (
      public.is_gm()
      or exists (
        select 1 from public.characters c
        where c.id = character_id and c.owner_id = auth.uid() and c.status = 'between_sessions'
      )
    )
  );

-- The GM-only update policy from 0003 already covers rows; allow this one more column
grant update (review) on public.changes to authenticated;
