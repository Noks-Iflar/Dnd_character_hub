import { useEffect, useState, type ReactNode } from 'react'
import { AuthContext, type AuthState } from './auth-context'
import { clearOffline } from './offline'
import { supabase } from './supabase'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(supabase ? { status: 'loading' } : { status: 'signed-out' })

  useEffect(() => {
    if (!supabase) return
    // Fires immediately with the stored session (INITIAL_SESSION), then on every change
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') clearOffline()
      setState(session ? { status: 'signed-in', session } : { status: 'signed-out' })
    })
    return () => data.subscription.unsubscribe()
  }, [])

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>
}
