import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { AppHeader } from '../../components/AppHeader'
import { deleteLorePage, getLorePage, saveLorePage, type LorePage } from '../../lib/diary'
import { Entries } from './Entries'
import { LoreForm } from './forms'
import { useViewer } from './useViewer'
import { BrushButton } from '../../components/BrushButton'

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** One lore section with player entries; "new" opens an empty form for the GM. */
export function LorePageView() {
  const { id = '' } = useParams()
  const isNew = id === 'new'
  const navigate = useNavigate()
  const viewer = useViewer()
  const [page, setPage] = useState<LorePage | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(isNew)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    if (isNew) return
    let cancelled = false
    getLorePage(id)
      .then((p) => !cancelled && (p ? setPage(p) : setError('Раздел не найден.')))
      .catch((e: unknown) => !cancelled && setError(errorText(e)))
    return () => {
      cancelled = true
    }
  }, [id, isNew, version])

  async function remove() {
    if (!page || !window.confirm(`Удалить раздел «${page.title}» вместе с записями игроков?`)) return
    try {
      await deleteLorePage(page.id)
      navigate('/diary?tab=lore')
    } catch (e) {
      setError(errorText(e))
    }
  }

  return (
    <>
      <AppHeader>
        <BrushButton variant="link" to="/diary?tab=lore">
          К дневнику
        </BrushButton>
      </AppHeader>
      {error && <p className="error">{error}</p>}
      {editing && viewer.isGm ? (
        <LoreForm
          initial={page ? { title: page.title, body: page.body, sort: page.sort, gmOnly: page.gmOnly } : { title: '', body: '', sort: 0, gmOnly: false }}
          onCancel={() => (isNew ? navigate('/diary?tab=lore') : setEditing(false))}
          onSave={async (v) => {
            const savedId = await saveLorePage(isNew ? null : id, v)
            if (isNew) navigate(`/diary/lore/${savedId}`, { replace: true })
            setEditing(false)
            setVersion((n) => n + 1)
          }}
        />
      ) : (
        page && (
          <>
            <div>
              <h1 style={{ fontSize: 30 }}>{page.title}</h1>
              <span className="brush-underline" aria-hidden="true" />
              {page.gmOnly && <span className="chip chip-blood">только мастеру</span>}
            </div>
            <div className="card">
              <p className="prose">{page.body || 'Текста пока нет.'}</p>
            </div>
            {viewer.isGm && (
              <div className="action-row">
                <BrushButton onClick={() => setEditing(true)}>Изменить</BrushButton>
                <BrushButton danger onClick={remove}>
                  Удалить
                </BrushButton>
              </div>
            )}
            <Entries target={{ lorePageId: page.id }} userId={viewer.userId} isGm={viewer.isGm} defaultName={viewer.defaultName} />
          </>
        )
      )}
    </>
  )
}
