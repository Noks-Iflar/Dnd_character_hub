-- 0006: compendium library (catalogue). Loaded by the GM from the "Выгрузка библиотеки" macro;
-- everyone signed in reads it. Texts of paid modules live only here, never in the repository.
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.

create table public.library (
  -- Foundry document uuid, e.g. Compendium.ag-fifthpendium.equipment.Item.<id>
  uuid text primary key,
  source text not null check (source in ('ag', 'laaru', 'other')),
  pack text not null,
  pack_label text not null,
  category text not null check (category in ('items', 'spells', 'feats', 'origins', 'classes', 'features', 'bastions', 'rules')),
  type text not null,
  subtype text,
  name text not null,
  name_en text,
  rarity text,
  level integer,
  school text,
  price_value numeric,
  price_denomination text,
  weight numeric,
  attunement text,
  properties text[] not null default '{}',
  description text not null default '',
  imported_at timestamptz not null default now()
);

create index library_category_idx on public.library (category);

alter table public.library enable row level security;

create policy "library: read" on public.library for select to authenticated using (true);
create policy "library: gm insert" on public.library for insert to authenticated with check (public.is_gm());
create policy "library: gm update" on public.library for update to authenticated using (public.is_gm()) with check (public.is_gm());
create policy "library: gm delete" on public.library for delete to authenticated using (public.is_gm());
