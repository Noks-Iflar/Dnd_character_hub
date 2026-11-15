// Offline copy of the signed-in user's data, kept in this browser only.
// One user at a time; cleared on sign out. Never required for the app to work.
import type { Character } from './db'
import type { Profile } from './profile'
import { isObject, str } from './snapshot/read'

const KEY = 'dndhub.offline.v1'

type SavedSnapshot = { data: unknown; createdAt: string; savedAt: string }

export type OfflineData = {
  userId: string
  profile: Profile | null
  characters: Character[]
  snapshots: Record<string, SavedSnapshot>
}

function read(): OfflineData | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const data: unknown = JSON.parse(raw)
    if (!isObject(data) || typeof data.userId !== 'string' || !Array.isArray(data.characters) || !isObject(data.snapshots)) {
      return null
    }
    return data as OfflineData
  } catch {
    return null
  }
}

function write(data: OfflineData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data))
  } catch {
    // Storage full or blocked (private mode): offline copy is optional.
  }
}

/** Data for this user, or a fresh empty record if another user was cached. */
function forUser(userId: string): OfflineData {
  const current = read()
  return current && current.userId === userId ? current : { userId, profile: null, characters: [], snapshots: {} }
}

export function loadOffline(): OfflineData | null {
  return read()
}

export function saveProfile(profile: Profile): void {
  write({ ...forUser(profile.id), profile })
}

export function saveCharacters(userId: string, characters: Character[]): void {
  const data = forUser(userId)
  // Forget snapshots of characters the user no longer has
  const keep = new Set(characters.map((c) => c.id))
  const snapshots = Object.fromEntries(Object.entries(data.snapshots).filter(([id]) => keep.has(id)))
  write({ ...data, characters, snapshots })
}

export function saveSnapshot(userId: string, characterId: string, data: unknown, createdAt: string): void {
  const current = forUser(userId)
  write({ ...current, snapshots: { ...current.snapshots, [characterId]: { data, createdAt, savedAt: new Date().toISOString() } } })
}

export function offlineSnapshot(characterId: string): SavedSnapshot | null {
  const s = read()?.snapshots[characterId]
  return s && str(s.createdAt) !== null ? s : null
}

export function clearOffline(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // ignore
  }
}

/** True when the browser reports no network connection. */
export function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

/**
 * Runs a server request, but fails fast when the device is offline and gives up
 * after `ms` (the Supabase client retries for a while before failing on its own).
 */
export function onlineOr<T>(request: () => PromiseLike<T>, ms = 6000): Promise<T> {
  if (isOffline()) return Promise.reject(new Error('Нет сети.'))
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Сервер не отвечает.')), ms)
    Promise.resolve(request()).then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error instanceof Error ? error : new Error(String(error)))
      },
    )
  })
}
