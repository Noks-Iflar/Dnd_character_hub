import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { AppHeader } from '../../components/AppHeader'
import { deleteSession, getSession, listSessions, saveSession, sessionTitle, type DiarySession } from '../../lib/diary'
import { Entries } from './Entries'
import { SessionForm } from './forms'
import { useViewer } from './useViewer'
import { BrushButton } from '../../components/BrushButton'

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** One session: recap, key moments, player entries. "new" opens an empty form for the GM. */
export function SessionView() {
  const { id = '' } = useParams()
  const isNew = id === 'new'
  const navigate = useNavigate()
  const viewer = useViewer()
  const [session, setSession] = useState<DiarySession | null>(null)
  const [nextNumber, setNextNumber] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(isNew)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let cancelled = false
    const load = isNew
      ? listSessions().then((all) => !cancelled && setNextNumber(Math.max(0, ...all.map((s) => s.number)) + 1))
      : getSession(id).then((s) => !cancelled && (s ? setSession(s) : setError('Сессия не найдена.')))
    load.catch((e: unknown) => !cancelled && setError(errorText(e)))
    return () => {
      cancelled = true
    }
  }, [id, isNew, version])

  async function remove() {
    if (!session || !window.confirm(`Удалить «${sessionTitle(session)}» вместе с записями игроков?`)) return
    try {
      await deleteSession(session.id)
      navigate('/diary')
    } catch (e) {
      setError(errorText(e))
    }
  }

  const highlights = session?.highlights.split('\n').map((h) => h.replace(/^\s*\d+[.)]\s*/, '').trim()).filter(Boolean) ?? []

  return (
    <>
      <AppHeader>
        <BrushButton variant="link" to="/diary">
          К дневнику
        </BrushButton>
      </AppHeader>
      {error && <p className="error">{error}</p>}
      {editing && viewer.isGm ? (
        <SessionForm
          key={nextNumber}
          initial={
            session
              ? { number: session.number, title: session.title, summary: session.summary, highlights: session.highlights }
              : { number: nextNumber, title: null, summary: '', highlights: '' }
          }
          onCancel={() => (isNew ? navigate('/diary') : setEditing(false))}
          onSave={async (v) => {
            const savedId = await saveSession(isNew ? null : id, v)
            if (isNew) navigate(`/diary/session/${savedId}`, { replace: true })
            setEditing(false)
            setVersion((n) => n + 1)
          }}
        />
      ) : (
        session && (
          <>
            <div>
              <h1 style={{ fontSize: 30 }}>{sessionTitle(session)}</h1>
              <span className="brush-underline" aria-hidden="true" />
            </div>
            <h2 className="section-title">Краткий пересказ</h2>
            <div className="card">
              <p className="prose">{session.summary || 'Пересказа пока нет.'}</p>
            </div>
            {highlights.length > 0 && (
              <>
                <h2 className="section-title">Важные моменты и находки</h2>
                <div className="card">
                  <ol className="highlights">
                    {highlights.map((h, i) => (
                      <li key={i}>{h}</li>
                    ))}
                  </ol>
                </div>
              </>
            )}
            {viewer.isGm && (
              <div className="action-row">
                <BrushButton onClick={() => setEditing(true)}>Изменить</BrushButton>
                <BrushButton danger onClick={remove}>
                  Удалить
                </BrushButton>
              </div>
            )}
            <Entries target={{ sessionId: session.id }} userId={viewer.userId} isGm={viewer.isGm} defaultName={viewer.defaultName} />
          </>
        )
      )}
    </>
  )
}
