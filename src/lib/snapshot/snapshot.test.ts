import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseSnapshotJson } from './parse'
import { abilityMod, buildSheet, profBonus, type Sheet } from './sheet'
import type { Snapshot } from './types'

const FIXTURES = join(import.meta.dirname, '..', '..', '..', 'fixtures', 'actors')

function minimalActor(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Тест',
    type: 'character',
    system: {
      abilities: { str: { value: 14, proficient: 1 }, dex: { value: 12, proficient: 0 } },
      skills: { ath: { ability: 'str', value: 1 }, ste: { ability: 'dex', value: 2 } },
      attributes: { hp: { value: 7, max: null } },
      currency: { gp: 5 },
    },
    items: [{ _id: 'c1', name: 'Fighter', type: 'class', system: { levels: 5, hd: { denomination: 'd10' } } }],
    ...overrides,
  }
}

function sheetOf(json: unknown): Sheet {
  const r = parseSnapshotJson(JSON.stringify(json))
  if (!r.ok) throw new Error(r.error)
  return buildSheet(r.snapshots[0] as Snapshot)
}

describe('rules helpers', () => {
  it('ability modifier', () => {
    expect([1, 8, 9, 10, 11, 15, 20].map(abilityMod)).toEqual([-5, -1, -1, 0, 0, 2, 5])
  })
  it('proficiency bonus by level', () => {
    expect([1, 4, 5, 8, 9, 13, 17, 20].map(profBonus)).toEqual([2, 2, 3, 3, 4, 5, 6, 6])
  })
})

describe('parseSnapshotJson', () => {
  it('rejects non-JSON and unknown objects', () => {
    expect(parseSnapshotJson('nope').ok).toBe(false)
    expect(parseSnapshotJson('{"a":1}').ok).toBe(false)
    expect(parseSnapshotJson(JSON.stringify({ ...minimalActor(), type: 'npc' }))).toEqual({
      ok: false,
      error: 'Это не персонаж игрока (тип актёра не «character»).',
    })
  })

  it('accepts a plain Export Data file without computed values', () => {
    const r = parseSnapshotJson(JSON.stringify(minimalActor({ _stats: { coreVersion: '14.370', systemVersion: '6.1.0', exportSource: { uuid: 'Actor.abc' } } })))
    expect(r.ok && r.snapshots[0]?.computed).toBe(null)
    expect(r.ok && r.snapshots[0]?.meta).toEqual({ foundryVersion: '14.370', systemVersion: '6.1.0', actorId: 'abc', exportedAt: null })
  })

  it('accepts a party bundle', () => {
    const snap = { schemaVersion: 1, meta: {}, source: minimalActor(), computed: {}, portrait: null }
    const r = parseSnapshotJson(JSON.stringify({ kind: 'party', snapshots: [snap, snap, { bad: true }] }))
    expect(r.ok && r.snapshots.length).toBe(2)
  })
})

describe('buildSheet', () => {
  it('estimates values from rules when Foundry values are missing', () => {
    const s = sheetOf(minimalActor())
    expect(s.level).toBe(5)
    expect(s.prof).toEqual({ value: 3, from: 'estimate' })
    expect(s.abilities[0]).toMatchObject({ key: 'str', mod: { value: 2 }, save: { value: 5 }, saveProficient: true })
    expect(s.skills.find((k) => k.key === 'ath')?.total.value).toBe(5)
    expect(s.skills.find((k) => k.key === 'ste')?.total.value).toBe(7) // expertise
    expect(s.skills.find((k) => k.key === 'ste')?.passive.value).toBe(17)
    expect(s.ac.value).toBe(null)
    expect(s.hasComputed).toBe(false)
  })

  it('prefers values computed by Foundry', () => {
    const snap = {
      schemaVersion: 1,
      meta: {},
      source: minimalActor(),
      computed: { ac: 17, prof: 3, hp: { value: 40, max: 44 }, abilities: { str: { mod: 2, save: 6 } }, skills: { ath: { total: 9, passive: 19 } }, movement: { walk: 25 } },
      portrait: 'data:image/webp;base64,AAA',
    }
    const s = sheetOf(snap)
    expect(s.ac).toEqual({ value: 17, from: 'foundry' })
    expect(s.hp).toEqual({ value: 40, max: { value: 44, from: 'foundry' }, temp: null })
    expect(s.abilities[0]?.save).toEqual({ value: 6, from: 'foundry' })
    expect(s.skills.find((k) => k.key === 'ath')?.total).toEqual({ value: 9, from: 'foundry' })
    expect(s.speed).toEqual({ value: 25, from: 'foundry' })
    expect(s.portrait).toBe('data:image/webp;base64,AAA')
    expect(s.hasComputed).toBe(true)
  })
})

// Real Foundry 14.370 / dnd5e 6.1.0 exports. fixtures/ is git-ignored, so these skip in CI.
const fixture = (name: string): Sheet => sheetOf(JSON.parse(readFileSync(join(FIXTURES, name), 'utf8')))
const hasFixtures = existsSync(FIXTURES)

describe.skipIf(!hasFixtures)('real exports from fixtures/', () => {
  it('barbarian, level 1', () => {
    const s = fixture('barbarian-name.json')
    expect(s.classes).toEqual([{ name: 'Barbarian', levels: 1, subclass: null }])
    expect([s.race, s.background]).toEqual(['Human', 'Soldier'])
    expect(s.hp.max.value).toBe(15) // d12 + CON 3
    expect(s.speed.value).toBe(30)
    expect(s.abilities.map((a) => a.save.value)).toEqual([5, 2, 5, -1, 0, -1])
    expect(s.skills.find((k) => k.key === 'ath')?.total.value).toBe(5)
    expect(s.inspiration).toBe(true)
  })

  it('bard, level 1', () => {
    const s = fixture('bard-dydyan.json')
    expect(s.background).toBe('Sage')
    expect(s.hp).toMatchObject({ value: 8, max: { value: 10 } })
    expect(s.abilities.find((a) => a.key === 'dex')?.save.value).toBe(7)
    expect(s.skills.find((k) => k.key === 'acr')?.total.value).toBe(7)
    expect(s.inventory.map((i) => i.name)).toContain('Adamantine Chain Mail')
  })

  it('ranger, level 2: hit points and spells', () => {
    const s = fixture('ranger-l2.json')
    expect(s.level).toBe(2)
    expect(s.hp).toMatchObject({ value: 21, max: { value: 21, from: 'estimate' } })
    expect(s.spells.map((sp) => [sp.name, sp.level])).toEqual([["Hunter's Mark", 1], ["Hunter's Mark", 1]])
  })

  it('monk, level 3: subclass, Cyrillic name', () => {
    const s = fixture('monk-l3.json')
    expect(s.name).toBe('гервант из лирии')
    expect(s.classes).toEqual([{ name: 'Monk', levels: 3, subclass: 'Warrior of the Open Hand' }])
    expect(s.hp.max.value).toBe(29)
    expect(s.prof.value).toBe(2)
    expect(s.race).toBe('Dragonborn')
  })
})
