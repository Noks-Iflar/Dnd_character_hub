-- 0010: personal Telegram notifications: who is connected, one-time link codes,
-- what each person wants to hear about, and what was already sent.
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.
-- The bot token never lives in the database: only in Edge Function secrets.

-- Connected chats. The person sees that they are connected (and since when) and may disconnect;
-- the chat id itself is read only by the server functions (service role).
create table public.telegram_links (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  chat_id bigint not null,
  linked_at timestamptz not null default now()
);

alter table public.telegram_links enable row level security;

create policy "telegram_links: read own"
  on public.telegram_links for select to authenticated
  using (user_id = auth.uid());

create policy "telegram_links: disconnect own"
  on public.telegram_links for delete to authenticated
  using (user_id = auth.uid());

revoke all on public.telegram_links from authenticated, anon;
grant select (user_id, linked_at) on public.telegram_links to authenticated;
grant delete on public.telegram_links to authenticated;

-- One-time codes for "t.me/<bot>?start=<code>". Created and read only by the server functions.
create table public.telegram_link_codes (
  code text primary key check (code ~ '^[A-Za-z0-9_-]{16,64}$'),
  user_id uuid not null references public.profiles (id) on delete cascade,
  expires_at timestamptz not null default now() + interval '10 minutes'
);

alter table public.telegram_link_codes enable row level security;
revoke all on public.telegram_link_codes from authenticated, anon;

-- What to send. No row = everything on.
create table public.notification_prefs (
  user_id uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  -- players
  session_scheduled boolean not null default true,
  session_moved boolean not null default true,
  game_started boolean not null default true,
  snapshot_ready boolean not null default true,
  edits_applied boolean not null default true,
  -- the GM
  edits_digest boolean not null default true,
  all_marked boolean not null default true,
  -- everyone
  remind_24h boolean not null default true,
  remind_1h boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.notification_prefs enable row level security;

create policy "notification_prefs: read own"
  on public.notification_prefs for select to authenticated
  using (user_id = auth.uid());

create policy "notification_prefs: add own"
  on public.notification_prefs for insert to authenticated
  with check (user_id = auth.uid());

create policy "notification_prefs: change own"
  on public.notification_prefs for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke delete on public.notification_prefs from authenticated, anon;

-- Every message sent (or tried). The key names the event and the person,
-- so one event never goes out twice. Written only by the server functions.
create table public.notification_log (
  key text primary key check (length(key) <= 300),
  user_id uuid references public.profiles (id) on delete cascade,
  kind text not null,
  sent_at timestamptz not null default now(),
  ok boolean,
  error text
);

create index notification_log_user_kind_idx on public.notification_log (user_id, kind, sent_at);

alter table public.notification_log enable row level security;

create policy "notification_log: read own"
  on public.notification_log for select to authenticated
  using (user_id = auth.uid());

revoke insert, update, delete on public.notification_log from authenticated, anon;
