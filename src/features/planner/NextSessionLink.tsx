import { useEffect, useState } from 'react'
import { listPlannedSessions, nextSession, type PlannedSession } from '../../lib/planner'
import { formatInZone } from '../../lib/timezone'
import { BrushButton } from '../../components/BrushButton'

/** Home-screen link to the planner showing the next session in the user's time zone. */
export function NextSessionLink({ zone }: { zone: string }) {
  const [now] = useState(() => Date.now())
  const [next, setNext] = useState<PlannedSession | null>(null)

  useEffect(() => {
    let cancelled = false
    listPlannedSessions().then(
      (s) => !cancelled && setNext(nextSession(s, now)),
      () => undefined, // offline or no access: just show the plain link
    )
    return () => {
      cancelled = true
    }
  }, [now])

  return (
    <BrushButton to="/planner">
      {next
        ? `Сессия: ${formatInZone(next.startsAt, zone, { weekday: 'short', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}`
        : 'Планировщик сессий'}
    </BrushButton>
  )
}
