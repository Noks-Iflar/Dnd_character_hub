import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { AppHeader } from '../../components/AppHeader'
import { getSnapshot, listChanges, type StoredSnapshot } from '../../lib/db'
import { formatDateTime } from '../../lib/format-date'
import { applyChanges, type Change } from '../../lib/snapshot/changes'
import { buildSheet } from '../../lib/snapshot/sheet'
import { SheetView } from '../sheet/SheetView'

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; base: StoredSnapshot; changes: Change[] }

/** An old version of the sheet: that snapshot plus the edits made on top of it. Read only. */
export function VersionPage() {
  const { id = '', snapshotId = '' } = useParams()
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    Promise.all([getSnapshot(snapshotId), listChanges(snapshotId)])
      .then(([base, changes]) => {
        if (cancelled) return
        setState(base ? { status: 'ready', base, changes } : { status: 'error', message: 'Такой версии нет.' })
      })
      .catch((e: unknown) => !cancelled && setState({ status: 'error', message: e instanceof Error ? e.message : String(e) }))
    return () => {
      cancelled = true
    }
  }, [snapshotId])

  const sheet = useMemo(() => {
    if (state.status !== 'ready') return null
    const { snapshot, editedPaths } = applyChanges(state.base.snapshot, state.changes)
    return buildSheet(snapshot, { editedPaths })
  }, [state])

  return (
    <>
      <AppHeader>
        <Link className="text-btn" to={`/character/${id}/history`}>
          К истории
        </Link>
      </AppHeader>
      {state.status === 'loading' && <p className="muted">Загружаю версию…</p>}
      {state.status === 'error' && <p className="error">{state.message}</p>}
      {state.status === 'ready' && (
        <p className="chip chip-tech">
          Версия от {formatDateTime(state.base.createdAt)}
          {state.changes.length ? ` с правками (${state.changes.length})` : ''} · только просмотр
        </p>
      )}
      {sheet && <SheetView sheet={sheet} />}
    </>
  )
}
