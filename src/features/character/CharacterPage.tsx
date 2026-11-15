import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useAuth } from '../../lib/auth-context'
import { latestSnapshot } from '../../lib/db'
import { formatDateTime } from '../../lib/format-date'
import { loadOffline, offlineSnapshot, onlineOr, saveSnapshot } from '../../lib/offline'
import { parseSnapshotJson } from '../../lib/snapshot/parse'
import { buildSheet } from '../../lib/snapshot/sheet'
import type { Snapshot } from '../../lib/snapshot/types'
import { SheetView } from '../sheet/SheetView'

type State =
  | { status: 'loading' }
  | { status: 'empty' }
  | { status: 'error'; message: string }
  | { status: 'ready'; snapshot: Snapshot; createdAt: string; offline: boolean }

/** Sheet of a character from its latest snapshot in the database. */
export function CharacterPage() {
  const { id = '' } = useParams()
  const [state, setState] = useState<State>({ status: 'loading' })

  const auth = useAuth()
  const userId = auth.status === 'signed-in' ? auth.session.user.id : (loadOffline()?.userId ?? null)

  useEffect(() => {
    let cancelled = false

    function fromCache(message: string) {
      const saved = offlineSnapshot(id)
      const parsed = saved ? parseSnapshotJson(JSON.stringify(saved.data)) : null
      if (saved && parsed?.ok && parsed.snapshots[0]) {
        setState({ status: 'ready', snapshot: parsed.snapshots[0], createdAt: saved.createdAt, offline: true })
      } else {
        setState({ status: 'error', message })
      }
    }

    onlineOr(() => latestSnapshot(id))
      .then((r) => {
        if (cancelled) return
        if (!r) return setState({ status: 'empty' })
        if (userId) saveSnapshot(userId, id, r.snapshot, r.createdAt)
        setState({ status: 'ready', ...r, offline: false })
      })
      .catch((e: unknown) => !cancelled && fromCache(e instanceof Error ? e.message : String(e)))
    return () => {
      cancelled = true
    }
  }, [id, userId])

  const sheet = useMemo(() => (state.status === 'ready' ? buildSheet(state.snapshot) : null), [state])

  return (
    <>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Link className="brand" to="/" style={{ textDecoration: 'none' }}>
          Dnd Hub
        </Link>
        <Link to="/">← К персонажам</Link>
      </header>
      {state.status === 'loading' && <p className="muted">Загружаю лист…</p>}
      {state.status === 'empty' && <p className="muted">У этого персонажа ещё нет снимка. Его загружает мастер.</p>}
      {state.status === 'error' && <p className="error">{state.message}</p>}
      {state.status === 'ready' &&
        (state.offline ? (
          <p className="chip chip-tech">Нет связи: сохранённый снимок от {formatDateTime(state.createdAt)}</p>
        ) : (
          <p className="muted small">Снимок из Foundry от {formatDateTime(state.createdAt)}</p>
        ))}
      {sheet && <SheetView sheet={sheet} />}
    </>
  )
}
