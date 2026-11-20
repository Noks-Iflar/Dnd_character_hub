import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { addEntry, deleteEntry, ENTRY_KIND_LABEL, listEntries, updateEntry, type DiaryEntry, type EntryKind, type EntryTarget } from '../../lib/diary'
import { formatDateTime } from '../../lib/format-date'
import { BrushButton } from '../../components/BrushButton'

const KINDS: EntryKind[] = ['memory', 'lore', 'general']
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))

type Draft = { kind: EntryKind; body: string; characterName: string }

function EntryForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: Draft
  submitLabel: string
  onSubmit: (d: Draft) => Promise<void>
  onCancel?: () => void
}) {
  const [draft, setDraft] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!draft.body.trim()) return
    setBusy(true)
    setError(null)
    try {
      await onSubmit({ ...draft, body: draft.body.trim(), characterName: draft.characterName.trim() })
      if (!onCancel) setDraft({ ...draft, body: '' })
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <div className="segmented" role="group" aria-label="Вид записи">
        {KINDS.map((k) => (
          <button key={k} type="button" aria-pressed={draft.kind === k} onClick={() => setDraft({ ...draft, kind: k })}>
            {k === 'memory' ? 'Воспоминание' : k === 'lore' ? 'К лору' : 'Общее'}
          </button>
        ))}
      </div>
      {draft.kind !== 'general' && (
        <label className="field">
          Подпись (персонаж)
          <input value={draft.characterName} maxLength={100} onChange={(e) => setDraft({ ...draft, characterName: e.target.value })} />
        </label>
      )}
      <label className="field">
        Текст
        <textarea
          className="notes-text"
          style={{ minHeight: 110 }}
          value={draft.body}
          maxLength={10000}
          required
          onChange={(e) => setDraft({ ...draft, body: e.target.value })}
        />
      </label>
      {error && <p className="error">{error}</p>}
      <div className={onCancel ? 'action-row' : ''}>
        <BrushButton variant="primary" type="submit" block={!onCancel} disabled={busy || !draft.body.trim()}>
          {busy ? 'Сохраняю…' : submitLabel}
        </BrushButton>
        {onCancel && (
          <BrushButton onClick={onCancel} disabled={busy}>
            Отмена
          </BrushButton>
        )}
      </div>
    </form>
  )
}

/** Player entries under a lore page or a session: grouped by kind, add / edit / delete own. */
export function Entries({ target, userId, isGm, defaultName }: { target: EntryTarget; userId: string | null; isGm: boolean; defaultName: string }) {
  const [entries, setEntries] = useState<DiaryEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const targetKey = 'lorePageId' in target ? `l:${target.lorePageId}` : `s:${target.sessionId}`

  const reload = useCallback(() => {
    listEntries(target)
      .then((list) => {
        setEntries(list)
        setError(null)
      })
      .catch((e: unknown) => setError(errorText(e)))
    // targetKey identifies the target; the object itself changes on every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetKey])

  useEffect(reload, [reload])

  async function remove(id: string) {
    if (!window.confirm('Удалить запись?')) return
    try {
      await deleteEntry(id)
      reload()
    } catch (e) {
      setError(errorText(e))
    }
  }

  return (
    <>
      <h2 className="section-title">Записи игроков</h2>
      {error && <p className="error">{error}</p>}
      {entries === null && !error && <p className="muted">Загружаю…</p>}
      {entries && entries.length === 0 && <p className="muted">Пока никто ничего не написал.</p>}
      {entries &&
        KINDS.map((kind) => {
          const group = entries.filter((e) => e.kind === kind)
          if (!group.length) return null
          return (
            <section key={kind} className="entry-group">
              <h3 className="entry-kind">{ENTRY_KIND_LABEL[kind]}</h3>
              {group.map((e) =>
                editing === e.id ? (
                  <div key={e.id} className="card">
                    <EntryForm
                      initial={{ kind: e.kind, body: e.body, characterName: e.characterName ?? '' }}
                      submitLabel="Сохранить"
                      onCancel={() => setEditing(null)}
                      onSubmit={async (d) => {
                        await updateEntry(e.id, { ...d, characterName: d.kind === 'general' ? null : d.characterName || null })
                        setEditing(null)
                        reload()
                      }}
                    />
                  </div>
                ) : (
                  <article key={e.id} className="card entry">
                    <div className="entry-head">
                      <span className="entry-who">{e.kind === 'general' ? 'Общее' : (e.characterName ?? 'Без подписи')}</span>
                      <span className="muted small">{formatDateTime(e.createdAt)}</span>
                    </div>
                    <p className="prose">{e.body}</p>
                    {(isGm || e.authorId === userId) && (
                      <div className="entry-actions">
                        <BrushButton variant="link" onClick={() => setEditing(e.id)}>
                          Изменить
                        </BrushButton>
                        <BrushButton variant="link" danger onClick={() => remove(e.id)}>
                          Удалить
                        </BrushButton>
                      </div>
                    )}
                  </article>
                ),
              )}
            </section>
          )
        })}
      {userId && editing === null && (
        <details className="card list add-entry">
          <summary className="list-row static">
            <span className="grow">Добавить запись</span>
            <span className="muted">+</span>
          </summary>
          <div style={{ padding: 14 }}>
            <EntryForm
              key={defaultName}
              initial={{ kind: 'memory', body: '', characterName: defaultName }}
              submitLabel="Добавить"
              onSubmit={async (d) => {
                await addEntry(target, { ...d, characterName: d.kind === 'general' ? null : d.characterName || null })
                reload()
              }}
            />
          </div>
        </details>
      )}
    </>
  )
}
