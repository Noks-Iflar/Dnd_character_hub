// Data access for characters and snapshots. RLS decides what each user sees.
import { parseSnapshotJson } from './snapshot/parse'
import { get, isObject, str, type JsonObject } from './snapshot/read'
import type { Change, ChangeValue, Review } from './snapshot/changes'
import type { Snapshot } from './snapshot/types'
import { supabase } from './supabase'
import type { Profile } from './profile'

export type CharacterStatus = 'in_game' | 'between_sessions'

export type Character = {
  id: string
  name: string
  ownerId: string | null
  foundryActorId: string
  status: CharacterStatus
  lastSnapshotAt: string | null
}

function client() {
  if (!supabase) throw new Error('Приложение не подключено к серверу.')
  return supabase
}

function toCharacter(row: unknown): Character | null {
  if (!isObject(row)) return null
  const id = str(row.id)
  const name = str(row.name)
  const actor = str(row.foundry_actor_id)
  if (!id || name === null || !actor) return null
  return {
    id,
    name,
    ownerId: str(row.owner_id),
    foundryActorId: actor,
    status: row.status === 'in_game' ? 'in_game' : 'between_sessions',
    lastSnapshotAt: null,
  }
}

/** Characters visible to the current user (own for players, all for the GM), with last snapshot time. */
export async function listCharacters(): Promise<Character[]> {
  const db = client()
  const { data, error } = await db.from('characters').select('id, name, owner_id, foundry_actor_id, status').order('name')
  if (error) throw new Error(error.message)
  const characters = (data ?? []).map(toCharacter).filter((c): c is Character => c !== null)
  if (!characters.length) return characters

  const snaps = await db
    .from('snapshots')
    .select('character_id, created_at')
    .in('character_id', characters.map((c) => c.id))
    .order('created_at', { ascending: false })
  if (snaps.error) throw new Error(snaps.error.message)
  for (const row of snaps.data ?? []) {
    const character = characters.find((c) => c.id === get(row, 'character_id'))
    if (character && !character.lastSnapshotAt) character.lastSnapshotAt = str(get(row, 'created_at'))
  }
  return characters
}

/** All profiles; only the GM gets more than their own row (RLS). */
export async function listProfiles(): Promise<Profile[]> {
  const { data, error } = await client().from('profiles').select('id, display_name, role, timezone').order('display_name')
  if (error) throw new Error(error.message)
  return (data ?? []).filter(
    (p): p is Profile =>
      isObject(p) && typeof p.id === 'string' && typeof p.display_name === 'string' && (p.role === 'gm' || p.role === 'player'),
  )
}

export async function setCharacterOwner(characterId: string, ownerId: string | null): Promise<void> {
  const { error } = await client().from('characters').update({ owner_id: ownerId }).eq('id', characterId)
  if (error) throw new Error(error.message)
}

/** The snapshot as stored: drop the debug copy of derived data to keep rows small. */
export function toStoredSnapshot(snapshot: Snapshot): JsonObject {
  const computed = snapshot.computed ? { ...snapshot.computed } : null
  if (computed) delete computed.derived
  return { ...snapshot, computed }
}

export type UploadResult = { name: string; ok: boolean; message: string }

/**
 * GM upload: creates the character on first sight (matched by Foundry actor id),
 * marks it "between sessions" and adds a new snapshot row.
 */
export async function uploadSnapshots(snapshots: Snapshot[]): Promise<UploadResult[]> {
  const db = client()
  const results: UploadResult[] = []
  for (const snapshot of snapshots) {
    const name = str(snapshot.source.name) ?? 'Без имени'
    const actorId = snapshot.meta.actorId
    if (!actorId) {
      results.push({ name, ok: false, message: 'нет id актёра Foundry' })
      continue
    }
    const character = await db
      .from('characters')
      .upsert({ foundry_actor_id: actorId, name, status: 'between_sessions' }, { onConflict: 'foundry_actor_id' })
      .select('id')
      .single()
    if (character.error) {
      results.push({ name, ok: false, message: character.error.message })
      continue
    }
    const inserted = await db.from('snapshots').insert({
      character_id: get(character.data, 'id'),
      data: toStoredSnapshot(snapshot),
      foundry_version: snapshot.meta.foundryVersion,
      system_version: snapshot.meta.systemVersion,
      exported_at: snapshot.meta.exportedAt,
    })
    results.push(inserted.error ? { name, ok: false, message: inserted.error.message } : { name, ok: true, message: 'загружен' })
  }
  return results
}

