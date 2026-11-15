import type { Stat } from '../../lib/snapshot/sheet'

/** +3 / −1 with a real minus sign. */
export function signed(n: number): string {
  return n >= 0 ? `+${n}` : `−${Math.abs(n)}`
}

export function statText(stat: Stat, withSign = false): string {
  if (stat.value === null) return '—'
  return withSign ? signed(stat.value) : String(stat.value)
}

/** Dice formula for a d20 roll: "1d20+3", with advantage "2d20kh+3", with disadvantage "2d20kl-1". */
export function d20(mod: number, mode: 'normal' | 'adv' | 'dis' = 'normal'): string {
  const dice = mode === 'adv' ? '2d20kh' : mode === 'dis' ? '2d20kl' : '1d20'
  return mod >= 0 ? `${dice}+${mod}` : `${dice}-${Math.abs(mod)}`
}
