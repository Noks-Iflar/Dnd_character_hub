// File with pending edits for the "Применить правки" Foundry macro (phase 5).
import type { Character, PendingChange } from './db'
import { reviewLines } from './review'
import { isEditablePath, type ChangeValue } from './snapshot/changes'

export type FileSetChange = { kind: 'set'; path: string; value: ChangeValue; was: ChangeValue | null }
export type FileAddItem = { kind: 'add_item'; uuid: string; name: string; quantity: number; type: string | null }

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
 * Accepted edits by character. For "set" edits only the final value per field goes into the file
 * (with the value before the first edit, for the preview); every "add_item" edit is its own line.
 * Undecided and rejected lines stay out of the file.
 */
export function buildChangesFile(characters: Character[], pending: PendingChange[], now = new Date()): ChangesFile {
  const out: ChangesFile['characters'] = []
  for (const character of characters) {
    const accepted = reviewLines(pending.filter((c) => c.characterId === character.id)).filter((l) => l.decision === 'accepted')
    const changes: (FileSetChange | FileAddItem)[] = []
    const ids: string[] = []
    for (const line of accepted) {
      const c = line.last
      if (line.kind === 'add_item') {
        if (!c.itemUuid || !c.itemName || typeof c.newValue !== 'number') continue
        changes.push({ kind: 'add_item', uuid: c.itemUuid, name: c.itemName, quantity: c.newValue, type: c.itemType ?? null })
      } else {
        if (!isEditablePath(line.path)) continue
        changes.push({ kind: 'set', path: line.path, value: line.newValue, was: line.oldValue })
      }
      ids.push(...line.rows.map((r) => r.id))
    }
    if (!changes.length) continue
    // fields first, then added items, as the macro preview expects
    changes.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'set' ? -1 : 1))
    out.push({ actorId: character.foundryActorId, name: character.name, changeIds: ids, changes })
  }
  return { kind: 'dndhub-changes', version: 1, createdAt: now.toISOString(), characters: out }
}
