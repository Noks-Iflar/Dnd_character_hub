import { useEffect, useState } from 'react'
import { useAuth } from '../../lib/auth-context'
import { listCharacters } from '../../lib/db'
import { useProfile } from '../../lib/profile'

/** Who is looking at the diary: user id, GM flag and a default signature (own character's name). */
export function useViewer(): { userId: string | null; isGm: boolean; defaultName: string } {
  const auth = useAuth()
  const userId = auth.status === 'signed-in' ? auth.session.user.id : null
  const profile = useProfile(userId ?? '')
  const isGm = profile.status === 'ready' && profile.profile.role === 'gm'
  const [defaultName, setDefaultName] = useState('')

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    listCharacters()
      .then((list) => {
        if (cancelled) return
        const own = list.find((c) => c.ownerId === userId)
        setDefaultName(own?.name ?? '')
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [userId])

  return { userId, isGm, defaultName: isGm && !defaultName ? 'Мастер' : defaultName }
}
