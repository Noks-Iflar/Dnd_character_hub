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
`

export async function createDb(): Promise<PGlite> {
  const db = new PGlite()
  await db.exec(SUPABASE_STUB)
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()
  for (const file of files) {
    await db.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'))
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
