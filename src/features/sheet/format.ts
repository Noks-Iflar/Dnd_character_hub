import type { Stat } from '../../lib/snapshot/sheet'

/** +3 / −1 with a real minus sign. */
export function signed(n: number): string {
  return n >= 0 ? `+${n}` : `−${Math.abs(n)}`
}

export function statText(stat: Stat, withSign = false): string {
  if (stat.value === null) return '—'
  return withSign ? signed(stat.value) : String(stat.value)
}

/** Dice formula for a d20 roll with a modifier, e.g. "1d20+3" or "1d20-1". */
export function d20(mod: number): string {
  return mod >= 0 ? `1d20+${mod}` : `1d20-${Math.abs(mod)}`
}
