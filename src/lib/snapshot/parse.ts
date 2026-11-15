import { arr, get, isObject, str, type JsonObject } from './read'
import type { Snapshot } from './types'

export type ParseResult = { ok: true; snapshots: Snapshot[] } | { ok: false; error: string }

function isActorSource(value: unknown): value is JsonObject {
  return isObject(value) && value.type === 'character' && isObject(value.system) && Array.isArray(value.items)
}

function fromSnapshotObject(value: JsonObject): Snapshot | null {
  if (value.schemaVersion !== 1 || !isActorSource(value.source)) return null
  return {
    schemaVersion: 1,
    meta: {
      foundryVersion: str(get(value, 'meta', 'foundryVersion')),
      systemVersion: str(get(value, 'meta', 'systemVersion')),
      actorId: str(get(value, 'meta', 'actorId')),
      exportedAt: str(get(value, 'meta', 'exportedAt')),
    },
    source: value.source,
    computed: isObject(value.computed) ? value.computed : null,
    portrait: str(value.portrait),
  }
}

/** A plain Foundry "Export Data" file: no computed values, no portrait. */
function fromActorExport(value: JsonObject): Snapshot {
  const uuid = str(get(value, '_stats', 'exportSource', 'uuid'))
  return {
    schemaVersion: 1,
    meta: {
      foundryVersion: str(get(value, '_stats', 'coreVersion')),
      systemVersion: str(get(value, '_stats', 'systemVersion')),
      actorId: str(value._id) ?? (uuid ? uuid.replace(/^Actor\./, '') : null),
      exportedAt: null,
    },
    source: value,
    computed: null,
    portrait: null,
  }
}

/** Accepts a snapshot, a party bundle or a plain Export Data file. */
export function parseSnapshotJson(text: string): ParseResult {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { ok: false, error: 'Это не JSON-файл.' }
  }
  if (!isObject(data)) return { ok: false, error: 'Неизвестный формат файла.' }
  const actorType = data.type

  if (data.kind === 'party') {
    const snapshots = arr(data.snapshots)
      .map((s) => (isObject(s) ? fromSnapshotObject(s) : null))
      .filter((s): s is Snapshot => s !== null)
    return snapshots.length ? { ok: true, snapshots } : { ok: false, error: 'В файле партии нет персонажей.' }
  }

  const single = fromSnapshotObject(data)
  if (single) return { ok: true, snapshots: [single] }

  if (isActorSource(data)) return { ok: true, snapshots: [fromActorExport(data)] }

  if (typeof actorType === 'string' && actorType !== 'character') {
    return { ok: false, error: 'Это не персонаж игрока (тип актёра не «character»).' }
  }
  return { ok: false, error: 'Неизвестный формат файла: нужен снимок Dnd Hub или Export Data персонажа.' }
}
