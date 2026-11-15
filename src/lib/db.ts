// Data access for characters and snapshots. RLS decides what each user sees.
import { parseSnapshotJson } from './snapshot/parse'
import { get, isObject, str, type JsonObject } from './snapshot/read'
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

/** Latest snapshot of a character, parsed and validated. */
export async function latestSnapshot(characterId: string): Promise<{ snapshot: Snapshot; createdAt: string } | null> {
  const { data, error } = await client()
    .from('snapshots')
    .select('data, created_at')
    .eq('character_id', characterId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  const parsed = parseSnapshotJson(JSON.stringify(get(data, 'data')))
  if (!parsed.ok || !parsed.snapshots[0]) throw new Error(`Снимок повреждён: ${parsed.ok ? 'пусто' : parsed.error}`)
  return { snapshot: parsed.snapshots[0], createdAt: str(get(data, 'created_at')) ?? '' }
}

export const snapshotSizeKb = (snapshot: Snapshot): number => Math.round(JSON.stringify(toStoredSnapshot(snapshot)).length / 1024)
