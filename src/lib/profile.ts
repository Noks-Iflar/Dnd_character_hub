import { useEffect, useState } from 'react'
import { loadOffline, onlineOr, saveProfile } from './offline'
import { supabase } from './supabase'

export type UserRole = 'gm' | 'player'

export type Profile = {
  id: string
  display_name: string
  role: UserRole
  timezone: string
}

export type ProfileState =
  | { status: 'loading' }
  | { status: 'ready'; profile: Profile; offline: boolean }
  | { status: 'error'; message: string }

function isProfile(value: unknown): value is Profile {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.id === 'string' &&
    typeof v.display_name === 'string' &&
    (v.role === 'gm' || v.role === 'player') &&
    typeof v.timezone === 'string'
  )
}

/** Loads the signed-in user's profile row. */
export function useProfile(userId: string): ProfileState {
  const [state, setState] = useState<ProfileState>({ status: 'loading' })

  useEffect(() => {
    if (!supabase) return
    let cancelled = false
    const db = supabase
    onlineOr(() => db.from('profiles').select('id, display_name, role, timezone').eq('id', userId).maybeSingle())
      .then(({ data, error }) => {
        if (cancelled) return
        if (!error && isProfile(data)) {
          saveProfile(data)
          setState({ status: 'ready', profile: data, offline: false })
        } else if (error) {
          fallback(error.message)
        } else {
          setState({ status: 'error', message: 'Профиль не найден. Напиши мастеру.' })
        }
      })
      .catch((e: unknown) => !cancelled && fallback(e instanceof Error ? e.message : String(e)))

    function fallback(message: string) {
      const cached = loadOffline()
      if (cached?.userId === userId && cached.profile) {
        setState({ status: 'ready', profile: cached.profile, offline: true })
      } else {
        const missing = /does not exist|schema cache/i.test(message)
        setState({ status: 'error', message: missing ? 'Таблицы в базе ещё не созданы.' : message })
      }
    }
    return () => {
      cancelled = true
    }
  }, [userId])

  return state
}
