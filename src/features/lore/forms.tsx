import { useState, type FormEvent } from 'react'
import type { LoreInput, SessionInput } from '../../lib/diary'

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))

function useSubmit<T>(onSave: (value: T) => Promise<void>) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function run(e: FormEvent, value: T) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await onSave(value)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, run }
}

/** GM form for a lore section. */
export function LoreForm({ initial, onSave, onCancel }: { initial: LoreInput; onSave: (v: LoreInput) => Promise<void>; onCancel: () => void }) {
  const [v, setV] = useState(initial)
  const { busy, error, run } = useSubmit(onSave)
  return (
    <form className="form card" onSubmit={(e) => run(e, { ...v, title: v.title.trim() })}>
      <label className="field">
        Название раздела
        <input value={v.title} maxLength={200} required onChange={(e) => setV({ ...v, title: e.target.value })} />
      </label>
      <label className="field">
        Текст
        <textarea className="notes-text" style={{ minHeight: 280 }} value={v.body} maxLength={50000} onChange={(e) => setV({ ...v, body: e.target.value })} />
      </label>
      <label className="field">
        Порядок в списке (меньше — выше)
        <input type="number" value={v.sort} onChange={(e) => setV({ ...v, sort: Number(e.target.value) || 0 })} />
      </label>
      <button type="button" className="toggle" aria-pressed={v.gmOnly} onClick={() => setV({ ...v, gmOnly: !v.gmOnly })}>
        {v.gmOnly ? 'Только мастеру' : 'Видят все игроки'}
      </button>
      {error && <p className="error">{error}</p>}
      <div className="action-row">
        <button className="btn btn-primary" type="submit" disabled={busy || !v.title.trim()}>
          {busy ? 'Сохраняю…' : 'Сохранить'}
        </button>
        <button className="btn" type="button" onClick={onCancel} disabled={busy}>
          Отмена
        </button>
      </div>
    </form>
  )
}

/** GM form for a session recap. Key moments: one per line. */
export function SessionForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: SessionInput
  onSave: (v: SessionInput) => Promise<void>
  onCancel: () => void
}) {
  const [v, setV] = useState(initial)
  const { busy, error, run } = useSubmit(onSave)
  return (
    <form className="form card" onSubmit={(e) => run(e, { ...v, title: v.title?.trim() || null })}>
      <label className="field">
        Номер сессии
        <input type="number" min={1} value={v.number} required onChange={(e) => setV({ ...v, number: Number(e.target.value) || 0 })} />
      </label>
      <label className="field">
        Название (необязательно)
        <input value={v.title ?? ''} maxLength={200} onChange={(e) => setV({ ...v, title: e.target.value })} />
      </label>
      <label className="field">
        Краткий пересказ
        <textarea className="notes-text" value={v.summary} maxLength={50000} onChange={(e) => setV({ ...v, summary: e.target.value })} />
      </label>
      <label className="field">
        Важные моменты и находки — каждый с новой строки
        <textarea className="notes-text" style={{ minHeight: 160 }} value={v.highlights} maxLength={20000} onChange={(e) => setV({ ...v, highlights: e.target.value })} />
      </label>
      {error && <p className="error">{error}</p>}
      <div className="action-row">
        <button className="btn btn-primary" type="submit" disabled={busy || v.number < 1}>
          {busy ? 'Сохраняю…' : 'Сохранить'}
        </button>
        <button className="btn" type="button" onClick={onCancel} disabled={busy}>
          Отмена
        </button>
      </div>
    </form>
  )
}
