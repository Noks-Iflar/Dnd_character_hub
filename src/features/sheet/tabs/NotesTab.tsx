import { Description } from '../bits'
import type { TabProps } from '../sheet-ui'

/** "Заметки": class and species features; personal notes come later in phase 4. */
export function NotesTab({ sheet }: TabProps) {
  return (
    <>
      <h1 style={{ fontSize: 32 }}>Заметки</h1>
      <div className="card hint">
        <span className="muted small">Личные заметки появятся здесь позже: их будут видеть только ты и мастер.</span>
      </div>
      <h2 className="section-title">Умения и черты</h2>
      {sheet.features.length === 0 ? (
        <p className="muted">Умений нет.</p>
      ) : (
        <div className="card list">
          {sheet.features.map((f) => (
            <details key={f.id} className="list-details">
              <summary>
                <span className="grow">{f.name}</span>
              </summary>
              <Description html={f.description} />
            </details>
          ))}
        </div>
      )}
    </>
  )
}
