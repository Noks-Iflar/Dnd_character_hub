import { describe, expect, it } from 'vitest'
import { defaultRandomDie, parseFormula, roll, type RandomDie } from './dice'

/** Returns the given values in order, one per die. */
function fixedDice(...values: number[]): RandomDie {
  let i = 0
  return () => {
    const v = values[i++]
    if (v === undefined) throw new Error('not enough fixed dice')
    return v
  }
}

describe('parseFormula', () => {
  it('parses dice with a modifier', () => {
    expect(parseFormula('1d20+5')).toEqual([
      { kind: 'dice', sign: 1, count: 1, faces: 20 },
      { kind: 'const', sign: 1, value: 5 },
    ])
  })

  it('accepts spaces, missing count, negative terms and uppercase', () => {
    expect(parseFormula(' D8 - 1 ')).toEqual([
      { kind: 'dice', sign: 1, count: 1, faces: 8 },
      { kind: 'const', sign: -1, value: 1 },
    ])
  })

  it('ignores Foundry flavor tags', () => {
    expect(parseFormula('1d8[piercing] + 3')).toEqual(parseFormula('1d8+3'))
  })

  it('parses keep highest / lowest', () => {
    expect(parseFormula('2d20kh')).toEqual([
      { kind: 'dice', sign: 1, count: 2, faces: 20, keep: { mode: 'highest', count: 1 } },
    ])
    expect(parseFormula('4d6kh3')?.[0]).toMatchObject({ keep: { mode: 'highest', count: 3 } })
    expect(parseFormula('2d20kl')?.[0]).toMatchObject({ keep: { mode: 'lowest', count: 1 } })
  })

  it('rejects unsupported or unsafe formulas', () => {
    for (const bad of ['', 'abc', '1d20+@mod', '1d', 'd', '0d6', '1d0', '1000d6', '2d20kh3', '1d20++5']) {
      expect(parseFormula(bad), bad).toBeNull()
    }
  })
})

describe('roll', () => {
  it('sums dice and constants', () => {
    const r = roll('2d6+3', fixedDice(4, 5))
    expect(r?.total).toBe(12)
    expect(r?.dice).toEqual([
      { faces: 6, value: 4, kept: true },
      { faces: 6, value: 5, kept: true },
    ])
  })

  it('subtracts negative terms', () => {
    expect(roll('1d20-1d4-2', fixedDice(10, 3))?.total).toBe(5)
  })

  it('keeps the highest die for advantage', () => {
    const r = roll('2d20kh+2', fixedDice(7, 15))
    expect(r?.total).toBe(17)
    expect(r?.dice.map((d) => d.kept)).toEqual([false, true])
  })

  it('keeps the lowest die for disadvantage', () => {
    expect(roll('2d20kl', fixedDice(7, 15))?.total).toBe(7)
  })

  it('returns null for an unsupported formula', () => {
    expect(roll('1d20+@prof')).toBeNull()
  })

  it('default random die stays within range', () => {
    for (let i = 0; i < 1000; i++) {
      const v = defaultRandomDie(6)
      expect(v).toBeGreaterThanOrEqual(1)
      expect(v).toBeLessThanOrEqual(6)
    }
  })
})
