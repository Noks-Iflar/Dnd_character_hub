import { arr, bool, get, isObject, num, str, type JsonObject } from './read'
import type { Snapshot } from './types'

/** A number shown on the sheet and where it came from. */
export type Stat = { value: number | null; from: 'foundry' | 'estimate' }

export const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const
export type AbilityKey = (typeof ABILITIES)[number]

export const ABILITY_LABEL: Record<AbilityKey, string> = {
  str: 'СИЛ',
  dex: 'ЛОВ',
  con: 'ТЕЛ',
  int: 'ИНТ',
  wis: 'МДР',
  cha: 'ХАР',
}

export const SKILL_LABEL: Record<string, string> = {
  acr: 'Акробатика',
  ani: 'Уход за животными',
  arc: 'Магия',
  ath: 'Атлетика',
  dec: 'Обман',
  his: 'История',
  ins: 'Проницательность',
  itm: 'Запугивание',
  inv: 'Анализ',
  med: 'Медицина',
  nat: 'Природа',
  prc: 'Внимательность',
  prf: 'Выступление',
  per: 'Убеждение',
  rel: 'Религия',
  slt: 'Ловкость рук',
  ste: 'Скрытность',
  sur: 'Выживание',
}

const INVENTORY_TYPES = new Set(['weapon', 'equipment', 'consumable', 'tool', 'loot', 'container'])

export type SheetAbility = { key: AbilityKey; label: string; score: number | null; mod: Stat; save: Stat; saveProficient: boolean }
export type SheetSkill = { key: string; label: string; ability: AbilityKey; total: Stat; passive: Stat; proficiency: number }
export type SheetClass = { name: string; levels: number; subclass: string | null }
export type SheetItem = { id: string; name: string; type: string; quantity: number; equipped: boolean; description: string }
export type SheetSpell = { id: string; name: string; level: number; prepared: number; description: string }
export type SheetFeature = { id: string; name: string; description: string }

export type Sheet = {
  name: string
  portrait: string | null
  race: string | null
  background: string | null
  classes: SheetClass[]
  level: number
  prof: Stat
  hp: { value: number | null; max: Stat; temp: number | null }
  ac: Stat
  init: Stat
  speed: Stat
  inspiration: boolean
  exhaustion: number
  abilities: SheetAbility[]
  skills: SheetSkill[]
  currency: Record<string, number>
  inventory: SheetItem[]
  spells: SheetSpell[]
  features: SheetFeature[]
  hasComputed: boolean
}

const foundry = (value: number | null): Stat => ({ value, from: 'foundry' })
const estimate = (value: number | null): Stat => ({ value, from: 'estimate' })

/** Prefer the Foundry value; fall back to a local estimate. */
function pick(computedValue: unknown, fallback: number | null): Stat {
  const v = num(computedValue)
  return v !== null ? foundry(v) : estimate(fallback)
}

export const abilityMod = (score: number): number => Math.floor((score - 10) / 2)
export const profBonus = (level: number): number => Math.floor((Math.max(1, level) - 1) / 4) + 2

function items(source: JsonObject): JsonObject[] {
  return arr(source.items).filter(isObject)
}

function description(item: JsonObject): string {
  return str(get(item, 'system', 'description', 'value')) ?? ''
}

function itemName(all: JsonObject[], id: unknown): string | null {
  if (typeof id !== 'string') return null
  return str(all.find((i) => i._id === id)?.name) ?? null
}

/** Max HP from class HitPoints advancements + CON modifier per level (rules estimate). */
function estimateMaxHp(classItems: JsonObject[], conMod: number, level: number): number | null {
  let total = 0
  let found = false
  for (const cls of classItems) {
    const faces = num(str(get(cls, 'system', 'hd', 'denomination'))?.replace(/^d/, ''))
    for (const adv of Object.values(get(cls, 'system', 'advancement') ?? {})) {
      if (!isObject(adv) || adv.type !== 'HitPoints' || !isObject(adv.value)) continue
      for (const roll of Object.values(adv.value)) {
        const v = roll === 'max' ? faces : roll === 'avg' && faces ? faces / 2 + 1 : num(roll)
        if (v === null) return null
        total += v
        found = true
      }
    }
  }
  return found ? total + conMod * level : null
}

