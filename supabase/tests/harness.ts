// Runs our migrations in an in-memory Postgres (PGlite) with a minimal
// stand-in for Supabase's auth schema, so RLS policies can be tested locally.
import { PGlite } from '@electric-sql/pglite'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const MIGRATIONS_DIR = join(import.meta.dirname, '..', 'migrations')

const SUPABASE_STUB = `
create role anon;
create role authenticated;
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to authenticated, anon;
grant usage on schema public to authenticated, anon;
alter default privileges in schema public grant all on tables to authenticated, anon;
alter default privileges in schema public grant all on functions to authenticated, anon;
create role service_role;
grant usage on schema public to service_role;

-- pg_net, Vault and pg_cron are not in PGlite: record what would be sent / scheduled instead
create schema net;
create table net._calls (id serial primary key, url text, body jsonb, headers jsonb);
create function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds integer default 5000)
returns bigint language sql as $$ insert into net._calls (url, body, headers) values (url, body, headers) returning id::bigint $$;
create schema vault;
create table vault.secrets (name text primary key, secret text);
create view vault.decrypted_secrets as select name, secret as decrypted_secret from vault.secrets;
create schema cron;
create table cron._jobs (name text primary key, schedule text, command text);
create function cron.schedule(job_name text, schedule text, command text) returns bigint language sql as $$
  insert into cron._jobs values (job_name, schedule, command) on conflict (name) do update set schedule = excluded.schedule, command = excluded.command returning 1::bigint
$$;
`

/** Extensions that exist only on Supabase; their stand-ins are in SUPABASE_STUB. */
const SUPABASE_ONLY = /^create extension if not exists (pg_net|pg_cron);$/gm

/** `beforeMigrations` runs after the auth stub, e.g. to add users that already exist. */
export async function createDb(beforeMigrations = ''): Promise<PGlite> {
  const db = new PGlite()
  await db.exec(SUPABASE_STUB)
  if (beforeMigrations) await db.exec(beforeMigrations)
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()
  for (const file of files) {
    await db.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf8').replace(SUPABASE_ONLY, ''))
  }
  return db
}

export type QueryResult = { ok: true; rows: Record<string, unknown>[] } | { ok: false; error: string }

/** Runs a query as a signed-in user (uid) or as an anonymous visitor (null). */
export async function runAs(db: PGlite, uid: string | null, query: string): Promise<QueryResult> {
  try {
    const rows = await db.transaction(async (tx) => {
      if (uid) {
        await tx.exec(`set local role authenticated; select set_config('request.jwt.claim.sub', '${uid}', true);`)
      } else {
        await tx.exec('set local role anon')
      }
      return (await tx.query<Record<string, unknown>>(query)).rows
    })
    return { ok: true, rows }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
