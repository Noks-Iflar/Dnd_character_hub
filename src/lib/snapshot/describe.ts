import type { ChangeValue } from './changes'
import { arr, get, isObject, str, type JsonObject } from './read'

const COIN: Record<string, string> = { pp: 'платиновые', gp: 'золотые', ep: 'электрумовые', sp: 'серебряные', cp: 'медные' }

const FIXED: Record<string, string> = {
  'system.attributes.hp.value': 'Хиты',
  'system.attributes.hp.temp': 'Временные хиты',
  'system.attributes.death.success': 'Спасброски от смерти: успехи',
  'system.attributes.death.failure': 'Спасброски от смерти: провалы',
  'system.attributes.exhaustion': 'Истощение',
  'system.attributes.inspiration': 'Вдохновение',
}

const ITEM_FIELD: Record<string, string> = {
  quantity: 'количество',
  equipped: 'надето',
  'uses.spent': 'потрачено зарядов',
  'hd.spent': 'потрачено костей хитов',
}

/** Human-readable name of an edited field, using item names from the actor source when available. */
export function describePath(path: string, source?: JsonObject | null): string {
  const fixed = FIXED[path]
  if (fixed) return fixed
  let m = /^system\.currency\.(\w+)$/.exec(path)
  if (m) return `Монеты: ${COIN[m[1] ?? ''] ?? m[1]}`
  m = /^system\.spells\.(spell(\d)|pact)\.value$/.exec(path)
  if (m) return m[1] === 'pact' ? 'Ячейки договора' : `Ячейки ${m[2]} круга`
  m = /^items\.([A-Za-z0-9]{16})\.system\.(.+)$/.exec(path)
  if (m) {
    const item = arr(source?.items).find((i) => isObject(i) && i._id === m?.[1])
    const name = str(get(item, 'name')) ?? `предмет ${m[1]}`
    return `${name}: ${ITEM_FIELD[m[2] ?? ''] ?? m[2]}`
  }
  return path
}

export function describeValue(value: ChangeValue | null): string {
  if (value === null) return '—'
  if (typeof value === 'boolean') return value ? 'да' : 'нет'
  return String(value)
}
