import { useEffect, useState, type ChangeEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { importDiary, listLore, listSessions, parseDiaryImport, sessionTitle, type DiaryImport, type DiarySession, type LorePage } from '../../lib/diary'
import { useViewer } from './useViewer'
import { BrushButton, FileButton } from '../../components/BrushButton'
import { ArtHeader, ArtNav } from '../../components/ArtHeader'

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** Diary home: sessions and lore sections. The GM also creates and imports. */
export function DiaryPage() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'lore' ? 'lore' : 'sessions'
  const { isGm } = useViewer()
  const [lore, setLore] = useState<LorePage[] | null>(null)
  const [sessions, setSessions] = useState<DiarySession[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const [pendingImport, setPendingImport] = useState<DiaryImport | null>(null)
  const [importMessage, setImportMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    Promise.all([listLore(), listSessions()])
      .then(([l, s]) => {
        if (cancelled) return
        setLore(l)
        setSessions(s)
      })
      .catch((e: unknown) => !cancelled && setError(errorText(e)))
    return () => {
      cancelled = true
    }
  }, [version])

  async function onImportFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const parsed = parseDiaryImport(await file.text())
    if (parsed.ok) {
      setPendingImport(parsed.data)
      setImportMessage(null)
    } else {
      setPendingImport(null)
      setImportMessage(parsed.error)
    }
  }

  async function runImport() {
    if (!pendingImport) return
    setBusy(true)
    try {
      const r = await importDiary(pendingImport)
      setImportMessage(`Перенесено: разделов лора ${r.lore}, сессий ${r.sessions}, записей игроков ${r.entries}.`)
      setPendingImport(null)
      setVersion((v) => v + 1)
    } catch (err) {
      setImportMessage(`Импорт прервался: ${errorText(err)}. Часть данных могла записаться — проверь списки.`)
      setVersion((v) => v + 1)
    } finally {
      setBusy(false)
    }
  }

  const alreadyHasData = (lore?.length ?? 0) + (sessions?.length ?? 0) > 0

  return (
    <>
      <ArtHeader name="lore" alt="Гном-летописец пишет хронику при лампе" focusY={0.3} top={<ArtNav />}>
        <h1>Дневник приключенцев</h1>
      </ArtHeader>

      <div className="segmented" role="group" aria-label="Раздел дневника" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
        <button type="button" aria-pressed={tab === 'sessions'} onClick={() => setParams({ tab: 'sessions' })}>
          Сессии
        </button>
        <button type="button" aria-pressed={tab === 'lore'} onClick={() => setParams({ tab: 'lore' })}>
          Лор мира
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      {isGm && (
        <div className="action-row">
          <BrushButton to={tab === 'lore' ? '/diary/lore/new' : '/diary/session/new'}>
            {tab === 'lore' ? 'Новый раздел' : 'Новая сессия'}
          </BrushButton>
          <FileButton accept=".json,application/json" onChange={onImportFile}>
            Импорт из файла
          </FileButton>
        </div>
      )}
      {isGm && (pendingImport || importMessage) && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {pendingImport && (
            <>
              <span>
                В файле: разделов лора {pendingImport.lore.length}, сессий {pendingImport.sessions.length}, записей игроков{' '}
                {pendingImport.lore.reduce((n, p) => n + p.entries.length, 0) + pendingImport.sessions.reduce((n, s) => n + s.entries.length, 0)}.
              </span>
              {alreadyHasData && <span className="error small">В дневнике уже есть записи: импорт добавит новые рядом, дубли не проверяются.</span>}
              <div className="action-row">
                <BrushButton variant="primary" onClick={runImport} disabled={busy}>
                  {busy ? 'Переношу…' : 'Перенести'}
                </BrushButton>
                <BrushButton onClick={() => setPendingImport(null)} disabled={busy}>
                  Отмена
                </BrushButton>
              </div>
            </>
          )}
          {importMessage && <span className="muted small">{importMessage}</span>}
        </div>
      )}

      {tab === 'sessions' && sessions && (
        <div className="attack-list">
          {sessions.length === 0 && <p className="muted">Сессий пока нет.</p>}
          {sessions.map((s) => (
            <Link key={s.id} to={`/diary/session/${s.id}`} className="card diary-card">
              <span className="row-number">{sessionTitle(s)}</span>
              {s.summary && <span className="muted small diary-preview">{s.summary}</span>}
            </Link>
          ))}
        </div>
      )}

      {tab === 'lore' && lore && (
        <div className="attack-list">
          {lore.length === 0 && <p className="muted">Разделов лора пока нет.</p>}
          {lore.map((p) => (
            <Link key={p.id} to={`/diary/lore/${p.id}`} className="card diary-card">
              <span className="row-number">
                {p.title} {p.gmOnly && <span className="chip chip-blood">только мастеру</span>}
              </span>
              {p.body && <span className="muted small diary-preview">{p.body}</span>}
            </Link>
          ))}
        </div>
      )}
    </>
  )
}
