import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { AppHeader } from '../../components/AppHeader'
import { getCharacter, listSnapshotVersions, type SnapshotVersion } from '../../lib/db'
import { formatDateTime } from '../../lib/format-date'

type State = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; name: string; versions: SnapshotVersion[] }

function plural(n: number): string {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return 'правка'
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'правки'
  return 'правок'
}

/** All snapshots of a character: the version history. */
export function HistoryPage() {
  const { id = '' } = useParams()
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    Promise.all([getCharacter(id), listSnapshotVersions(id)])
      .then(([character, versions]) => !cancelled && setState({ status: 'ready', name: character?.name ?? 'Персонаж', versions }))
      .catch((e: unknown) => !cancelled && setState({ status: 'error', message: e instanceof Error ? e.message : String(e) }))
    return () => {
      cancelled = true
    }
  }, [id])

  return (
    <>
      <AppHeader>
        <Link className="text-btn" to={`/character/${id}`}>
          К листу
        </Link>
      </AppHeader>
      <div>
        <h1 style={{ fontSize: 32 }}>История версий</h1>
        <span className="brush-underline" aria-hidden="true" />
        {state.status === 'ready' && <span className="muted small">{state.name}: каждый снимок из Foundry и правки поверх него</span>}
      </div>
      {state.status === 'loading' && <p className="muted">Загружаю…</p>}
      {state.status === 'error' && <p className="error">{state.message}</p>}
      {state.status === 'ready' && state.versions.length === 0 && <p className="muted">Снимков ещё нет.</p>}
      {state.status === 'ready' && (
        <div className="attack-list">
          {state.versions.map((v, i) => (
            <Link key={v.id} className="card version-card" to={i === 0 ? `/character/${id}` : `/character/${id}/v/${v.id}`}>
              <span className="grow" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span className="row-number">{formatDateTime(v.createdAt)}</span>
                <span className="muted small">
                  {v.changes > 0 ? `${v.changes} ${plural(v.changes)} игрока` : 'без правок'}
                  {v.systemVersion ? ` · dnd5e ${v.systemVersion}` : ''}
                </span>
              </span>
              {i === 0 ? <span className="chip chip-tech">текущий</span> : <span className="muted small">открыть</span>}
            </Link>
          ))}
        </div>
      )}
    </>
  )
}
