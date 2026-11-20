import { describe, expect, it } from 'vitest'
import { dateLabel, digestList, fill, localDate, localHour, pickText, plural, timeLabel } from './format.ts'
import { EDIT_WORDS, MESSAGES } from './messages.ts'

// Monday 7 December 2026, 16:00 UTC
const at = Date.UTC(2026, 11, 7, 16, 0)

describe('message formatting', () => {
  it('date and time in the recipient time zone', () => {
    expect(dateLabel(at, 'Europe/Berlin')).toBe('пн, 7 декабря')
    expect(timeLabel(at, 'Europe/Berlin')).toBe('17:00')
    expect(timeLabel(at, 'Asia/Tbilisi')).toBe('20:00')
    // already Tuesday in Tokyo
    expect(dateLabel(at, 'Asia/Tokyo')).toBe('вт, 8 декабря')
    expect(timeLabel(at, 'America/New_York')).toBe('11:00')
    expect(localHour(at, 'Asia/Tbilisi')).toBe(20)
    expect(localDate(at, 'Asia/Tokyo')).toBe('2026-12-08')
  })

  it('declines «правка» by number', () => {
    expect([1, 2, 4, 5, 11, 12, 14, 21, 22, 25, 101, 111].map((n) => `${n} ${plural(n, EDIT_WORDS)}`)).toEqual([
      '1 правка', '2 правки', '4 правки', '5 правок', '11 правок', '12 правок', '14 правок',
      '21 правка', '22 правки', '25 правок', '101 правка', '111 правок',
    ])
  })

  it('builds the digest list as in the approved text', () => {
    expect(digestList([{ name: 'Дайдэн', count: 3 }, { name: 'Мерик', count: 1 }])).toBe('Дайдэн — 3 правки, Мерик — 1')
    expect(digestList([{ name: 'Мерик', count: 5 }])).toBe('Мерик — 5 правок')
  })

  it('fills placeholders and picks one of the approved variants', () => {
    expect(fill('Сбор — {дата}, {время} {нет}', { дата: 'сб, 5 декабря', время: '19:00' })).toBe('Сбор — сб, 5 декабря, 19:00 {нет}')
    expect(pickText('session_scheduled', { дата: 'пн, 7 декабря', время: '20:00' }, () => 0)).toBe(
      'Длань созывает своих. Сбор — пн, 7 декабря, 20:00 по твоему времени.',
    )
    expect(pickText('session_scheduled', { дата: 'пн, 7 декабря', время: '20:00' }, () => 0.99)).toContain('Опоздавших Длань не ждёт.')
    expect(pickText('edits_digest', { список: 'Дайдэн — 3 правки, Мерик — 1' })).toBe(
      'Донесение писаря: Дайдэн — 3 правки, Мерик — 1. Чернила ещё не высохли.',
    )
  })

  it('every text is filled completely', () => {
    const values = { дата: 'пн, 7 декабря', время: '20:00', список: 'Мерик — 1 правка' }
    for (const kind of Object.keys(MESSAGES) as (keyof typeof MESSAGES)[]) {
      for (const r of [0, 0.99]) expect(pickText(kind, values, () => r)).not.toMatch(/[{}]/)
    }
  })
})
