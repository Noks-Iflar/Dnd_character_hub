import { useAuth } from './auth-context'
import { isOffline, loadOffline } from './offline'

/** Signed in, or offline with this device's saved copy: account screens (settings, sidebar) make sense. */
export function useHasAccount(): boolean {
  const auth = useAuth()
  return auth.status === 'signed-in' || (auth.status === 'signed-out' && isOffline() && !!loadOffline())
}
