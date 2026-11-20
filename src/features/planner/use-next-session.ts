import { useEffect, useState } from 'react'
import { listPlannedSessions, nextSession, type PlannedSession } from '../../lib/planner'
import { formatInZone } from '../../lib/timezone'

/** Next planned session as short text in the user's time zone ("пн, 7 дек., 21:00"), or null. */
export function useNextSessionLabel(zone: string | null): string | null {
  const [now] = useState(() => Date.now())
  const [next, setNext] = useState<PlannedSession | null>(null)

  useEffect(() => {
    if (!zone) return
    let cancelled = false
    listPlannedSessions().then(
      (s) => !cancelled && setNext(nextSession(s, now)),
      () => undefined, // offline or no access: no date, the tile still works
    )
    return () => {
      cancelled = true
    }
  }, [now, zone])

  if (!next || !zone) return null
  return formatInZone(next.startsAt, zone, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}
