import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { latestSnapshot } from '../../lib/db'
import { formatDateTime } from '../../lib/format-date'
import { buildSheet } from '../../lib/snapshot/sheet'
import type { Snapshot } from '../../lib/snapshot/types'
import { SheetView } from '../sheet/SheetView'

type State =
  | { status: 'loading' }
  | { status: 'empty' }
  | { status: 'error'; message: string }
  | { status: 'ready'; snapshot: Snapshot; createdAt: string }

/** Sheet of a character from its latest snapshot in the database. */
export function CharacterPage() {
  const { id = '' } = useParams()
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    latestSnapshot(id)
      .then((r) => !cancelled && setState(r ? { status: 'ready', ...r } : { status: 'empty' }))
      .catch((e: unknown) => !cancelled && setState({ status: 'error', message: e instanceof Error ? e.message : String(e) }))
    return () => {
      cancelled = true
    }
  }, [id])

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
      {state.status === 'ready' && <p className="muted small">Снимок из Foundry от {formatDateTime(state.createdAt)}</p>}
      {sheet && <SheetView sheet={sheet} />}
    </>
  )
}
