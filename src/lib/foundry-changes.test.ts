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
  ...o,
})

describe('buildChangesFile', () => {
  it('keeps the final value per field and every added item; skips characters without edits', () => {
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
          changeIds: ['x1', 'x2', 'x3', 'x4'],
          changes: [
            { kind: 'set', path: 'system.attributes.hp.value', value: 22, was: 35 },
            { kind: 'add_item', uuid: 'Compendium.x.Item.p', name: 'Зелье', quantity: 2 },
          ],
        },
      ],
    })
  })
})
