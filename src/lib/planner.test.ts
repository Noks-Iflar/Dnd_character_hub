import { describe, expect, it } from 'vitest'
import { addDays, blockSlots, freeIntervals, freeUsers, nextSession, partlyFreeUsers, weekMonday } from './planner'

describe('planner grid', () => {
  it('finds the Monday of the week in the viewer zone', () => {
    // Sunday 2026-12-06 23:30 UTC is already Monday 7th in Moscow
    const ms = Date.UTC(2026, 11, 6, 23, 30)
    expect(weekMonday(ms, 'UTC')).toEqual({ year: 2026, month: 11, day: 30 })
    expect(weekMonday(ms, 'Europe/Moscow')).toEqual({ year: 2026, month: 12, day: 7 })
    expect(addDays({ year: 2026, month: 12, day: 30 }, 3)).toEqual({ year: 2027, month: 1, day: 2 })
  })

  it('maps a local two-hour block to four UTC half-hours', () => {
    const iso = (z: string) => blockSlots({ year: 2026, month: 12, day: 5 }, 18, z).map((s) => new Date(s).toISOString().slice(11, 16))
    expect(iso('Europe/Moscow')).toEqual(['15:00', '15:30', '16:00', '16:30'])
    expect(iso('Asia/Kolkata')).toEqual(['12:30', '13:00', '13:30', '14:00'])
  })

  it('counts people free for the whole block across time zones', () => {
    // Moscow 19:00-21:00 = Berlin 17:00-19:00 (winter) = 16:00-18:00 UTC
    const moscow = blockSlots({ year: 2026, month: 12, day: 5 }, 18, 'Europe/Moscow') // 15:00-17:00 UTC
    const berlinEvening = blockSlots({ year: 2026, month: 12, day: 5 }, 16, 'Europe/Berlin') // 15:00-17:00 UTC
    expect(berlinEvening).toEqual(moscow)
    const availability = new Map([
      ['anya', new Set(moscow)],
      ['dima', new Set(moscow.slice(0, 3))], // leaves 30 minutes early
    ])
    expect(freeUsers(moscow, availability)).toEqual(['anya'])
  })

  it('next session stays current for a few hours after the start', () => {
    const s = (id: string, iso: string) => ({ id, startsAt: Date.parse(iso), note: null })
    const list = [s('a', '2026-12-01T16:00:00Z'), s('b', '2026-12-05T16:00:00Z')]
    expect(nextSession(list, Date.parse('2026-12-01T18:00:00Z'))?.id).toBe('a')
    expect(nextSession(list, Date.parse('2026-12-02T00:00:00Z'))?.id).toBe('b')
    expect(nextSession(list, Date.parse('2026-12-06T00:00:00Z'))).toBe(null)
  })
})

describe('partial availability', () => {
  const H = 3600 * 1000
  const base = Date.UTC(2026, 10, 23, 17)
  const anya = new Set([base, base + H / 2, base + H, base + 1.5 * H]) // 17:00–19:00 UTC
  const availability = new Map([['anya', anya]])

  it('counts people free for part of a block', () => {
    // Tbilisi block 20:00–22:00 = 16:00–18:00 UTC: Anya is free only 17:00–18:00
    const block = [base - H, base - H / 2, base, base + H / 2]
    expect(freeUsers(block, availability)).toEqual([])
    expect(partlyFreeUsers(block, availability)).toEqual(['anya'])
  })

  it('merges slots into intervals', () => {
    const set = new Set([...anya, base + 3 * H])
    expect(freeIntervals(set, base - 10 * H, base + 10 * H)).toEqual([
      [base, base + 2 * H],
      [base + 3 * H, base + 3.5 * H],
    ])
    expect(freeIntervals(set, base + H, base + 2 * H)).toEqual([[base + H, base + 2 * H]])
  })
})

