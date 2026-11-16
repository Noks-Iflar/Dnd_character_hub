// File with pending edits for the "Применить правки" Foundry macro (phase 5).
import type { Character, PendingChange } from './db'
import { isEditablePath, type ChangeValue } from './snapshot/changes'

export type FileSetChange = { kind: 'set'; path: string; value: ChangeValue; was: ChangeValue | null }
export type FileAddItem = { kind: 'add_item'; uuid: string; name: string; quantity: number }

export type ChangesFile = {
  kind: 'dndhub-changes'
  version: 1
  createdAt: string
  characters: {
    actorId: string
    name: string
    /** Journal rows covered by this file: the app marks exactly these as applied */
    changeIds: string[]
    changes: (FileSetChange | FileAddItem)[]
  }[]
}

/**
 * Groups pending edits by character. For "set" edits only the final value per field
 * goes into the file (with the value before the first edit, for the preview);
 * every "add_item" edit stays a separate line.
 */
export function buildChangesFile(characters: Character[], pending: PendingChange[], now = new Date()): ChangesFile {
  const out: ChangesFile['characters'] = []
  for (const character of characters) {
    const own = pending.filter((c) => c.characterId === character.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    if (!own.length) continue
    const sets = new Map<string, FileSetChange>()
    const adds: FileAddItem[] = []
    for (const c of own) {
      if (c.kind === 'add_item') {
        if (c.itemUuid && c.itemName && typeof c.newValue === 'number') adds.push({ kind: 'add_item', uuid: c.itemUuid, name: c.itemName, quantity: c.newValue })
        continue
      }
      if (!isEditablePath(c.path)) continue
      const first = sets.get(c.path)
      sets.set(c.path, { kind: 'set', path: c.path, value: c.newValue, was: first ? first.was : c.oldValue })
    }
    out.push({ actorId: character.foundryActorId, name: character.name, changeIds: own.map((c) => c.id), changes: [...sets.values(), ...adds] })
  }
  return { kind: 'dndhub-changes', version: 1, createdAt: now.toISOString(), characters: out }
}