export function buildSheet(snapshot: Snapshot): Sheet {
  const src = snapshot.source
  const sys = isObject(src.system) ? src.system : {}
  const c = snapshot.computed
  const all = items(src)

  const classItems = all.filter((i) => i.type === 'class')
  const subclasses = all.filter((i) => i.type === 'subclass')
  const classes: SheetClass[] = classItems.map((cls) => {
    const identifier = str(get(cls, 'system', 'identifier'))
    const sub = subclasses.find((s) => identifier && get(s, 'system', 'classIdentifier') === identifier)
    return { name: str(cls.name) ?? '', levels: num(get(cls, 'system', 'levels')) ?? 0, subclass: str(sub?.name) }
  })
  const levelEstimate = classes.reduce((sum, cls) => sum + cls.levels, 0)
  const level = num(get(c, 'level')) ?? levelEstimate
  const prof = pick(get(c, 'prof'), profBonus(level))
  const pb = prof.value ?? profBonus(level)

  const abilities: SheetAbility[] = ABILITIES.map((key) => {
    const score = num(get(sys, 'abilities', key, 'value'))
    const mod = score === null ? null : abilityMod(score)
    const saveProficient = (num(get(sys, 'abilities', key, 'proficient')) ?? 0) > 0
    return {
      key,
      label: ABILITY_LABEL[key],
      score,
      mod: pick(get(c, 'abilities', key, 'mod'), mod),
      save: pick(get(c, 'abilities', key, 'save'), mod === null ? null : mod + (saveProficient ? pb : 0)),
      saveProficient,
    }
  })
  const modOf = (key: AbilityKey): number | null => abilities.find((a) => a.key === key)?.mod.value ?? null

  const skillsSource = get(sys, 'skills')
  const skills: SheetSkill[] = Object.entries(isObject(skillsSource) ? skillsSource : {})
    .filter(([, s]) => isObject(s))
    .map(([key, s]) => {
      const abilityRaw = str(get(s, 'ability'))
      const ability: AbilityKey = (ABILITIES as readonly string[]).includes(abilityRaw ?? '') ? (abilityRaw as AbilityKey) : 'int'
      const proficiency = num(get(s, 'value')) ?? 0
      const mod = modOf(ability)
      const total = mod === null ? null : mod + Math.floor(proficiency * pb)
      return {
        key,
        label: SKILL_LABEL[key] ?? key,
        ability,
        proficiency,
        total: pick(get(c, 'skills', key, 'total'), total),
        passive: pick(get(c, 'skills', key, 'passive'), total === null ? null : 10 + total),
      }
    })
    .sort((a, b) => a.label.localeCompare(b.label, 'ru'))

  const race = all.find((i) => i.type === 'race')
  const conMod = modOf('con') ?? 0
  const walk = num(get(race, 'system', 'movement', 'speeds', 'walk'))
  const computedWalk = get(c, 'movement', 'walk') ?? get(c, 'movement', 'speeds', 'walk')

  const currencySource = get(sys, 'currency')
  const currency: Record<string, number> = {}
  for (const [k, v] of Object.entries(isObject(currencySource) ? currencySource : {})) currency[k] = num(v) ?? 0

  return {
    name: str(src.name) ?? 'Без имени',
    portrait: snapshot.portrait,
    race: itemName(all, get(sys, 'details', 'race')) ?? str(race?.name),
    background: itemName(all, get(sys, 'details', 'background')),
    classes,
    level,
    prof,
    hp: {
      value: num(get(c, 'hp', 'value')) ?? num(get(sys, 'attributes', 'hp', 'value')),
      max: pick(get(c, 'hp', 'max'), num(get(sys, 'attributes', 'hp', 'max')) ?? estimateMaxHp(classItems, conMod, level)),
      temp: num(get(c, 'hp', 'temp')) ?? num(get(sys, 'attributes', 'hp', 'temp')),
    },
    ac: pick(get(c, 'ac'), num(get(sys, 'attributes', 'ac', 'flat'))),
    init: pick(get(c, 'init'), modOf('dex')),
    speed: pick(computedWalk, walk),
    inspiration: bool(get(sys, 'attributes', 'inspiration')),
    exhaustion: num(get(sys, 'attributes', 'exhaustion')) ?? 0,
    abilities,
    skills,
    currency,
    inventory: all
      .filter((i) => INVENTORY_TYPES.has(str(i.type) ?? ''))
      .map((i) => ({
        id: str(i._id) ?? '',
        name: str(i.name) ?? '',
        type: str(i.type) ?? '',
        quantity: num(get(i, 'system', 'quantity')) ?? 1,
        equipped: bool(get(i, 'system', 'equipped')),
        description: description(i),
      })),
    spells: all
      .filter((i) => i.type === 'spell')
      .map((i) => ({
        id: str(i._id) ?? '',
        name: str(i.name) ?? '',
        level: num(get(i, 'system', 'level')) ?? 0,
        prepared: num(get(i, 'system', 'prepared')) ?? 0,
        description: description(i),
      }))
      .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name)),
    features: all
      .filter((i) => i.type === 'feat')
      .map((i) => ({ id: str(i._id) ?? '', name: str(i.name) ?? '', description: description(i) })),
    hasComputed: c !== null,
  }
}
