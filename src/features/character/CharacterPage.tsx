import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router'
import { useAuth } from '../../lib/auth-context'
import { addChange, getCharacter, getNotes, latestSnapshot, listChanges, saveNotes, type Character, type StoredSnapshot } from '../../lib/db'
import { formatDateTime } from '../../lib/format-date'
import { loadOffline, offlineNotes, offlineSnapshot, onlineOr, saveNotesOffline, saveSnapshot } from '../../lib/offline'
import { applyChanges, type Change, type ChangeValue } from '../../lib/snapshot/changes'
import { parseSnapshotJson } from '../../lib/snapshot/parse'
import { buildSheet } from '../../lib/snapshot/sheet'
import type { Snapshot } from '../../lib/snapshot/types'
import type { NotesBinding } from '../sheet/NotesEditor'
import { SheetView, type SheetEdit } from '../sheet/SheetView'
import { AppHeader } from '../../components/AppHeader'
import { BrushButton } from '../../components/BrushButton'
import { ChangeLine } from '../../components/ChangeLine'
import { countDecisions, reviewLines } from '../../lib/review'
import { EmptyState } from '../../components/EmptyState'

type State =
  | { status: 'loading' }
  | { status: 'empty' }
  | { status: 'error'; message: string }
  | { status: 'online'; base: StoredSnapshot; changes: Change[]; character: Character | null; notes: string }
  | { status: 'offline'; snapshot: Snapshot; createdAt: string; notes: string | null }

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
      const [base, character, notes] = await Promise.all([latestSnapshot(id), getCharacter(id), getNotes(id)])
      const changes = base ? await listChanges(base.id) : []
      return { base, character, changes, notes: notes.body }
    }, 8000)
      .then(({ base, character, changes, notes }) => {
        if (cancelled) return
        if (!base) return setState({ status: 'empty' })
        if (userId) saveNotesOffline(userId, id, notes)
        setState({ status: 'online', base, changes, character, notes })
      })
      .catch((e: unknown) => {
        if (cancelled) return
        const saved = offlineSnapshot(id)
        const parsed = saved ? parseSnapshotJson(JSON.stringify(saved.data)) : null
        if (saved && parsed?.ok && parsed.snapshots[0]) {
          setState({ status: 'offline', snapshot: parsed.snapshots[0], createdAt: saved.createdAt, notes: offlineNotes(id) })
        } else {
          setState({ status: 'error', message: errorText(e) })
        }
      })
    return () => {
      cancelled = true
    }
  }, [id, userId])

  const view = useMemo(() => {
    if (state.status === 'online') {
      const applied = applyChanges(state.base.snapshot, state.changes)
      return { snapshot: applied.snapshot, sheet: buildSheet(applied.snapshot, { editedPaths: applied.editedPaths }) }
    }
    if (state.status === 'offline') return { snapshot: state.snapshot, sheet: buildSheet(state.snapshot) }
    return null
  }, [state])

  // Keep the edited sheet available offline (notes are saved on load and on every save)
  useEffect(() => {
    if (state.status === 'online' && view && userId) {
      saveSnapshot(userId, id, view.snapshot, state.base.createdAt)
    }
  }, [state, view, userId, id])

  const notes: NotesBinding | undefined =
    state.status === 'online'
      ? {
          initial: state.notes,
          save: userId
            ? async (body: string) => {
                await saveNotes(id, userId, body)
                saveNotesOffline(userId, id, body)
              }
            : null,
        }
      : state.status === 'offline' && state.notes !== null
        ? { initial: state.notes, save: null }
        : undefined

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
  // The GM's decisions, line by line (one line per field or added item)
  const own = state.status === 'online' ? state.changes : []
  const open = countDecisions(reviewLines(own.filter((c) => !c.appliedAt)))
  const rejected = reviewLines(own.filter((c) => c.review === 'rejected'))

  return (
    <>
      <AppHeader />
      {state.status === 'loading' && <p className="muted">Загружаю лист…</p>}
      {state.status === 'empty' && (
        <EmptyState image="empty-scroll" alt="Свёрнутый свиток и перо в чернильнице" title="Снимка ещё нет">
          Мастер выгрузит персонажа после ближайшей сессии. Тогда лист появится здесь.
        </EmptyState>
      )}
      {state.status === 'error' && <p className="error">{state.message}</p>}
      {state.status === 'offline' && (
        <p className="chip chip-tech">Нет связи: сохранённый снимок от {formatDateTime(state.createdAt)}, только просмотр</p>
      )}
      {state.status === 'online' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="muted small">Снимок из Foundry от {formatDateTime(state.base.createdAt)}</span>
          <BrushButton icon="letters-bundle" className="history-btn" to={`/character/${id}/history`}>
            История версий
          </BrushButton>
          {inGame ? (
            <span className="chip chip-blood">Идёт игра: правки закрыты до следующего снимка</span>
          ) : (
            <span className="muted small">
              Правки сохраняются сами и попадут в Foundry перед следующей игрой, если мастер их примет.
              {open.undecided > 0 && ` Ждут решения мастера: ${open.undecided}.`}
              {open.accepted > 0 && ` Мастер принял: ${open.accepted}.`}
              {saving > 0 && ' Сохраняю…'}
            </span>
          )}
          {rejected.length > 0 && state.status === 'online' && (
            <details className="card list rejected-edits">
              <summary className="list-row static">
                <span className="grow">Мастер отклонил правки</span>
                <span className="chip chip-blood">{rejected.length}</span>
              </summary>
              <ul className="plain-list">
                {rejected.map((line) => (
                  <li key={line.key}>
                    <ChangeLine line={line} source={state.base.snapshot.source} />
                  </li>
                ))}
              </ul>
              <p className="muted small">Их нет на листе. Если не согласен — обсуди с мастером.</p>
            </details>
          )}
          {saveError && (
            <p className="error" role="alert">
              {saveError}
            </p>
          )}
        </div>
      )}
      {view && <SheetView sheet={view.sheet} edit={edit} notes={notes} />}
    </>
  )
}
