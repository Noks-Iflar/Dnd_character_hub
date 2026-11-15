import type { RollResult } from '../../lib/dice/dice'

export type ShownRoll = { label: string; result: RollResult }

export function RollToast({ roll, onClose }: { roll: ShownRoll | null; onClose: () => void }) {
  if (!roll) return null
  const d20 = roll.result.dice.find((d) => d.faces === 20 && d.kept)
  const crit = d20?.value === 20
  const fumble = d20?.value === 1
  const dice = roll.result.dice.map((d) => (d.kept ? String(d.value) : `(${d.value})`)).join(' + ')
  return (
    <div className={`roll-toast${crit ? ' roll-crit' : ''}`} role="status" aria-live="polite">
      <span className="roll-total">{roll.result.total}</span>
      <div className="roll-text">
        <span>{roll.label}</span>
        <span className="muted">
          {roll.result.formula} · {dice}
        </span>
        {crit && <span className="roll-flag">Натуральная 20</span>}
        {fumble && <span className="roll-flag">Натуральная 1</span>}
      </div>
      <button className="roll-close" onClick={onClose} aria-label="Закрыть результат броска">
        ×
      </button>
    </div>
  )
}
