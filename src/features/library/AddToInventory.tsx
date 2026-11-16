import { useState } from 'react'
import { Link } from 'react-router'
import { addItemChange, type Character } from '../../lib/db'
import type { LibraryRow } from '../../lib/library'

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** "Add to inventory": records an add_item edit for one of the viewer's characters. */
export function AddToInventory({ row, characters }: { row: LibraryRow; characters: Character[] }) {
  // Empty until the player picks one: the list may arrive after the first render
  const [picked, setCharacterId] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!characters.length) return null
  const characterId = picked || (characters[0]?.id ?? '')
  const character = characters.find((c) => c.id === characterId)
  const inGame = character?.status === 'in_game'

  async function add() {
    if (!character) return
    setBusy(true)
    setError(null)
    try {
      await addItemChange({ characterId: character.id, itemUuid: row.uuid, itemName: row.name, itemType: row.type, quantity })
      setDone(`${row.name} ×${quantity} → ${character.name}. Мастер перенесёт в Foundry перед игрой.`)
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="add-to-inventory">
      {characters.length > 1 && (
        <label className="field">
          Персонаж
          <select className="select" value={characterId} onChange={(e) => (setCharacterId(e.target.value), setDone(null))}>
            {characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="edit-row">
        <label className="field" style={{ width: 110 }}>
          Количество
          <input
            type="number"
            min={1}
            max={999}
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, Math.min(999, Math.trunc(Number(e.target.value)) || 1)))}
          />
        </label>
        <button type="button" className="btn btn-primary" style={{ flex: 1, alignSelf: 'flex-end' }} onClick={add} disabled={busy || inGame}>
          {busy ? 'Добавляю…' : characters.length > 1 ? 'Добавить в инвентарь' : `Добавить ${character?.name ?? ''}`.trim()}
        </button>
      </div>
      {inGame && <span className="muted small">{character?.name} сейчас в игре: добавить можно после сессии.</span>}
      {done && (
        <span className="small" aria-live="polite">
          {done} <Link to={`/character/${characterId}`}>К листу</Link>
        </span>
      )}
      {error && <span className="error small">{error}</span>}
    </div>
  )
}
