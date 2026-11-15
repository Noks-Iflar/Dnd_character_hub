import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useAuth } from '../../lib/auth-context'
import { addChange, getCharacter, latestSnapshot, listChanges, type Character, type StoredSnapshot } from '../../lib/db'
import { formatDateTime } from '../../lib/format-date'
import { loadOffline, offlineSnapshot, onlineOr, saveSnapshot } from '../../lib/offline'
import { applyChanges, type Change, type ChangeValue } from '../../lib/snapshot/changes'
import { parseSnapshotJson } from '../../lib/snapshot/parse'
import { buildSheet } from '../../lib/snapshot/sheet'
import type { Snapshot } from '../../lib/snapshot/types'
import { SheetView, type SheetEdit } from '../sheet/SheetView'
import { AppHeader } from '../../components/AppHeader'

type State =
  | { status: 'loading' }
  | { status: 'empty' }
  | { status: 'error'; message: string }
  | { status: 'online'; base: StoredSnapshot; changes: Change[]; character: Character | null }
  | { status: 'offline'; snapshot: Snapshot; createdAt: string }

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** Sheet of a character: latest snapshot from the database plus the journal of edits. */
export function CharacterPage() {
  const { id = '' } = useParams()
  const [state, setState] = useState<State>({ status: 'loading' })
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(0)
  const auth = useAuth()
  const userId = auth.status === 'signed-in' ? auth.session.user.id : (loadOffline()?.userId ?? null)

  useEffect(() => {
    let cancelled = false
    onlineOr(async () => {
      const [base, character] = await Promise.all([latestSnapshot(id), getCharacter(id)])
      const changes = base ? await listChanges(base.id) : []
      return { base, character, changes }
    }, 8000)
      .then(({ base, character, changes }) => {
        if (cancelled) return
        if (!base) return setState({ status: 'empty' })
        setState({ status: 'online', base, changes, character })
      })
      .catch((e: unknown) => {
        if (cancelled) return
        const saved = offlineSnapshot(id)
        const parsed = saved ? parseSnapshotJson(JSON.stringify(saved.data)) : null
        if (saved && parsed?.ok && parsed.snapshots[0]) {
          setState({ status: 'offline', snapshot: parsed.snapshots[0], createdAt: saved.createdAt })
        } else {
          setState({ status: 'error', message: errorText(e) })
        }
      })
    return () => {
      cancelled = true
    }
  }, [id])

  const view = useMemo(() => {
    if (state.status === 'online') {
      const applied = applyChanges(state.base.snapshot, state.changes)
      return { snapshot: applied.snapshot, sheet: buildSheet(applied.snapshot, { editedPaths: applied.editedPaths }) }
    }
    if (state.status === 'offline') return { snapshot: state.snapshot, sheet: buildSheet(state.snapshot) }
    return null
  }, [state])

  // Keep the edited sheet available offline
  useEffect(() => {
    if (state.status === 'online' && view && userId) saveSnapshot(userId, id, view.snapshot, state.base.createdAt)
  }, [state, view, userId, id])

  const record = useCallback(
    (path: string, oldValue: ChangeValue | null, newValue: ChangeValue) => {
      if (state.status !== 'online') return
      const { base } = state
      setSaving((n) => n + 1)
      setSaveError(null)
      addChange({ characterId: id, snapshotId: base.id, path, oldValue, newValue })
        .then(() => listChanges(base.id))
        .then((changes) => setState((s) => (s.status === 'online' ? { ...s, changes } : s)))
        .catch((e: unknown) => setSaveError(errorText(e)))
        .finally(() => setSaving((n) => n - 1))
    },
    [state, id],
  )

  const inGame = state.status === 'online' && state.character?.status === 'in_game'
  const edit: SheetEdit | undefined = state.status === 'online' && !inGame ? { set: record } : undefined
  const pendingCount = state.status === 'online' ? state.changes.filter((c) => !c.appliedAt).length : 0

  return (
    <>
      <AppHeader>
        <Link className="text-btn" to="/">
          К персонажам
        </Link>
      </AppHeader>
      {state.status === 'loading' && <p className="muted">Загружаю лист…</p>}
      {state.status === 'empty' && <p className="muted">У этого персонажа ещё нет снимка. Его загружает мастер.</p>}
      {state.status === 'error' && <p className="error">{state.message}</p>}
      {state.status === 'offline' && (
        <p className="chip chip-tech">Нет связи: сохранённый снимок от {formatDateTime(state.createdAt)}, только просмотр</p>
      )}
      {state.status === 'online' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="muted small">Снимок из Foundry от {formatDateTime(state.base.createdAt)}</span>
          {inGame ? (
            <span className="chip chip-blood">Идёт игра: правки закрыты до следующего снимка</span>
          ) : (
            <span className="muted small">
              Правки сохраняются сами и попадут в Foundry перед следующей игрой.
              {pendingCount > 0 && ` Ждут мастера: ${pendingCount}.`}
              {saving > 0 && ' Сохраняю…'}
            </span>
          )}
          {saveError && (
            <p className="error" role="alert">
              {saveError}
            </p>
          )}
        </div>
      )}
      {view && <SheetView sheet={view.sheet} edit={edit} />}
    </>
  )
}
