import { Description } from '../bits'
import { NotesEditor, type NotesBinding } from '../NotesEditor'
import type { TabProps } from '../sheet-ui'

/** "Заметки": personal notes (when the sheet comes from the database) and features. */
export function NotesTab({ sheet, notes }: TabProps & { notes?: NotesBinding }) {
  return (
    <>
      <h1 style={{ fontSize: 32 }}>Заметки</h1>
      {notes ? (
        <NotesEditor notes={notes} />
      ) : (
        <div className="card hint">
          <span className="muted small">Личные заметки доступны, когда лист открыт из приложения, а не из файла.</span>
        </div>
      )}
      <h2 className="section-title">Умения и черты</h2>
      {sheet.features.length === 0 ? (
        <p className="muted">Умений нет.</p>
      ) : (
        <div className="card list">
          {sheet.features.map((f) =>
            f.pending ? (
              <div key={f.id} className="list-row static">
                <span className="grow">{f.name}</span>
                <span className="chip chip-blood">ждёт мастера</span>
              </div>
            ) : (
              <details key={f.id} className="list-details">
                <summary>
                  <span className="grow">{f.name}</span>
                </summary>
                <Description html={f.description} />
              </details>
            ),
          )}
        </div>
      )}
    </>
  )
}
