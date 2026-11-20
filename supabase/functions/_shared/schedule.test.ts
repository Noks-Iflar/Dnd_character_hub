import { describe, expect, it } from 'vitest'
import { planningRound, reminderDue, tenMinuteBucket } from './schedule.ts'

const H = 60 * 60 * 1000
const start = Date.UTC(2026, 11, 7, 16, 0)
const longAgo = start - 7 * 24 * H

describe('reminders', () => {
  it('an hourly job hits each reminder in its window', () => {
    // the job runs at :05 every hour
    const due = []
    for (let t = start - 30 * H + 5 * 60 * 1000; t < start + H; t += H) {
      const r = reminderDue(start, t, longAgo)
      if (r) due.push([r, (start - t) / H])
    }
    expect(due.map(([r]) => r)).toEqual(['remind_24h', 'remind_24h', 'remind_1h'])
    // both 24h hits are the same reminder: the send log keeps one
  })

  it('no «сутки» reminder for a session set less than a day ahead, none after the start', () => {
    expect(reminderDue(start, start - 23 * H, start - 23.5 * H)).toBe(null)
    expect(reminderDue(start, start - 30 * 60 * 1000, start - 23.5 * H)).toBe('remind_1h')
    expect(reminderDue(start, start + 60 * 1000, longAgo)).toBe(null)
  })

  it('a planning round lasts from the last session that began to the next one', () => {
    const sessions = [
      { id: 'a', startsAt: start - 30 * 24 * H },
      { id: 'b', startsAt: start },
    ]
    expect(planningRound([], start)).toBe('first')
    expect(planningRound(sessions, start - H)).toBe('a')
    expect(planningRound(sessions, start + H)).toBe('b')
    expect(tenMinuteBucket(start + 9 * 60 * 1000)).toBe(tenMinuteBucket(start))
  })
})
