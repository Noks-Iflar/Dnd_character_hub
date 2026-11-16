// Compendium library: turning a Foundry export into catalogue rows, removing duplicates.
import { arr, get, isObject, num, str, type JsonObject } from './snapshot/read'
import { supabase } from './supabase'

export type LibraryCategory = 'items' | 'spells' | 'feats' | 'origins' | 'classes' | 'features' | 'bastions' | 'rules'

export const CATEGORY_LABEL: Record<LibraryCategory, string> = {
  items: 'Снаряжение',
  spells: 'Заклинания',
  feats: 'Черты',
  origins: 'Происхождения',
  classes: 'Классы',
  features: 'Особенности',
  bastions: 'Оплоты',
  rules: 'Правила',
}

export const ITEM_TYPES = new Set(['weapon', 'equipment', 'consumable', 'tool', 'loot', 'container'])

export type Source = 'ag' | 'laaru' | 'other'

/** One catalogue row as stored in public.library (without the description, which is loaded on demand). */
export type LibraryRow = {
  uuid: string
  source: Source
  pack: string
  packLabel: string
  category: LibraryCategory
  type: string
  subtype: string | null
  name: string
  nameEn: string | null
  rarity: string | null
  level: number | null
  school: string | null
  priceValue: number | null
  priceDenomination: string | null
  weight: number | null
  attunement: string | null
  properties: string[]
}

export type LibraryImportRow = LibraryRow & { description: string }

function sourceOf(packageName: string): Source {
  if (packageName.startsWith('ag-fifthpendium')) return 'ag'
  if (packageName.startsWith('laaru')) return 'laaru'
  return 'other'
}

export function categoryOf(type: string, pack: string): LibraryCategory {
  if (ITEM_TYPES.has(type)) return 'items'
  if (type === 'spell') return 'spells'
  if (type === 'background' || type === 'race') return 'origins'
  if (type === 'class' || type === 'subclass') return 'classes'
  if (type === 'facility') return 'bastions'
  if (/\.(actions|conditions)$/.test(pack)) return 'rules'
  if (type === 'feat' && (/\.feats$/.test(pack) || /\.options$/.test(pack))) return 'feats'
  return 'features'
}

/**
 * "Одеяло [Blanket]" (AG), "Глефа +1 / Glaive +1" (Laaru) -> Russian and English parts.
 * Babele's originalName wins for the English name when present.
 */
export function splitName(name: string, originalName: string | null): { ru: string; en: string | null } {
  const bracket = /^(.*\S)\s*\[([^\]]+)\]\s*$/.exec(name)
  if (bracket?.[1] && bracket[2]) return { ru: bracket[1], en: originalName ?? bracket[2].trim() }
  const slash = /^(.*\S)\s+\/\s+([A-Za-z].*)$/.exec(name)
  if (slash?.[1] && slash[2]) return { ru: slash[1], en: originalName ?? slash[2].trim() }
  return { ru: name.trim(), en: originalName && originalName !== name ? originalName : null }
}

const normalize = (s: string) => s.toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, '')

/** Key for spotting the same entry in different sources: type + English name (or Russian when there is none). */
export function dedupeKey(row: Pick<LibraryRow, 'type' | 'name' | 'nameEn'>): string {
  return `${row.type}:${normalize(row.nameEn ?? row.name)}`
}

function toRow(e: JsonObject): LibraryImportRow | null {
  const uuid = str(e.uuid)
  const rawName = str(e.name)
  const type = str(e.type)
  const pack = str(e.pack) ?? ''
  if (!uuid || !rawName || !type) return null
  const { ru, en } = splitName(rawName, str(e.originalName))
  const price = get(e, 'price')
  return {
    uuid,
    source: sourceOf(str(e.packageName) ?? pack),
    pack,
    packLabel: str(e.packLabel) ?? pack,
    category: categoryOf(type, pack),
    type,
    subtype: str(e.subtype) || null,
    name: ru,
    nameEn: en,
    rarity: str(e.rarity) || null,
    level: num(e.level),
    school: str(e.school) || null,
    priceValue: num(get(price, 'value')),
    priceDenomination: str(get(price, 'denomination')) || null,
    weight: num(e.weight),
    attunement: str(e.attunement) || null,
    properties: arr(e.properties).filter((p): p is string => typeof p === 'string'),
    description: str(e.description) ?? '',
  }
}

export type LibraryParse = { ok: true; rows: LibraryImportRow[]; total: number; duplicates: number } | { ok: false; error: string }

/**
 * Reads a library export. Entries from a lower-priority source (Laaru) are dropped
 * when a higher-priority source (AG) already has the same entry; within one source
 * nothing is dropped (different classes can share a feature name).
 */
