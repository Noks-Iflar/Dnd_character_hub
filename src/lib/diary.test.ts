import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseDiaryImport } from './diary'

describe('parseDiaryImport', () => {
  it('reads lore, sessions and player entries', () => {
    const r = parseDiaryImport(
      JSON.stringify({
        kind: 'dndhub-diary',
        lore: [{ title: 'География', body: 'Арс', entries: [{ character: 'Мерик', kind: 'lore', body: 'догадка' }] }],
        sessions: [{ number: 1, summary: 'Муртаг', highlights: ['Улики', ' ', 'Шев Цов'], entries: [{ character: 'Дайдэн', body: 'травма гнома' }] }],
      }),
    )
    expect(r).toEqual({
      ok: true,
      data: {
        lore: [{ title: 'География', body: 'Арс', sort: 0, gmOnly: false, entries: [{ kind: 'lore', body: 'догадка', characterName: 'Мерик' }] }],
        sessions: [
          { number: 1, title: null, summary: 'Муртаг', highlights: 'Улики\nШев Цов', entries: [{ kind: 'memory', body: 'травма гнома', characterName: 'Дайдэн' }] },
        ],
      },
    })
  })

  it('rejects other files, duplicate session numbers and empty imports', () => {
    expect(parseDiaryImport('nope').ok).toBe(false)
    expect(parseDiaryImport('{"kind":"other"}').ok).toBe(false)
    expect(parseDiaryImport(JSON.stringify({ kind: 'dndhub-diary', sessions: [{ number: 1 }, { number: 1 }] }))).toEqual({
      ok: false,
      error: 'В файле повторяются номера сессий.',
    })
    expect(parseDiaryImport(JSON.stringify({ kind: 'dndhub-diary' })).ok).toBe(false)
  })

  it('drops empty entries', () => {
    const r = parseDiaryImport(JSON.stringify({ kind: 'dndhub-diary', sessions: [{ number: 2, entries: [{ character: 'Муарен', body: '  ' }] }] }))
    expect(r.ok && r.data.sessions[0]?.entries).toEqual([])
  })
})

const IMPORT = join(import.meta.dirname, '..', '..', 'fixtures', 'diary', 'diary-import.json')

describe.skipIf(!existsSync(IMPORT))('real diary import file from fixtures/', () => {
  it('has the five lore sections and five sessions with player entries', () => {
    const r = parseDiaryImport(readFileSync(IMPORT, 'utf8'))
    if (!r.ok) throw new Error(r.error)
    expect(r.data.lore.map((p) => p.title)).toEqual([
      'География мира (5 материков)',
      'Краткая история',
      'Расы',
      'Государства и фракции',
      'Отряд героев и раскрытые тайны мира',
    ])
    expect(r.data.sessions.map((s) => s.number)).toEqual([1, 2, 3, 4, 5])
    expect(r.data.sessions.flatMap((s) => s.entries.map((e) => e.characterName))).toEqual(['Дайдэн', 'Мерик', 'Мерик', 'Мерик', 'Дайдэн', 'Мерик'])
    expect(JSON.stringify(r.data)).not.toContain('Салам')
  })
})
