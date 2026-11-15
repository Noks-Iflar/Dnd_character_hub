import { useEffect, useRef, useState } from 'react'

export type NotesBinding = {
  initial: string
  /** null: read only (offline) */
  save: ((body: string) => Promise<void>) | null
}

type Status = 'idle' | 'dirty' | 'saving' | 'saved' | 'error'

/** Personal notes with autosave a moment after the player stops typing. */
export function NotesEditor({ notes }: { notes: NotesBinding }) {
  const [body, setBody] = useState(notes.initial)
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latest = useRef(body)

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  function persist(text: string) {
    if (!notes.save) return
    setStatus('saving')
    notes
      .save(text)
      .then(() => setStatus(latest.current === text ? 'saved' : 'dirty'))
      .catch((e: unknown) => {
        setStatus('error')
        setError(e instanceof Error ? e.message : String(e))
      })
  }

  function onChange(text: string) {
    setBody(text)
    latest.current = text
    setStatus('dirty')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => persist(text), 1200)
  }

  const statusText: Record<Status, string> = {
    idle: notes.save ? 'Видят только ты и мастер. В Foundry не переносятся.' : 'Нет связи: заметки только для чтения.',
    dirty: 'Есть несохранённые изменения…',
    saving: 'Сохраняю…',
    saved: 'Сохранено',
    error: `Не сохранилось: ${error ?? ''}`,
  }

  return (
    <div className="notes">
      <textarea
        className="notes-text"
        aria-label="Личные заметки"
        placeholder="Планы, догадки, должники, имена…"
        value={body}
        readOnly={!notes.save}
        maxLength={20000}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => {
          if (status === 'dirty') {
            if (timer.current) clearTimeout(timer.current)
            persist(body)
          }
        }}
      />
      <span className={`small ${status === 'error' ? 'error' : 'muted'}`} aria-live="polite">
        {statusText[status]}
      </span>
    </div>
  )
}
