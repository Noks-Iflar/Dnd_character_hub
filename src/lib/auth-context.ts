import type { Session } from '@supabase/supabase-js'
import { createContext, useContext } from 'react'

export type AuthState =
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'signed-in'; session: Session }

export const AuthContext = createContext<AuthState>({ status: 'loading' })

export function useAuth(): AuthState {
  return useContext(AuthContext)
}
