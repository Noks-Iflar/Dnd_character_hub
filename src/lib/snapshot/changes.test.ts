import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { applyChanges, isEditablePath, readPath, type Change } from './changes'
import { parseSnapshotJson } from './parse'
import { buildSheet } from './sheet'
import type { Snapshot } from './types'

let n = 0
const change = (path: string, newValue: number | boolean, createdAt = `2026-11-16T10:00:0${n++ % 10}Z`): Change => ({
  id: `ch${n}`,
  path,
  oldValue: null,
  newValue,
  createdAt,
  appliedAt: null,
})

const ITEM = 'abcdefghij012345'
const snapshot: Snapshot = {
  schemaVersion: 1,
  meta: { foundryVersion: '14.370', systemVersion: '6.1.0', actorId: 'a1', exportedAt: null },
  source: {
    name: 'Тест',
    type: 'character',
    system: { attributes: { hp: { value: 10 } }, currency: { gp: 5 } },
    items: [{ _id: ITEM, name: 'Меч', type: 'weapon', system: { quantity: 1, equipped: true } }],
  },
  computed: null,
  portrait: null,
}

describe('isEditablePath', () => {
  it('matches the database list', () => {
    expect(isEditablePath('system.attributes.hp.value')).toBe(true)
    expect(isEditablePath(`items.${ITEM}.system.uses.spent`)).toBe(true)
    expect(isEditablePath('system.abilities.str.value')).toBe(false)
    expect(isEditablePath('items.short.system.quantity')).toBe(false)
  })
})

describe('applyChanges', () => {
  it('applies edits in time order, last one wins, without touching the snapshot', () => {
    const { snapshot: edited, editedPaths } = applyChanges(snapshot, [
      change('system.currency.gp', 20, '2026-11-16T12:00:00Z'),
      change('system.currency.gp', 15, '2026-11-16T11:00:00Z'),
      change('system.attributes.hp.value', 4),
      change(`items.${ITEM}.system.equipped`, false),
    ])
    expect(readPath(edited.source, 'system.currency.gp')).toBe(20)
    expect(readPath(edited.source, 'system.attributes.hp.value')).toBe(4)
    expect(readPath(edited.source, `items.${ITEM}.system.equipped`)).toBe(false)
    expect(readPath(snapshot.source, 'system.currency.gp')).toBe(5) // original untouched
    expect([...editedPaths].sort()).toEqual(['items.abcdefghij012345.system.equipped', 'system.attributes.hp.value', 'system.currency.gp'])
  })

  it('adds library items as pending inventory entries', () => {
    const add: Change = {
      id: 'c42',
      kind: 'add_item',
      itemUuid: 'Compendium.x.Item.potion',
      itemName: 'Зелье лечения',
      itemType: 'consumable',
      path: 'add-item',
      oldValue: null,
      newValue: 2,
      createdAt: '2026-11-16T10:00:00Z',
      appliedAt: null,
    }
    const { snapshot: edited, editedPaths } = applyChanges(snapshot, [add])
    const sheet = buildSheet(edited, { editedPaths })
    expect(sheet.inventory.find((i) => i.pending)).toEqual({
      id: 'pending-c42',
      name: 'Зелье лечения',
      type: 'consumable',
      quantity: 2,
      equipped: false,
      description: '',
      pending: true,
    })
    expect(sheet.inventory.find((i) => i.name === 'Меч')?.pending).toBe(false)
    expect((snapshot.source.items as unknown[]).length).toBe(1) // snapshot untouched
  })

  it('skips forbidden paths and items that are gone', () => {
    const { snapshot: edited, editedPaths } = applyChanges(snapshot, [
      change('system.abilities.str.value', 30),
      change('items.zzzzzzzzzzzzzzzz.system.quantity', 9),
    ])
    expect(edited.source).toEqual(snapshot.source)
    expect(editedPaths.size).toBe(0)
  })
})

const PARTY = join(import.meta.dirname, '..', '..', '..', 'fixtures', 'snapshots', 'party.json')

describe.skipIf(!existsSync(PARTY))('edits on the real fighter snapshot', () => {
  const fighter = () => {
    const r = parseSnapshotJson(readFileSync(PARTY, 'utf8'))
    if (!r.ok) throw new Error(r.error)
    const s = r.snapshots.find((x) => x.source.name === 'Мерик')
    if (!s) throw new Error('fixture changed')
    return s
  }

  it('HP, second wind, gold and armor show up on the sheet', () => {
    const base = fighter()
    const before = buildSheet(base)
    const wind = before.resources.find((r) => r.name.startsWith('Второе дыхание'))
    const armor = before.inventory.find((i) => i.type === 'equipment' && i.equipped)
    if (!wind || !armor) throw new Error('fixture changed')

    const { snapshot: edited, editedPaths } = applyChanges(base, [
      change('system.attributes.hp.value', 40),
      change(wind.path, 2), // two uses spent
      change('system.currency.gp', 12),
      change(`items.${armor.id}.system.equipped`, false),
    ])
    const after = buildSheet(edited, { editedPaths })
    expect(after.hp.value).toBe(40)
    expect(after.hp.max).toEqual({ value: 94, from: 'foundry' })
    expect(after.resources.find((r) => r.name.startsWith('Второе дыхание'))).toMatchObject({ value: 1, max: 3 })
    expect(after.currency.gp).toBe(12)
    expect(after.inventory.find((i) => i.id === armor.id)?.equipped).toBe(false)
    expect(after.ac).toEqual({ value: 21, from: 'estimate' }) // Foundry will recalculate
    expect(before.ac.from).toBe('foundry')
  })
})
