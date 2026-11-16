import { describe, expect, it } from 'vitest'
import { fromWall, offsetLabel, offsetMinutes, toWall } from './timezone'

describe('time zones', () => {
  it('knows fixed offsets', () => {
    const ms = Date.UTC(2026, 11, 5, 16, 0)
    expect(offsetMinutes(ms, 'Europe/Moscow')).toBe(180)
    expect(offsetMinutes(ms, 'Asia/Kolkata')).toBe(330)
    expect(offsetLabel(ms, 'Asia/Kolkata')).toBe('UTC+5:30')
    expect(offsetLabel(ms, 'America/New_York')).toBe('UTC−5')
    expect(offsetLabel(ms, 'UTC')).toBe('UTC')
  })

  it('converts wall time to UTC and back', () => {
    const w = { year: 2026, month: 12, day: 5, hour: 19, minute: 0 }
    expect(new Date(fromWall(w, 'Europe/Moscow')).toISOString()).toBe('2026-12-05T16:00:00.000Z')
    expect(new Date(fromWall(w, 'Asia/Kolkata')).toISOString()).toBe('2026-12-05T13:30:00.000Z')
    expect(toWall(fromWall(w, 'America/New_York'), 'America/New_York')).toEqual(w)
  })

  it('handles daylight saving time in Berlin', () => {
    // Summer: UTC+2, winter: UTC+1
    expect(new Date(fromWall({ year: 2026, month: 7, day: 1, hour: 12, minute: 0 }, 'Europe/Berlin')).toISOString()).toBe('2026-07-01T10:00:00.000Z')
    expect(new Date(fromWall({ year: 2026, month: 1, day: 1, hour: 12, minute: 0 }, 'Europe/Berlin')).toISOString()).toBe('2026-01-01T11:00:00.000Z')
    // 2026-03-29 02:30 does not exist in Berlin: moves to a real instant nearby
    const gap = fromWall({ year: 2026, month: 3, day: 29, hour: 2, minute: 30 }, 'Europe/Berlin')
    expect([new Date(gap).toISOString()]).toEqual(expect.arrayContaining([expect.stringMatching(/^2026-03-29T0[01]:30:00/)]))
  })
})
