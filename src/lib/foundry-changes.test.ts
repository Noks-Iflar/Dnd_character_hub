import { describe, expect, it } from 'vitest'
import type { Character, PendingChange } from './db'
import { buildChangesFile } from './foundry-changes'

const character = (id: string, actor: string): Character => ({ id, name: id, ownerId: null, foundryActorId: actor, status: 'between_sessions', lastSnapshotAt: null })
const change = (o: Partial<PendingChange> & Pick<PendingChange, 'id' | 'path' | 'newValue' | 'createdAt'>): PendingChange => ({
  characterId: 'c1',
  snapshotId: 's1',
  oldValue: null,
  appliedAt: null,
  kind: 'set',
  review: 'accepted',
  ...o,
})

describe('buildChangesFile', () => {
  it('keeps the final value per accepted field and every accepted item; skips characters without edits', () => {
    const file = buildChangesFile(
      [character('c1', 'actorA'), character('c2', 'actorB')],
      [
        change({ id: 'x2', path: 'system.attributes.hp.value', oldValue: 30, newValue: 22, createdAt: '2026-11-16T11:00:00Z' }),
        change({ id: 'x1', path: 'system.attributes.hp.value', oldValue: 35, newValue: 30, createdAt: '2026-11-16T10:00:00Z' }),
        change({ id: 'x3', kind: 'add_item', path: 'add-item', newValue: 2, itemUuid: 'Compendium.x.Item.p', itemName: 'Зелье', createdAt: '2026-11-16T12:00:00Z' }),
        change({ id: 'x4', path: 'system.abilities.str.value', newValue: 30, createdAt: '2026-11-16T12:00:00Z' }),
      ],
      new Date('2026-11-17T00:00:00Z'),
    )
    expect(file).toEqual({
      kind: 'dndhub-changes',
      version: 1,
      createdAt: '2026-11-17T00:00:00.000Z',
      characters: [
        {
          actorId: 'actorA',
          name: 'c1',
          changeIds: ['x1', 'x2', 'x3'],
          changes: [
            { kind: 'set', path: 'system.attributes.hp.value', value: 22, was: 35 },
            { kind: 'add_item', uuid: 'Compendium.x.Item.p', name: 'Зелье', quantity: 2, type: null },
          ],
        },
      ],
    })
  })

  it('leaves out undecided and rejected lines, and characters with nothing accepted', () => {
    const hp = 'system.attributes.hp.value'
    const file = buildChangesFile(
      [character('c1', 'actorA'), character('c2', 'actorB')],
      [
        change({ id: 'a1', path: hp, oldValue: 59, newValue: 40, createdAt: '2026-11-16T10:00:00Z' }),
        // a newer edit of the same field is not decided yet: the whole line waits
        change({ id: 'a2', path: hp, oldValue: 40, newValue: 52, createdAt: '2026-11-16T11:00:00Z', review: null }),
        change({ id: 'a3', path: 'system.currency.gp', oldValue: 5, newValue: 500, createdAt: '2026-11-16T10:00:00Z', review: 'rejected' }),
        change({ id: 'a4', path: 'system.currency.sp', oldValue: 1, newValue: 3, createdAt: '2026-11-16T10:30:00Z' }),
        change({ id: 'b1', characterId: 'c2', path: hp, newValue: 1, createdAt: '2026-11-16T10:00:00Z', review: 'rejected' }),
      ],
    )
    expect(file.characters).toEqual([
      { actorId: 'actorA', name: 'c1', changeIds: ['a4'], changes: [{ kind: 'set', path: 'system.currency.sp', value: 3, was: 1 }] },
    ])
  })
})
