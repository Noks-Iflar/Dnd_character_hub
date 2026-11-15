import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Keep only "https://<project>.supabase.co": the dashboard sometimes shows
// the URL with a trailing slash or with "/rest/v1/", which breaks requests.
function normalizeUrl(raw: string | undefined): string | undefined {
  const trimmed = raw?.trim()
  if (!trimmed) return undefined
  try {
    return new URL(trimmed).origin
  } catch {
    return undefined
  }
}

export const supabaseUrl: string | undefined = normalizeUrl(import.meta.env.VITE_SUPABASE_URL)
export const supabaseAnonKey: string | undefined =
  import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() || undefined

// null when the keys are not configured (e.g. local build without .env)
export const supabase: SupabaseClient | null =
  supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null
