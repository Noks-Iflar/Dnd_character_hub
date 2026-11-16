import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseSnapshotJson } from './parse'
import { abilityMod, buildSheet, parseSaveLabel, profBonus, type Sheet } from './sheet'
import type { Snapshot } from './types'


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

describe('parseSaveLabel', () => {
  it('reads dnd5e save labels', () => {
    expect(parseSaveLabel('DC 13 Strength')).toEqual({ dc: 13, ability: 'str' })
    expect(parseSaveLabel('DC 15')).toEqual({ dc: 15, ability: null })
    expect(parseSaveLabel(null)).toBe(null)
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
    // Current HP is editable, so it comes from the source (7); the maximum comes from Foundry
    expect(s.hp).toEqual({ value: 7, max: { value: 44, from: 'foundry' }, temp: null })
    expect(s.abilities[0]?.save).toEqual({ value: 6, from: 'foundry' })
    expect(s.skills.find((k) => k.key === 'ath')?.total).toEqual({ value: 9, from: 'foundry' })
    expect(s.speed).toEqual({ value: 25, from: 'foundry' })
    expect(s.portrait).toBe('data:image/webp;base64,AAA')
    expect(s.hasComputed).toBe(true)
  })
})

// Real party snapshot from the macro (Foundry 14.370, dnd5e 6.1.0, Russian translation).
// fixtures/ is git-ignored, so these tests skip in CI.
const PARTY = join(import.meta.dirname, '..', '..', '..', 'fixtures', 'snapshots', 'party.json')

describe.skipIf(!existsSync(PARTY))('real party snapshot from the macro', () => {
  const load = () => {
    const r = parseSnapshotJson(readFileSync(PARTY, 'utf8'))
    if (!r.ok) throw new Error(r.error)
    return r.snapshots.map((s) => buildSheet(s))
  }
  const byName = (name: string) => {
    const s = load().find((x) => x.name === name)
    if (!s) throw new Error(`no ${name}`)
    return s
  }

  it('contains the three current characters with Foundry values and portraits', () => {
    const sheets = load()
    expect(sheets.map((s) => s.name)).toEqual(['Дайдэн', 'Мерик', 'Муарен Заррок'])
    expect(sheets.every((s) => s.hasComputed && s.portrait?.startsWith('data:image/'))).toBe(true)
  })

  it('bard: level, AC, HP, spellcasting, slots and spells', () => {
    const s = byName('Дайдэн')
    expect(s.level).toBe(8)
    expect(s.ac).toEqual({ value: 16, from: 'foundry' })
    expect(s.hp).toMatchObject({ value: 59, max: { value: 59, from: 'foundry' } })
    expect(s.spellcasting).toEqual({ dc: 15, attack: 7, ability: 'cha' })
    expect(s.resources.filter((r) => r.kind === 'slot').map((r) => [r.id, r.value, r.max])).toEqual([
      ['spell1', 2, 4],
      ['spell2', 3, 3],
      ['spell3', 1, 3],
      ['spell4', 2, 2],
    ])
    expect(s.spells).toHaveLength(16)
    expect(s.resources.find((r) => r.name.startsWith('Бардовское вдохновение'))).toMatchObject({ value: 3, max: 4, stores: 'spent' })
  })

  it('fighter: attacks, saves and class resources', () => {
    const s = byName('Мерик')
    expect(s.abilities.find((a) => a.key === 'str')).toMatchObject({ mod: { value: 5 }, save: { value: 9 }, saveProficient: true })
    expect(s.attacks.find((a) => a.name.startsWith('Длинный меч'))).toMatchObject({ toHit: 10, damages: [{ formula: '1d8 + 8' }] })
    expect(s.resources.find((r) => r.name.startsWith('Второе дыхание'))).toMatchObject({ value: 3, max: 3 })
    expect(s.spellcasting).toBe(null)
  })

  it('rogue: speed from Foundry and a weapon with two damage parts', () => {
    const s = byName('Муарен Заррок')
    expect(s.speed).toEqual({ value: 35, from: 'foundry' })
    expect(s.attacks.find((a) => a.name === 'Теневой клинок')?.damages.map((d) => d.formula)).toEqual(['1d6 + 1', '1d6'])
  })
})
