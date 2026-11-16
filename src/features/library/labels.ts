// Russian labels and sorting helpers for the library.
import type { LibraryRow } from '../../lib/library'

export const TYPE_LABEL: Record<string, string> = {
  weapon: 'Оружие',
  equipment: 'Снаряжение и доспехи',
  consumable: 'Расходуемое',
  tool: 'Инструменты',
  loot: 'Добыча и ценности',
  container: 'Контейнеры',
  spell: 'Заклинание',
  feat: 'Особенность',
  background: 'Предыстория',
  race: 'Вид (раса)',
  class: 'Класс',
  subclass: 'Подкласс',
  facility: 'Помещение оплота',
  renown: 'Известность',
}

export const RARITY_ORDER = ['common', 'uncommon', 'rare', 'veryRare', 'legendary', 'artifact'] as const

export const RARITY_LABEL: Record<string, string> = {
  common: 'обычный',
  uncommon: 'необычный',
  rare: 'редкий',
  veryRare: 'очень редкий',
  legendary: 'легендарный',
  artifact: 'артефакт',
}

const COIN: Record<string, string> = { pp: 'пм', gp: 'зм', ep: 'эм', sp: 'см', cp: 'мм' }
const COIN_IN_CP: Record<string, number> = { pp: 1000, gp: 100, ep: 50, sp: 10, cp: 1 }

export function priceText(r: LibraryRow): string | null {
  if (!r.priceValue) return null
  return `${r.priceValue.toLocaleString('ru-RU')} ${COIN[r.priceDenomination ?? 'gp'] ?? r.priceDenomination ?? ''}`.trim()
}

/** Price in copper for sorting; unknown prices go last. */
export function priceInCopper(r: LibraryRow): number {
  if (!r.priceValue) return Number.POSITIVE_INFINITY
  return r.priceValue * (COIN_IN_CP[r.priceDenomination ?? 'gp'] ?? 100)
}

export function rarityRank(r: LibraryRow): number {
  const i = RARITY_ORDER.indexOf((r.rarity ?? '') as (typeof RARITY_ORDER)[number])
  return i === -1 ? -1 : i
}

export function metaLine(r: LibraryRow): string {
  const parts: string[] = []
  if (r.type === 'spell') parts.push(r.level === 0 ? 'заговор' : r.level ? `${r.level} круг` : 'заклинание')
  else parts.push(TYPE_LABEL[r.type] ?? r.type)
  if (r.rarity && RARITY_LABEL[r.rarity]) parts.push(RARITY_LABEL[r.rarity] as string)
  if (r.attunement === 'required') parts.push('настройка')
  const price = priceText(r)
  if (price) parts.push(price)
  if (r.weight) parts.push(`${r.weight.toLocaleString('ru-RU')} фнт`)
  parts.push(r.source === 'ag' ? 'AG 2024' : r.source === 'laaru' ? 'Laaru 2014' : r.packLabel)
  return parts.join(' · ')
}

const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е')

/** Case- and ё-insensitive search in Russian and English names. */
export function matches(r: LibraryRow, query: string): boolean {
  const q = norm(query.trim())
  if (!q) return true
  return norm(r.name).includes(q) || (r.nameEn ? norm(r.nameEn).includes(q) : false)
}