export type StoredSnapshot = { id: string; snapshot: Snapshot; createdAt: string }

/** Latest snapshot of a character, parsed and validated. */
export async function latestSnapshot(characterId: string): Promise<StoredSnapshot | null> {
  const { data, error } = await client()
    .from('snapshots')
    .select('id, data, created_at')
    .eq('character_id', characterId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  const parsed = parseSnapshotJson(JSON.stringify(get(data, 'data')))
  if (!parsed.ok || !parsed.snapshots[0]) throw new Error(`Снимок повреждён: ${parsed.ok ? 'пусто' : parsed.error}`)
  return { id: str(get(data, 'id')) ?? '', snapshot: parsed.snapshots[0], createdAt: str(get(data, 'created_at')) ?? '' }
}

export async function getCharacter(id: string): Promise<Character | null> {
  const { data, error } = await client().from('characters').select('id, name, owner_id, foundry_actor_id, status').eq('id', id).maybeSingle()
  if (error) throw new Error(error.message)
  return toCharacter(data)
}

const changeValue = (v: unknown): ChangeValue | null => (typeof v === 'number' || typeof v === 'boolean' ? v : null)
const reviewOf = (v: unknown): Review => (v === 'accepted' || v === 'rejected' ? v : null)
const CHANGE_COLUMNS = 'id, kind, item_uuid, item_name, item_type, path, old_value, new_value, created_at, applied_at, review'

function toChange(row: unknown): Change | null {
  if (!isObject(row)) return null
  const id = str(row.id)
  const path = str(row.path)
  const newValue = changeValue(row.new_value)
  const createdAt = str(row.created_at)
  if (!id || !path || newValue === null || !createdAt) return null
  return {
    id,
    kind: row.kind === 'add_item' ? 'add_item' : 'set',
    itemUuid: str(row.item_uuid),
    itemName: str(row.item_name),
    itemType: str(row.item_type),
    path,
    oldValue: changeValue(row.old_value),
    newValue,
    createdAt,
    appliedAt: str(row.applied_at),
    review: reviewOf(row.review),
  }
}

/** Edits made on top of one snapshot, oldest first. */
export async function listChanges(snapshotId: string): Promise<Change[]> {
  const { data, error } = await client()
    .from('changes')
    .select(CHANGE_COLUMNS)
    .eq('snapshot_id', snapshotId)
    .order('created_at')
  if (error) throw new Error(error.message)
  return (data ?? []).map(toChange).filter((c): c is Change => c !== null)
}

function describeWriteError(message: string): string {
  if (/row-level security/i.test(message)) return 'Правка не принята: персонаж сейчас в игре или это не твой персонаж.'
  return message
}

export async function addChange(input: {
  characterId: string
  snapshotId: string
  path: string
  oldValue: ChangeValue | null
  newValue: ChangeValue
}): Promise<void> {
  const { error } = await client().from('changes').insert({
    character_id: input.characterId,
    snapshot_id: input.snapshotId,
    path: input.path,
    old_value: input.oldValue,
    new_value: input.newValue,
  })
  if (error) throw new Error(describeWriteError(error.message))
}

export const snapshotSizeKb = (snapshot: Snapshot): number => Math.round(JSON.stringify(toStoredSnapshot(snapshot)).length / 1024)

export async function setCharacterStatus(characterIds: string[], status: CharacterStatus): Promise<void> {
  if (!characterIds.length) return
  const { error } = await client().from('characters').update({ status }).in('id', characterIds)
  if (error) throw new Error(error.message)
}

export type PendingChange = Change & { characterId: string; snapshotId: string }

/** Edits the GM has not finished with (not applied in Foundry, rejections not yet closed), oldest first. */
export async function listPendingChanges(): Promise<PendingChange[]> {
  const { data, error } = await client()
    .from('changes')
    .select(`character_id, snapshot_id, ${CHANGE_COLUMNS}`)
    .is('applied_at', null)
    .order('created_at')
  if (error) throw new Error(error.message)
  const out: PendingChange[] = []
  for (const row of data ?? []) {
    const change = toChange(row)
    const characterId = str(get(row, 'character_id'))
    const snapshotId = str(get(row, 'snapshot_id'))
    if (change && characterId && snapshotId) out.push({ ...change, characterId, snapshotId })
  }
  return out
}

/** The GM's decision on these journal rows (null takes it back). */
export async function setReview(changeIds: string[], review: Review): Promise<void> {
  if (!changeIds.length) return
  const { error } = await client().from('changes').update({ review }).in('id', changeIds)
  if (error) throw new Error(error.message)
}

/** The GM is done with these rows: accepted ones were applied in Foundry, rejected ones are closed. */
export async function markChangesApplied(changeIds: string[]): Promise<void> {
  if (!changeIds.length) return
  const { error } = await client().from('changes').update({ applied_at: new Date().toISOString() }).in('id', changeIds)
  if (error) throw new Error(error.message)
}

export type CharacterNotes = { body: string; updatedAt: string | null }

export async function getNotes(characterId: string): Promise<CharacterNotes> {
  const { data, error } = await client().from('character_notes').select('body, updated_at').eq('character_id', characterId).maybeSingle()
  if (error) throw new Error(error.message)
  return { body: str(get(data, 'body')) ?? '', updatedAt: str(get(data, 'updated_at')) }
}

export async function saveNotes(characterId: string, userId: string, body: string): Promise<void> {
  const { error } = await client()
    .from('character_notes')
    .upsert({ character_id: characterId, body, updated_by: userId, updated_at: new Date().toISOString() }, { onConflict: 'character_id' })
  if (error) throw new Error(describeWriteError(error.message))
}

export type SnapshotVersion = { id: string; createdAt: string; foundryVersion: string | null; systemVersion: string | null; changes: number }

/** All snapshots of a character, newest first, with the number of edits made on top of each. */
export async function listSnapshotVersions(characterId: string): Promise<SnapshotVersion[]> {
  const db = client()
  const [snaps, edits] = await Promise.all([
    db
      .from('snapshots')
      .select('id, created_at, foundry_version, system_version')
      .eq('character_id', characterId)
      .order('created_at', { ascending: false }),
    db.from('changes').select('snapshot_id').eq('character_id', characterId),
  ])
  if (snaps.error) throw new Error(snaps.error.message)
  if (edits.error) throw new Error(edits.error.message)
  const counts = new Map<string, number>()
  for (const row of edits.data ?? []) {
    const id = str(get(row, 'snapshot_id'))
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  const out: SnapshotVersion[] = []
  for (const row of snaps.data ?? []) {
    const id = str(get(row, 'id'))
    const createdAt = str(get(row, 'created_at'))
    if (!id || !createdAt) continue
    out.push({
      id,
      createdAt,
      foundryVersion: str(get(row, 'foundry_version')),
      systemVersion: str(get(row, 'system_version')),
      changes: counts.get(id) ?? 0,
    })
  }
  return out
}

/** One snapshot by id (RLS: own character or the GM). */
export async function getSnapshot(snapshotId: string): Promise<StoredSnapshot | null> {
  const { data, error } = await client().from('snapshots').select('id, data, created_at').eq('id', snapshotId).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  const parsed = parseSnapshotJson(JSON.stringify(get(data, 'data')))
  if (!parsed.ok || !parsed.snapshots[0]) throw new Error(`Снимок повреждён: ${parsed.ok ? 'пусто' : parsed.error}`)
  return { id: str(get(data, 'id')) ?? '', snapshot: parsed.snapshots[0], createdAt: str(get(data, 'created_at')) ?? '' }
}

/** Id of the latest snapshot of a character (new edits attach to it). */
export async function latestSnapshotId(characterId: string): Promise<string | null> {
  const { data, error } = await client()
    .from('snapshots')
    .select('id')
    .eq('character_id', characterId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return str(get(data, 'id'))
}

/** Records "add N of this library item" for a character, on top of its latest snapshot. */
export async function addItemChange(input: { characterId: string; itemUuid: string; itemName: string; itemType: string; quantity: number }) {
  const snapshotId = await latestSnapshotId(input.characterId)
  if (!snapshotId) throw new Error('У персонажа ещё нет снимка из Foundry.')
  const { error } = await client().from('changes').insert({
    character_id: input.characterId,
    snapshot_id: snapshotId,
    kind: 'add_item',
    path: 'add-item',
    new_value: input.quantity,
    item_uuid: input.itemUuid,
    item_name: input.itemName,
    item_type: input.itemType,
  })
  if (error) throw new Error(describeWriteError(error.message))
}

/** GM: deletes a character with all its snapshots, edits and notes (database cascades). */
export async function deleteCharacter(id: string): Promise<void> {
  // Ask for the deleted row back: RLS silently deletes nothing for non-GMs
  const { data, error } = await client().from('characters').delete().eq('id', id).select('id')
  if (error) throw new Error(error.message)
  if (!data?.length) throw new Error('Персонаж не удалён: удалять может только мастер.')
}
