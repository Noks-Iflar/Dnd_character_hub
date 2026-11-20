// Is Supabase reachable from here? Used by the settings screen and the sign-in diagnostics page.
import { supabaseAnonKey, supabaseUrl } from './supabase'

export type CheckResult =
  | { state: 'no-keys' }
  | { state: 'checking' }
  | { state: 'ok'; ms: number }
  | { state: 'error'; message: string }

export const hasKeys = (): boolean => !!supabaseUrl && !!supabaseAnonKey

export async function checkSupabase(): Promise<CheckResult> {
  if (!supabaseUrl || !supabaseAnonKey) return { state: 'no-keys' }
  const started = performance.now()
  try {
    // Auth health endpoint: answers without any tables in the database
    const res = await fetch(`${supabaseUrl}/auth/v1/health`, { headers: { apikey: supabaseAnonKey } })
    if (!res.ok) return { state: 'error', message: `Сервер ответил кодом ${res.status}` }
    return { state: 'ok', ms: Math.round(performance.now() - started) }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return { state: 'error', message: `Нет связи: ${message}` }
  }
}
