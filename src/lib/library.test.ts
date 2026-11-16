import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { categoryOf, dedupeKey, parseLibraryExport, splitName } from './library'

const entry = (o: Record<string, unknown>) => ({ packageName: 'ag-fifthpendium', pack: 'ag-fifthpendium.equipment', priority: 0, type: 'weapon', ...o })

describe('splitName', () => {
  it('splits AG and Laaru names', () => {
    expect(splitName('Одеяло [Blanket]', null)).toEqual({ ru: 'Одеяло', en: 'Blanket' })
    expect(splitName('Глефа +1 / Glaive +1', 'Glaive +1')).toEqual({ ru: 'Глефа +1', en: 'Glaive +1' })
    expect(splitName('Латунная кружка', null)).toEqual({ ru: 'Латунная кружка', en: null })
    expect(splitName('Кинжал', 'Dagger')).toEqual({ ru: 'Кинжал', en: 'Dagger' })
  })
})

describe('categoryOf', () => {
  it('groups types and packs into catalogue sections', () => {
    expect(categoryOf('weapon', 'x.items')).toBe('items')
    expect(categoryOf('spell', 'x.spells')).toBe('spells')
    expect(categoryOf('feat', 'ag-fifthpendium.feats')).toBe('feats')
    expect(categoryOf('feat', 'ag-fifthpendium-eberron.options')).toBe('feats')
    expect(categoryOf('feat', 'laaru-dnd5-hw.classfeatures')).toBe('features')
    expect(categoryOf('feat', 'laaru-dnd5-hw.conditions')).toBe('rules')
    expect(categoryOf('race', 'laaru-dnd5-hw.races')).toBe('origins')
    expect(categoryOf('facility', 'ag-fifthpendium.bastions')).toBe('bastions')
  })
})

describe('parseLibraryExport', () => {
  it('drops Laaru entries that AG already has, keeps duplicates inside one source', () => {
    const text = JSON.stringify({
      kind: 'dndhub-library',
      entries: [
        entry({ uuid: 'l1', name: 'Кинжал / Dagger', packageName: 'laaru-dnd5-hw', pack: 'laaru-dnd5-hw.items', priority: 5 }),
        entry({ uuid: 'a1', name: 'Кинжал [Dagger]' }),
        entry({ uuid: 'l2', name: 'Безделушка', packageName: 'laaru-dnd5-hw', pack: 'laaru-dnd5-hw.items', priority: 5, type: 'loot' }),
        entry({ uuid: 'f1', name: 'Дополнительная атака [Extra Attack]', type: 'feat', pack: 'ag-fifthpendium.classes', priority: 1 }),
        entry({ uuid: 'f2', name: 'Дополнительная атака [Extra Attack]', type: 'feat', pack: 'ag-fifthpendium.classes', priority: 1 }),
      ],
    })
    const r = parseLibraryExport(text)
    if (!r.ok) throw new Error(r.error)
    expect(r.rows.map((x) => x.uuid)).toEqual(['a1', 'f1', 'f2', 'l2'])
    expect(r.duplicates).toBe(1)
    expect(r.rows[0]).toMatchObject({ name: 'Кинжал', nameEn: 'Dagger', source: 'ag', category: 'items' })
  })

  it('rejects other files', () => {
    expect(parseLibraryExport('{"kind":"dndhub-packs"}').ok).toBe(false)
    expect(parseLibraryExport('nope').ok).toBe(false)
  })

  it('dedupe key ignores case, ё and punctuation', () => {
    expect(dedupeKey({ type: 'loot', name: 'Ёлка!', nameEn: null })).toBe(dedupeKey({ type: 'loot', name: 'елка', nameEn: null }))
  })
})

const LIBRARY = join(import.meta.dirname, '..', '..', 'fixtures', 'compendia', 'library.json')

describe.skipIf(!existsSync(LIBRARY))('real library export from fixtures/', () => {
  it('keeps every section and removes cross-source duplicates', () => {
    const r = parseLibraryExport(readFileSync(LIBRARY, 'utf8'))
    if (!r.ok) throw new Error(r.error)
    expect(r.total).toBe(8995)
    expect(r.duplicates).toBeGreaterThan(300)
    expect(new Set(r.rows.map((x) => x.category))).toEqual(new Set(['items', 'spells', 'feats', 'origins', 'classes', 'features', 'bastions', 'rules']))
    const dagger = r.rows.filter((x) => x.nameEn === 'Dagger' && x.type === 'weapon')
    expect(dagger).toHaveLength(1)
    expect(dagger[0]?.source).toBe('ag')
    console.log('rows', r.rows.length, 'duplicates', r.duplicates)
  })
})
