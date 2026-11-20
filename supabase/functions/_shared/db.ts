// Database access for the server functions with the service role (bypasses RLS).
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase to every Edge Function.
// pinned inline: works for `supabase functions deploy --use-api` without an import map
// deno-lint-ignore no-import-prefix
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.119.0'

export type Db = SupabaseClient

export function serviceDb(): Db {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are missing')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export function functionsUrl(): string {
  return `${Deno.env.get('SUPABASE_URL')}/functions/v1`
}

export const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } })

/** The app (GitHub Pages) calls telegram-link from the browser. */
export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
