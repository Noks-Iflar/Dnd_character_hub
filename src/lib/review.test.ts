import { describe, expect, it } from 'vitest'
import { countDecisions, decisionOf, reviewLines, rowIds } from './review'
import type { Change } from './snapshot/changes'

const hp = 'system.attributes.hp.value'
type Row = Change & { characterId: string }
const c = (o: Partial<Row> & Pick<Row, 'id' | 'createdAt'>): Row => ({
  characterId: 'c1',
  path: hp,
  oldValue: null,
  newValue: 1,
  appliedAt: null,
  kind: 'set',
  review: null,
  ...o,
})

describe('review lines', () => {
  it('one line per field and character, one per added item; values from first and last edit', () => {
    const lines = reviewLines(
      [
        c({ id: '2', createdAt: '2026-11-16T11:00:00Z', oldValue: 40, newValue: 52 }),
        c({ id: '1', createdAt: '2026-11-16T10:00:00Z', oldValue: 59, newValue: 40 }),
        c({ id: '3', createdAt: '2026-11-16T10:30:00Z', characterId: 'c2', oldValue: 10, newValue: 8 }),
        c({ id: '4', createdAt: '2026-11-16T12:00:00Z', kind: 'add_item', path: 'add-item', itemName: 'Зелье' }),
        c({ id: '5', createdAt: '2026-11-16T12:05:00Z', kind: 'add_item', path: 'add-item', itemName: 'Зелье' }),
      ],
      (x) => x.characterId,
    )
    expect(lines.map((l) => [l.rows.map((r) => r.id), l.oldValue, l.newValue, l.kind])).toEqual([
      [['1', '2'], 59, 52, 'set'],
      [['3'], 10, 8, 'set'],
      [['4'], null, 1, 'add_item'],
      [['5'], null, 1, 'add_item'],
    ])
    expect(rowIds(lines.slice(0, 2))).toEqual(['1', '2', '3'])
  })

  it('a line is decided only when every edit in it has the same decision', () => {
    expect(decisionOf([{ review: 'accepted' }, { review: 'accepted' }])).toBe('accepted')
    expect(decisionOf([{ review: 'rejected' }])).toBe('rejected')
    // a new edit after the decision: the final value changed, decide again
    expect(decisionOf([{ review: 'accepted' }, { review: null }])).toBe('undecided')
    expect(decisionOf([{ review: 'accepted' }, { review: 'rejected' }])).toBe('undecided')
    expect(decisionOf([{}])).toBe('undecided')
    const lines = reviewLines([
      c({ id: 'a', createdAt: '1', review: 'accepted' }),
      c({ id: 'b', createdAt: '2', path: 'system.currency.gp', review: 'rejected' }),
      c({ id: 'd', createdAt: '3', path: 'system.currency.sp' }),
    ])
    expect(countDecisions(lines)).toEqual({ undecided: 1, accepted: 1, rejected: 1 })
  })
})
