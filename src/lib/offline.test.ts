// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Character } from './db'
import { clearOffline, loadOffline, offlineSnapshot, onlineOr, saveCharacters, saveProfile, saveSnapshot } from './offline'

const character = (id: string): Character => ({
  id,
  name: id,
  ownerId: 'u1',
  foundryActorId: `a-${id}`,
  status: 'between_sessions',
  lastSnapshotAt: null,
})

beforeEach(() => localStorage.clear())

describe('offline copy', () => {
  it('stores profile, characters and snapshots of one user', () => {
    saveProfile({ id: 'u1', display_name: 'anya', role: 'player', timezone: 'UTC' })
    saveCharacters('u1', [character('c1')])
    saveSnapshot('u1', 'c1', { hello: 1 }, '2026-11-15T10:00:00Z')
    const data = loadOffline()
    expect(data?.userId).toBe('u1')
    expect(data?.profile?.display_name).toBe('anya')
    expect(data?.characters.map((c) => c.id)).toEqual(['c1'])
    expect(offlineSnapshot('c1')).toMatchObject({ data: { hello: 1 }, createdAt: '2026-11-15T10:00:00Z' })
  })

  it('replaces the copy when another user signs in on the device', () => {
    saveSnapshot('u1', 'c1', {}, '2026-11-15T10:00:00Z')
    saveCharacters('u2', [character('c2')])
    expect(loadOffline()?.userId).toBe('u2')
    expect(offlineSnapshot('c1')).toBe(null)
  })

  it('forgets snapshots of characters the user no longer has', () => {
    saveSnapshot('u1', 'c1', {}, '2026-11-15T10:00:00Z')
    saveSnapshot('u1', 'c2', {}, '2026-11-15T10:00:00Z')
    saveCharacters('u1', [character('c2')])
    expect(offlineSnapshot('c1')).toBe(null)
    expect(offlineSnapshot('c2')).not.toBe(null)
  })

  it('is cleared on sign out and survives broken storage data', () => {
    saveCharacters('u1', [character('c1')])
    clearOffline()
    expect(loadOffline()).toBe(null)
    localStorage.setItem('dndhub.offline.v1', '{not json')
    expect(loadOffline()).toBe(null)
  })
})

describe('onlineOr', () => {
  afterEach(() => vi.restoreAllMocks())

  it('returns the server answer when it comes in time', async () => {
    await expect(onlineOr(() => Promise.resolve(42))).resolves.toBe(42)
  })

  it('fails at once when the device is offline, without calling the server', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const request = vi.fn(() => Promise.resolve(1))
    await expect(onlineOr(request)).rejects.toThrow('Нет сети.')
    expect(request).not.toHaveBeenCalled()
  })

  it('gives up when the server is silent', async () => {
    await expect(onlineOr(() => new Promise(() => {}), 20)).rejects.toThrow('Сервер не отвечает.')
  })
})
