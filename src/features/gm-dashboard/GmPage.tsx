import { useEffect, useState, type ChangeEvent } from 'react'
import { Link } from 'react-router'
import {
  listCharacters,
  listPendingChanges,
  listProfiles,
  markChangesApplied,
  setCharacterOwner,
  setCharacterStatus,
  snapshotSizeKb,
  uploadSnapshots,
  type Character,
  type CharacterStatus,
  type PendingChange,
  type UploadResult,
} from '../../lib/db'
import { formatDateTime } from '../../lib/format-date'
import type { Profile } from '../../lib/profile'
import { parseSnapshotJson } from '../../lib/snapshot/parse'
import { SUPPORTED, type Snapshot } from '../../lib/snapshot/types'
import { PendingChanges } from './PendingChanges'
import { AppHeader } from '../../components/AppHeader'

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))

export function GmPage() {
  const [characters, setCharacters] = useState<Character[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [pendingChanges, setPendingChanges] = useState<PendingChange[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [pending, setPending] = useState<Snapshot[]>([])
  const [fileError, setFileError] = useState<string | null>(null)
  const [results, setResults] = useState<UploadResult[]>([])
  const [busy, setBusy] = useState(false)

  const [version, setVersion] = useState(0)
  const reload = () => setVersion((v) => v + 1)

  useEffect(() => {
    let cancelled = false
    Promise.all([listCharacters(), listProfiles(), listPendingChanges()])
      .then(([c, p, ch]) => {
        if (cancelled) return
        setCharacters(c)
        setProfiles(p)
        setPendingChanges(ch)
        setLoadError(null)
      })
      .catch((e: unknown) => !cancelled && setLoadError(errorText(e)))
    return () => {
      cancelled = true
    }
  }, [version])

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const parsed = parseSnapshotJson(await file.text())
    setResults([])
    if (parsed.ok) {
      setPending(parsed.snapshots)
      setFileError(null)
    } else {
      setPending([])
      setFileError(parsed.error)
    }
  }

  async function upload() {
    setBusy(true)
    try {
      setResults(await uploadSnapshots(pending))
      setPending([])
      reload()
    } catch (e) {
      setResults([{ name: 'Загрузка', ok: false, message: errorText(e) }])
    } finally {
      setBusy(false)
    }
  }

  async function changeOwner(characterId: string, ownerId: string) {
    try {
      await setCharacterOwner(characterId, ownerId || null)
      reload()
    } catch (e) {
      setLoadError(errorText(e))
    }
  }

  async function run(action: () => Promise<void>) {
    try {
      await action()
      reload()
    } catch (e) {
      setLoadError(errorText(e))
    }
  }

  const setStatus = (ids: string[], status: CharacterStatus) => run(() => setCharacterStatus(ids, status))
  const markApplied = (ids: string[]) => run(() => markChangesApplied(ids))
  const pendingOf = (characterId: string) => pendingChanges.filter((c) => c.characterId === characterId)
  const pendingByActor = (actorId: string | null) => {
    const character = characters.find((c) => c.foundryActorId === actorId)
    return character ? pendingOf(character.id).length : 0
  }
  const allIds = characters.map((c) => c.id)
  const anyBetween = characters.some((c) => c.status === 'between_sessions')

  const players = profiles.filter((p) => p.role === 'player')

  return (
    <>
      <AppHeader>
        <Link className="text-btn" to="/">
          На главную
        </Link>
      </AppHeader>
      <h1 style={{ fontSize: 32 }}>Мастер</h1>

      <h2 className="section-title">Загрузить снимок</h2>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <p className="muted small" style={{ margin: 0 }}>
          Файл из макроса «Снимок персонажа»: один персонаж или вся партия. Новые персонажи создаются сами.
        </p>
        <label className="btn">
          Выбрать файл
          <input type="file" accept=".json,application/json" onChange={onFile} hidden />
        </label>
        {fileError && <p className="error">{fileError}</p>}
        {pending.length > 0 && (
          <>
            <ul className="plain-list">
              {pending.map((s, i) => {
                const wrongVersion =
                  s.meta.foundryVersion !== SUPPORTED.foundryVersion || s.meta.systemVersion !== SUPPORTED.systemVersion
                return (
                  <li key={i}>
                    <span>{String(s.source.name ?? '?')}</span>
                    <span className="muted small">
                      {' '}
                      · {snapshotSizeKb(s)} КБ{s.computed ? '' : ' · без значений Foundry'}
                    </span>
                    {pendingByActor(s.meta.actorId) > 0 && (
                      <span className="error small">
                        {' '}
                        · {pendingByActor(s.meta.actorId)} правок ещё не отмечены применёнными: если ты не перенёс их в Foundry, они
                        пропадут с листа
                      </span>
                    )}
                    {wrongVersion && (
                      <span className="error small">
                        {' '}
                        · Foundry {s.meta.foundryVersion ?? '?'} / dnd5e {s.meta.systemVersion ?? '?'}
                      </span>
                    )}
                  </li>
                )
              })}
            </ul>
            <button className="btn btn-primary" onClick={upload} disabled={busy}>
              {busy ? 'Загружаю…' : `Загрузить: ${pending.length}`}
            </button>
          </>
        )}
        {results.length > 0 && (
          <ul className="plain-list" aria-live="polite">
            {results.map((r, i) => (
              <li key={i} className={r.ok ? '' : 'error'}>
                {r.name}: {r.message}
              </li>
            ))}
          </ul>
        )}
      </div>

      <h2 className="section-title">Персонажи</h2>
      {loadError && <p className="error">{loadError}</p>}
      {characters.length > 0 && (
        <button
          type="button"
          className={anyBetween ? 'btn btn-primary' : 'btn'}
          onClick={() => setStatus(allIds, anyBetween ? 'in_game' : 'between_sessions')}
        >
          {anyBetween ? 'Начать игру: закрыть правки всем' : 'Игра окончена: открыть правки всем'}
        </button>
      )}
      {characters.length === 0 && !loadError && <p className="muted">Пока пусто. Загрузи первый снимок.</p>}
      <div className="attack-list">
        {characters.map((c) => (
          <div key={c.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <Link to={`/character/${c.id}`} className="row-number" style={{ textDecoration: 'none' }}>
                {c.name}
              </Link>
              <span className={c.status === 'in_game' ? 'chip chip-blood' : 'chip chip-tech'}>
                {c.status === 'in_game' ? 'В игре' : 'Между сессиями'}
              </span>
            </div>
            <span className="muted small">Снимок: {formatDateTime(c.lastSnapshotAt)}</span>
            <button
              type="button"
              className="toggle"
              aria-pressed={c.status === 'in_game'}
              onClick={() => setStatus([c.id], c.status === 'in_game' ? 'between_sessions' : 'in_game')}
            >
              {c.status === 'in_game' ? 'Открыть правки' : 'Закрыть правки (игра)'}
            </button>
            {pendingOf(c.id).length > 0 && (
              <div className="card list" style={{ background: 'var(--surface-sunken)' }}>
                <PendingChanges characterId={c.id} changes={pendingOf(c.id)} onMarkApplied={markApplied} />
              </div>
            )}
            <label className="field">
              Игрок
              <select className="select" value={c.ownerId ?? ''} onChange={(e) => changeOwner(c.id, e.target.value)}>
                <option value="">— не назначен —</option>
                {players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.display_name || p.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ))}
      </div>
      {players.length === 0 && characters.length > 0 && (
        <p className="muted small">Игроков пока нет: создай им аккаунты в Supabase (Authentication → Users).</p>
      )}
    </>
  )
}
