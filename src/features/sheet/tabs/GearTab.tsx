import { itemPath } from '../../../lib/snapshot/changes'
import { Description } from '../bits'
import { COINS, EQUIPPABLE, type TabProps } from '../sheet-ui'
import { Stepper } from '../Stepper'

/** "Вещи": coins and inventory; quantity and "equipped" are editable. */
export function GearTab({ sheet, edit }: TabProps) {
  return (
    <>
      <h1 style={{ fontSize: 32 }}>Вещи</h1>
      <h2 className="section-title">Монеты</h2>
      {edit ? (
        <div className="card list">
          {COINS.map(([key, label]) => (
            <div key={key} className="list-row static">
              <span className="grow">{label}</span>
              <Stepper
                label={`Монеты: ${label}`}
                value={sheet.currency[key] ?? 0}
                onCommit={(v) => edit.set(`system.currency.${key}`, sheet.currency[key] ?? 0, v)}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="card coins">
          {COINS.map(([key, label]) => (
            <span key={key}>
              <span className="row-number">{sheet.currency[key] ?? 0}</span> <span className="muted small">{label}</span>
            </span>
          ))}
        </div>
      )}

      <h2 className="section-title">Снаряжение</h2>
      {sheet.inventory.length === 0 ? (
        <p className="muted">Предметов нет.</p>
      ) : (
        <div className="card list">
          {sheet.inventory.map((it) => (
            <details key={it.id} className="list-details">
              <summary>
                <span className="grow">
                  {it.name}
                  {it.quantity !== 1 ? ` ×${it.quantity}` : ''}
                </span>
                {it.equipped && <span className="chip chip-tech">надето</span>}
              </summary>
              {edit && (
                <div className="edit-row" style={{ padding: '10px 14px 0' }}>
                  {EQUIPPABLE.has(it.type) && (
                    <button
                      type="button"
                      className="toggle"
                      aria-pressed={it.equipped}
                      onClick={() => edit.set(itemPath(it.id, 'equipped'), it.equipped, !it.equipped)}
                    >
                      {it.equipped ? 'Надето' : 'Не надето'}
                    </button>
                  )}
                  <Stepper
                    label={`Количество: ${it.name}`}
                    value={it.quantity}
                    onCommit={(v) => edit.set(itemPath(it.id, 'quantity'), it.quantity, v)}
                  />
                </div>
              )}
              <Description html={it.description} />
            </details>
          ))}
        </div>
      )}
    </>
  )
}
