// Short view of a character for lists: latest snapshot + its edits, built into a sheet.
import { latestSnapshot, listChanges } from './db'
import { applyChanges } from './snapshot/changes'
import { buildSheet, type Sheet } from './snapshot/sheet'

export type CharacterSummary = { sheet: Sheet; snapshotAt: string }

export async function loadSummary(characterId: string): Promise<CharacterSummary | null> {
  const base = await latestSnapshot(characterId)
  if (!base) return null
  const { snapshot, editedPaths } = applyChanges(base.snapshot, await listChanges(base.id))
  return { sheet: buildSheet(snapshot, { editedPaths }), snapshotAt: base.createdAt }
}

/** Summaries for several characters; a failed one is simply missing. */
export async function loadSummaries(ids: string[]): Promise<Record<string, CharacterSummary>> {
  const entries = await Promise.all(ids.map(async (id) => [id, await loadSummary(id).catch(() => null)] as const))
  const out: Record<string, CharacterSummary> = {}
  for (const [id, summary] of entries) if (summary) out[id] = summary
  return out
}
