import { arr, isObject, type JsonObject } from './read'
import type { Snapshot } from './types'

export type ChangeValue = number | boolean

/** The GM's decision on an edit: null = not decided yet (and edits from before review existed). */
export type Review = 'accepted' | 'rejected' | null

/**
 * One journal entry. kind "set": "field at `path` became `newValue`".
 * kind "add_item": add `newValue` pieces of the library item `itemUuid` (path is "add-item").
 */
export type Change = {
  id: string
  kind?: 'set' | 'add_item'
  itemUuid?: string | null
  itemName?: string | null
  itemType?: string | null
  path: string
  oldValue: ChangeValue | null
  newValue: ChangeValue
  createdAt: string
  appliedAt: string | null
  review?: Review
}

const ITEM_PATH = /^items\.([A-Za-z0-9]{16})\.(system\..+)$/

/** Same list as public.is_editable_path() in the database. */
const EDITABLE = [
  /^system\.attributes\.hp\.(value|temp)$/,
  /^system\.attributes\.death\.(success|failure)$/,
  /^system\.attributes\.(exhaustion|inspiration)$/,
  /^system\.spells\.(spell[1-9]|pact)\.value$/,
  /^system\.currency\.(pp|gp|ep|sp|cp)$/,
  /^items\.[A-Za-z0-9]{16}\.system\.(quantity|equipped|uses\.spent|hd\.spent)$/,
]

export function isEditablePath(path: string): boolean {
  return EDITABLE.some((re) => re.test(path))
}

export const itemPath = (itemId: string, field: string): string => `items.${itemId}.system.${field}`

export const ADD_ITEM_PATH = 'add-item'

/** Id of the placeholder item shown on the sheet until the GM adds the real one in Foundry. */
export const pendingItemId = (changeId: string): string => `pending-${changeId}`

/** Reads the current value at an editable path of the actor source. */
export function readPath(source: JsonObject, path: string): unknown {
  const m = ITEM_PATH.exec(path)
  let target: unknown = source
  let rest = path
  if (m) {
    target = arr(source.items).find((i) => isObject(i) && i._id === m[1])
    rest = m[2] ?? ''
  }
  for (const key of rest.split('.')) {
    if (!isObject(target)) return undefined
    target = target[key]
  }
  return target
}

function writePath(source: JsonObject, path: string, value: ChangeValue): boolean {
  const m = ITEM_PATH.exec(path)
  let target: unknown = source
  let rest = path
  if (m) {
    target = arr(source.items).find((i) => isObject(i) && i._id === m[1])
    rest = m[2] ?? ''
  }
  const keys = rest.split('.')
  const last = keys.pop()
  for (const key of keys) {
    if (!isObject(target)) return false
    if (!isObject(target[key])) target[key] = {}
    target = target[key]
  }
  if (!isObject(target) || !last) return false
  target[last] = value
  return true
}

/**
 * Sheet = snapshot source + edits. Edits apply in time order (last one wins);
 * the snapshot itself is never modified. Unknown paths, missing items and edits
 * the GM rejected are skipped.
 */
export function applyChanges(snapshot: Snapshot, changes: Change[]): { snapshot: Snapshot; editedPaths: Set<string> } {
  const source = structuredClone(snapshot.source)
  const editedPaths = new Set<string>()
  const ordered = [...changes].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  for (const change of ordered) {
    if (change.review === 'rejected') continue
    if (change.kind === 'add_item') {
      if (typeof change.newValue !== 'number' || !change.itemName) continue
      const items = Array.isArray(source.items) ? source.items : (source.items = [])
      items.push({
        _id: pendingItemId(change.id),
        name: change.itemName,
        type: change.itemType ?? 'loot',
        system: { quantity: change.newValue, equipped: false, description: { value: '' } },
        flags: { dndhub: { pending: true, uuid: change.itemUuid ?? null } },
      })
      editedPaths.add(ADD_ITEM_PATH)
      continue
    }
    if (!isEditablePath(change.path)) continue
    if (writePath(source, change.path, change.newValue)) editedPaths.add(change.path)
  }
  return { snapshot: { ...snapshot, source }, editedPaths }
}
