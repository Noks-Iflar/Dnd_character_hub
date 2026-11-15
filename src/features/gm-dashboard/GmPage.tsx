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
import { CharacterCard } from '../../components/CharacterCard'
import { EmptyState } from '../../components/EmptyState'
import { ThemeToggle } from '../../components/ThemeToggle'
import { loadSummaries, type CharacterSummary } from '../../lib/summary'
import { PendingChanges } from './PendingChanges'

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))

export function GmPage() {
  const [characters, setCharacters] = useState<Character[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [pendingChanges, setPendingChanges] = useState<PendingChange[]>([])
  const [summaries, setSummaries] = useState<Record<string, CharacterSummary>>({})
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
        return loadSummaries(c.map((x) => x.id)).then((sum) => !cancelled && setSummaries(sum))
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

  const lastSnapshot = characters.map((c) => c.lastSnapshotAt).filter((d): d is string => !!d).sort().at(-1) ?? null
  const ownerName = (ownerId: string | null) => profiles.find((p) => p.id === ownerId)?.display_name ?? null

  return (
    <>
      <div className="art-header">
        <img src={`${import.meta.env.BASE_URL}ui/art/party.jpg`} alt="Партия идёт мимо горящих заводов" style={{ objectPosition: 'center 30%' }} />
        <div className="art-header-bar">
          <Link className="brand" to="/">
            Dnd Hub
          </Link>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span className="chip chip-on-art">Мастер</span>
            <ThemeToggle />
          </span>
        </div>
      </div>
      <div className="art-title art-title-short">
        <h1 style={{ fontSize: 32 }}>Партия</h1>
        <span className="brush-underline" aria-hidden="true" />
        <span className="muted small">{lastSnapshot ? `Последний снимок: ${formatDateTime(lastSnapshot)}` : 'Снимков ещё нет'}</span>
      </div>

      {loadError && <p className="error">{loadError}</p>}

      <div className="action-row">
        <button
          type="button"
          className="btn btn-primary"
          disabled={characters.length === 0}
          onClick={() => setStatus(allIds, anyBetween ? 'in_game' : 'between_sessions')}
        >
          {anyBetween ? 'Начать игру' : 'Игра окончена'}
        </button>
        <label className="btn">
          Загрузить снимок
          <input type="file" accept=".json,application/json" onChange={onFile} hidden />
        </label>
      </div>

      {(fileError || pending.length > 0 || results.length > 0) && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {fileError && <p className="error">{fileError}</p>}
          {pending.length > 0 && (
            <>
              <span className="label-caps">Снимок из файла</span>
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
              <div className="action-row">
                <button className="btn btn-primary" onClick={upload} disabled={busy}>
                  {busy ? 'Загружаю…' : `Загрузить: ${pending.length}`}
                </button>
                <button type="button" className="btn" onClick={() => setPending([])} disabled={busy}>
                  Отмена
                </button>
              </div>
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
      )}

      {characters.length === 0 && !loadError && (
        <EmptyState image="empty-scroll" alt="Свёрнутый свиток и перо в чернильнице" title="Партии ещё нет">
          Запусти в Foundry макрос «Снимок персонажа» → «Вся партия» и загрузи файл кнопкой «Загрузить снимок».
        </EmptyState>
      )}

      {characters.length > 0 && pendingChanges.length === 0 && (
        <EmptyState image="empty-chest" alt="Открытый пустой сундук" title="Правок нет" red>
          {lastSnapshot
            ? `С последнего снимка ${formatDateTime(lastSnapshot)} игроки ничего не меняли.`
            : 'Игроки ничего не меняли.'}
          {anyBetween ? ' Можно начинать игру.' : ''}
        </EmptyState>
      )}

      <div className="attack-list">
        {characters.map((c, i) => (
          <div key={c.id} className="party-entry">
            <CharacterCard
              id={c.id}
              name={c.name}
              summary={summaries[c.id]}
              player={ownerName(c.ownerId)}
              pending={pendingOf(c.id).length}
              index={i}
            />
            {pendingOf(c.id).length > 0 && (
              <div className="card list nested">
                <PendingChanges characterId={c.id} changes={pendingOf(c.id)} onMarkApplied={markApplied} />
              </div>
            )}
            <details className="card list nested">
              <summary className="list-row static">
                <span className="grow muted small">
                  {c.status === 'in_game' ? 'В игре: правки закрыты' : 'Между сессиями'} · снимок {formatDateTime(c.lastSnapshotAt)}
                </span>
                <span className="muted small">настроить</span>
              </summary>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 14 }}>
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
                <button
                  type="button"
                  className="toggle"
                  aria-pressed={c.status === 'in_game'}
                  onClick={() => setStatus([c.id], c.status === 'in_game' ? 'between_sessions' : 'in_game')}
                >
                  {c.status === 'in_game' ? 'Открыть правки только ему' : 'Закрыть правки только ему'}
                </button>
              </div>
            </details>
          </div>
        ))}
      </div>
      {players.length === 0 && characters.length > 0 && (
        <p className="muted small">Игроков пока нет: создай им аккаунты в Supabase (Authentication → Users).</p>
      )}

      <div className="card hint" style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true" style={{ flex: 'none', marginTop: 1, color: 'var(--tech)' }}>
          <path d="M12 2 21 7v10l-9 5-9-5V7z" />
          <path d="M12 8v5M12 16v.5" />
        </svg>
        <span className="muted small">Перед сессией нажми «Начать игру»: правка листов закроется до нового снимка.</span>
      </div>
    </>
  )
}
