-- 0011: app events -> the "notify" Edge Function, and an hourly job for reminders.
-- Needs 0010 and two Vault secrets created by hand (see the instructions in the pull request):
--   project_url   — https://<project>.supabase.co
--   notify_secret — a random string; the notify function accepts only calls that carry it.
-- Until both secrets exist, nothing is sent and the app works as before.

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- The notify function (service role) checks the x-notify-secret header with this.
create function public.notify_secret_ok(secret text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(secret, '') <> '' and exists (
    select 1 from vault.decrypted_secrets where name = 'notify_secret' and decrypted_secret = secret
  );
$$;

revoke execute on function public.notify_secret_ok(text) from public, anon, authenticated;
grant execute on function public.notify_secret_ok(text) to service_role;

-- Queues a call of the notify function. pg_net sends it after the transaction commits
-- (a rolled-back action sends nothing) and never makes the app wait for Telegram.
create function public.send_notification(event jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  base text;
  secret text;
begin
  select decrypted_secret into base from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'notify_secret';
  if base is null or secret is null then
    return;
  end if;
  perform net.http_post(
    url := rtrim(base, '/') || '/functions/v1/notify',
    body := event,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', secret)
  );
exception when others then
  -- a notification must never break what the person was doing in the app
  raise warning 'send_notification failed: %', sqlerrm;
end;
$$;

revoke execute on function public.send_notification(jsonb) from public, anon, authenticated;

-- ---- sessions: set, moved ----
create function public.notify_planned_session()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.send_notification(jsonb_build_object('type', 'session_scheduled', 'session_id', new.id));
  elsif new.starts_at is distinct from old.starts_at then
    perform public.send_notification(jsonb_build_object('type', 'session_moved', 'session_id', new.id));
  end if;
  return null;
end;
$$;

create trigger planned_sessions_notify
  after insert or update of starts_at on public.planned_sessions
  for each row execute function public.notify_planned_session();

-- ---- the GM starts the game: characters go in_game (the whole party in one statement) ----
create function public.notify_game_started()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ids jsonb;
begin
  select jsonb_agg(n.id) into ids
  from new_rows n join old_rows o on o.id = n.id
  where n.status = 'in_game' and o.status is distinct from 'in_game';
  if ids is not null then
    perform public.send_notification(jsonb_build_object('type', 'game_started', 'character_ids', ids));
  end if;
  return null;
end;
$$;

create trigger characters_notify_game_started
  after update on public.characters
  referencing old table as old_rows new table as new_rows
  for each statement execute function public.notify_game_started();

-- ---- new snapshots after the session ----
create function public.notify_snapshots()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ids jsonb;
begin
  select jsonb_agg(id) into ids from new_rows;
  if ids is not null then
    perform public.send_notification(jsonb_build_object('type', 'snapshot_ready', 'snapshot_ids', ids));
  end if;
  return null;
end;
$$;

create trigger snapshots_notify
  after insert on public.snapshots
  referencing new table as new_rows
  for each statement execute function public.notify_snapshots();

-- ---- the GM marked accepted edits as applied in Foundry ----
create function public.notify_edits_applied()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ids jsonb;
begin
  select jsonb_agg(distinct n.character_id) into ids
  from new_rows n join old_rows o on o.id = n.id
  where o.applied_at is null and n.applied_at is not null and n.review is distinct from 'rejected';
  if ids is not null then
    perform public.send_notification(jsonb_build_object('type', 'edits_applied', 'character_ids', ids));
  end if;
  return null;
end;
$$;

create trigger changes_notify_applied
  after update on public.changes
  referencing old table as old_rows new table as new_rows
  for each statement execute function public.notify_edits_applied();

-- ---- someone marked free time: maybe everyone has now ----
create function public.notify_availability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from new_rows) then
    perform public.send_notification(jsonb_build_object('type', 'availability'));
  end if;
  return null;
end;
$$;

create trigger availability_notify
  after insert on public.availability
  referencing new table as new_rows
  for each statement execute function public.notify_availability();

-- ---- every hour at :05 — reminders a day and an hour before, the GM's evening digest ----
select cron.schedule('dndhub-notify-hourly', '5 * * * *', $$ select public.send_notification('{"type": "tick"}'::jsonb) $$);