export function parseLibraryExport(text: string): LibraryParse {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, error: 'Это не JSON-файл.' }
  }
  if (!isObject(raw) || raw.kind !== 'dndhub-library') return { ok: false, error: 'Это не файл библиотеки из макроса «Выгрузка библиотеки».' }
  const entries = arr(raw.entries)
    .filter(isObject)
    .map((e) => ({ row: toRow(e), priority: num(e.priority) ?? 999 }))
    .filter((x): x is { row: LibraryImportRow; priority: number } => x.row !== null)
    .sort((a, b) => a.priority - b.priority)

  const seenBySource = new Map<string, Source>()
  const seenUuid = new Set<string>()
  const rows: LibraryImportRow[] = []
  let duplicates = 0
  for (const { row } of entries) {
    if (seenUuid.has(row.uuid)) continue
    seenUuid.add(row.uuid)
    const key = dedupeKey(row)
    const owner = seenBySource.get(key)
    if (owner && owner !== row.source) {
      duplicates++
      continue
    }
    if (!owner) seenBySource.set(key, row.source)
    rows.push(row)
  }
  if (!rows.length) return { ok: false, error: 'В файле нет записей.' }
  return { ok: true, rows, total: entries.length, duplicates }
}

// ---- database ----

const LIST_COLUMNS =
  'uuid, source, pack, pack_label, category, type, subtype, name, name_en, rarity, level, school, price_value, price_denomination, weight, attunement, properties'

function client() {
  if (!supabase) throw new Error('Приложение не подключено к серверу.')
  return supabase
}

const CATEGORIES = new Set<string>(Object.keys(CATEGORY_LABEL))

function fromDb(r: unknown): LibraryRow | null {
  const uuid = str(get(r, 'uuid'))
  const name = str(get(r, 'name'))
  const category = str(get(r, 'category'))
  if (!uuid || !name || !category || !CATEGORIES.has(category)) return null
  const source = str(get(r, 'source'))
  return {
    uuid,
    source: source === 'ag' || source === 'laaru' ? source : 'other',
    pack: str(get(r, 'pack')) ?? '',
    packLabel: str(get(r, 'pack_label')) ?? '',
    category: category as LibraryCategory,
    type: str(get(r, 'type')) ?? '',
    subtype: str(get(r, 'subtype')),
    name,
    nameEn: str(get(r, 'name_en')),
    rarity: str(get(r, 'rarity')),
    level: num(get(r, 'level')),
    school: str(get(r, 'school')),
    priceValue: num(get(r, 'price_value')),
    priceDenomination: str(get(r, 'price_denomination')),
    weight: num(get(r, 'weight')),
    attunement: str(get(r, 'attunement')),
    properties: arr(get(r, 'properties')).filter((p): p is string => typeof p === 'string'),
  }
}

/** The whole catalogue without descriptions (about 1 MB), loaded in pages of 1000. */
export async function listLibrary(): Promise<LibraryRow[]> {
  const out: LibraryRow[] = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client().from('library').select(LIST_COLUMNS).order('uuid').range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    const rows = (data ?? []).map(fromDb).filter((r): r is LibraryRow => r !== null)
    out.push(...rows)
    if ((data ?? []).length < PAGE) break
  }
  return out
}

export async function libraryDescription(uuid: string): Promise<string> {
  const { data, error } = await client().from('library').select('description').eq('uuid', uuid).maybeSingle()
  if (error) throw new Error(error.message)
  return str(get(data, 'description')) ?? ''
}

/** GM: upsert all rows in batches, then remove entries that are no longer in the export. */
export async function uploadLibrary(rows: LibraryImportRow[], onProgress: (done: number) => void): Promise<number> {
  const startedAt = new Date().toISOString()
  const BATCH = 400
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH).map((r) => ({
      uuid: r.uuid,
      source: r.source,
      pack: r.pack,
      pack_label: r.packLabel,
      category: r.category,
      type: r.type,
      subtype: r.subtype,
      name: r.name,
      name_en: r.nameEn,
      rarity: r.rarity,
      level: r.level,
      school: r.school,
      price_value: r.priceValue,
      price_denomination: r.priceDenomination,
      weight: r.weight,
      attunement: r.attunement,
      properties: r.properties,
      description: r.description,
      imported_at: startedAt,
    }))
    const { error } = await client().from('library').upsert(batch, { onConflict: 'uuid' })
    if (error) throw new Error(/row-level security/i.test(error.message) ? 'Загружать библиотеку может только мастер.' : error.message)
    onProgress(Math.min(rows.length, i + BATCH))
  }
  const { error, count } = await client().from('library').delete({ count: 'exact' }).lt('imported_at', startedAt)
  if (error) throw new Error(error.message)
  return count ?? 0
}

