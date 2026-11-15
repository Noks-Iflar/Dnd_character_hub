import type { ChangeValue } from '../../lib/snapshot/changes'
import type { Sheet, SheetAttack, SheetResource } from '../../lib/snapshot/sheet'
import { ruLabel } from './labels'

/** Present when the sheet may be edited: records one edit in the journal. */
export type SheetEdit = { set: (path: string, oldValue: ChangeValue | null, newValue: ChangeValue) => void }

export type RollMode = 'normal' | 'adv' | 'dis'

/** What every tab gets from the sheet screen. */
export type TabProps = {
  sheet: Sheet
  edit?: SheetEdit
  rollD20: (label: string, mod: number | null) => void
  rollDamage: (attack: SheetAttack) => void
  setResource: (resource: SheetResource, remaining: number) => void
}

export const COINS: [string, string][] = [
  ['pp', 'пм'],
  ['gp', 'зм'],
  ['ep', 'эм'],
  ['sp', 'см'],
  ['cp', 'мм'],
]

export const EQUIPPABLE = new Set(['weapon', 'equipment'])

const DAMAGE_TYPE: Record<string, string> = {
  acid: 'кислота',
  bludgeoning: 'дробящий',
  cold: 'холод',
  fire: 'огонь',
  force: 'силовое поле',
  lightning: 'электричество',
  necrotic: 'некротическая энергия',
  piercing: 'колющий',
  poison: 'яд',
  psychic: 'психическая энергия',
  radiant: 'излучение',
  slashing: 'рубящий',
  thunder: 'звук',
  healing: 'лечение',
  temphp: 'временные хиты',
}

export function damageText(a: SheetAttack): string {
  return a.damages.map((d) => `${d.formula}${d.type ? ` ${DAMAGE_TYPE[d.type] ?? d.type}` : ''}`).join(' + ')
}

export function attackNote(a: SheetAttack): string {
  return [a.activity !== 'Attack' ? a.activity : null, ruLabel(a.range), damageText(a) || null].filter(Boolean).join(' · ')
}
