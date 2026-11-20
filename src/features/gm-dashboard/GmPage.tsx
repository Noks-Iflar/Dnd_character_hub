import { useEffect, useState, type ChangeEvent } from 'react'
import {
  deleteCharacter,
  listCharacters,
  listPendingChanges,
  listProfiles,
  markChangesApplied,
  setCharacterOwner,
  setCharacterStatus,
  setReview,
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
import { BrandLink, NavButtons } from '../../components/NavMenu'
import { SettingsLink } from '../../components/SettingsLink'
import { buildChangesFile } from '../../lib/foundry-changes'
import { loadSummaries, type CharacterSummary } from '../../lib/summary'
import { ReviewChanges } from './ReviewChanges'
import { countDecisions, reviewLines, rowIds } from '../../lib/review'
import type { Review } from '../../lib/snapshot/changes'
import { BrushButton, FileButton } from '../../components/BrushButton'

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))

export function GmPage() {
  const [characters, setCharacters] = useState<Character[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [pendingChanges, setPendingChanges] = useState<PendingChange[]>([])
  const [summaries, setSummaries] = useState<Record<string, CharacterSummary>>({})
  // Journal rows in the last downloaded changes file
  const [downloaded, setDownloaded] = useState<string[]>([])
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

  function removeCharacter(c: Character) {
    const ok = window.confirm(
      `Удалить персонажа «${c.name}» из приложения?\n\n` +
        'Вместе с ним навсегда удалятся все его снимки (история версий), правки игрока и личные заметки. ' +
        'В Foundry ничего не изменится. Если потом загрузить его снимок снова, персонаж появится заново, но без истории.',
    )
    if (ok) void run(() => deleteCharacter(c.id))
  }

  const setStatus = (ids: string[], status: CharacterStatus) => run(() => setCharacterStatus(ids, status))
  const markApplied = (ids: string[]) => run(() => markChangesApplied(ids))

  // Review lines: one per field or added item; the GM decides each of them
  const lines = reviewLines(pendingChanges, (c) => c.characterId)
  const counts = countDecisions(lines)
  const rejectedIds = rowIds(lines.filter((l) => l.decision === 'rejected'))
  /** Lines still on their way to Foundry (undecided or accepted) */
  const waitingOf = (characterId: string) => lines.filter((l) => l.decision !== 'rejected' && l.rows[0]?.characterId === characterId).length
  const pendingByActor = (actorId: string | null) => {
    const character = characters.find((c) => c.foundryActorId === actorId)
    return character ? waitingOf(character.id) : 0
  }

  // Optimistic: the toggle switches at once, rolls back if the server says no
  function decide(ids: string[], review: Review) {
    if (!ids.length) return
    const before = pendingChanges
    const set = new Set(ids)
    setPendingChanges((list) => list.map((c) => (set.has(c.id) ? { ...c, review } : c)))
    // a downloaded file no longer matches the decisions
    setDownloaded([])
    setReview(ids, review).catch((e: unknown) => {
      setPendingChanges(before)
      setLoadError(errorText(e))
    })
  }
  const allIds = characters.map((c) => c.id)
  const anyBetween = characters.some((c) => c.status === 'between_sessions')

  const players = profiles.filter((p) => p.role === 'player')

  function downloadChanges() {
    const file = buildChangesFile(characters, pendingChanges)
    const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `dndhub-changes-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    setDownloaded(file.characters.flatMap((c) => c.changeIds))
  }

  const lastSnapshot = characters.map((c) => c.lastSnapshotAt).filter((d): d is string => !!d).sort().at(-1) ?? null
  const ownerName = (ownerId: string | null) => profiles.find((p) => p.id === ownerId)?.display_name ?? null

  // One main button per screen: the next thing the GM should do.
  // While edits wait for a decision there is none: the decisions themselves come first.
  const main: 'upload' | 'applied' | 'take' | 'close' | 'review' | 'game' =
    pending.length > 0
      ? 'upload'
      : downloaded.length > 0
        ? 'applied'
        : counts.accepted > 0
          ? 'take'
          : counts.undecided > 0
            ? 'review'
            : counts.rejected > 0
              ? 'close'
              : 'game'
  const weight = (k: typeof main) => (main === k ? 'primary' : 'secondary')

  return (
    <>
      <div className="art-header">
        <img src={`${import.meta.env.BASE_URL}ui/art/party.jpg`} alt="Партия идёт мимо горящих заводов" style={{ objectPosition: 'center 30%' }} />
        <div className="art-header-bar">
          <span className="app-header-nav">
            <NavButtons />
            <BrandLink />
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span className="chip chip-on-art">Мастер</span>
            <SettingsLink />
          </span>
        </div>
      </div>
      <div className="art-title art-title-short">
        <h1 style={{ fontSize: 32 }}>Партия</h1>
        <span className="brush-underline" aria-hidden="true" />
        <span className="muted small">{lastSnapshot ? `Последний снимок: ${formatDateTime(lastSnapshot)}` : 'Снимков ещё нет'}</span>
      </div>

      {loadError && <p className="error">{loadError}</p>}

      <div className="button-stack">
        {counts.accepted > 0 && (
          <BrushButton variant={weight('take')} icon="quill-scroll" block onClick={downloadChanges}>
            Забрать принятые · {counts.accepted}
          </BrushButton>
        )}
        <BrushButton
          variant={weight('game')}
          icon="crossed-swords"
          block
          disabled={characters.length === 0}
          onClick={() => setStatus(allIds, anyBetween ? 'in_game' : 'between_sessions')}
        >
          {anyBetween ? 'Начать игру' : 'Игра окончена'}
        </BrushButton>
        <FileButton icon="sealed-letter" block accept=".json,application/json" onChange={onFile}>
          Загрузить снимок
        </FileButton>
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
                <BrushButton variant={weight('upload')} onClick={upload} disabled={busy}>
                  {busy ? 'Загружаю…' : `Загрузить: ${pending.length}`}
                </BrushButton>
                <BrushButton onClick={() => setPending([])} disabled={busy}>
                  Отмена
                </BrushButton>
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

      {lines.length > 0 && (
        <ReviewChanges characters={characters} pending={pendingChanges} ownerName={ownerName} onDecide={decide}>
          {counts.accepted > 0 && downloaded.length === 0 && (
            <span className="muted small">«Забрать принятые» скачает файл — примени его в Foundry макросом «Применить правки».</span>
          )}
          {downloaded.length > 0 && (
            <BrushButton
              variant={weight('applied')}
              block
              onClick={() => markApplied([...downloaded, ...rejectedIds]).then(() => setDownloaded([]))}
            >
              Всё перенесено — отметить применёнными
            </BrushButton>
          )}
          {main === 'close' && (
            <BrushButton variant="primary" block onClick={() => markApplied(rejectedIds)}>
              Готово: убрать отклонённые из списка
            </BrushButton>
          )}
        </ReviewChanges>
      )}

      {characters.length === 0 && !loadError && (
        <EmptyState image="empty-scroll" alt="Свёрнутый свиток и перо в чернильнице" title="Партии ещё нет">
          Запусти в Foundry макрос «Снимок персонажа» → «Вся партия» и загрузи файл кнопкой «Загрузить снимок».
        </EmptyState>
      )}

      {characters.length > 0 && lines.length === 0 && (
        <EmptyState image="empty-chest" alt="Открытый пустой сундук" title="Правок нет" red>
          {lastSnapshot
            ? `С последнего снимка ${formatDateTime(lastSnapshot)} игроки ничего не меняли.`
            : 'Игроки ничего не меняли.'}
          {anyBetween ? ' Можно начинать игру.' : ''}
        </EmptyState>
      )}

      <div className="attack-list card-grid">
        {characters.map((c, i) => (
          <div key={c.id} className="party-entry">
            <CharacterCard
              id={c.id}
              name={c.name}
              summary={summaries[c.id]}
              player={ownerName(c.ownerId)}
              pending={waitingOf(c.id)}
              index={i}
            />
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
                <BrushButton danger onClick={() => removeCharacter(c)}>
                  Удалить персонажа
                </BrushButton>
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
