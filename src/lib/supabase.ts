import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export const supabaseUrl: string | undefined = import.meta.env.VITE_SUPABASE_URL
export const supabaseAnonKey: string | undefined = import.meta.env.VITE_SUPABASE_ANON_KEY

// null when the keys are not configured (e.g. local build without .env)
export const supabase: SupabaseClient | null =
  supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null
