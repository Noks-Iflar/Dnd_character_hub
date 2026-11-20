// Pure helpers for message texts: no network, no Deno APIs (tested with Vitest from the app).
import { EDIT_WORDS, MESSAGES, type MessageKind } from './messages.ts'

/** «пн, 7 декабря» in the given IANA time zone. */
export function dateLabel(ms: number, zone: string): string {
  return new Intl.DateTimeFormat('ru-RU', { timeZone: zone, weekday: 'short', day: 'numeric', month: 'long' }).format(ms)
}

/** «19:00» in the given IANA time zone. */
export function timeLabel(ms: number, zone: string): string {
  return new Intl.DateTimeFormat('ru-RU', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ms)
}

/** Hour of the day (0–23) in the given time zone. */
export function localHour(ms: number, zone: string): number {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', hourCycle: 'h23' }).format(ms))
}

/** Calendar date «2026-12-07» in the given time zone. */
export function localDate(ms: number, zone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms)
}

/** Russian plural: 1 правка, 2 правки, 5 правок, 21 правка, 11 правок. */
export function plural(n: number, [one, few, many]: [string, string, string]): string {
  const ten = n % 10
  const hundred = n % 100
  if (ten === 1 && hundred !== 11) return one
  if (ten >= 2 && ten <= 4 && (hundred < 12 || hundred > 14)) return few
  return many
}

/** «Дайдэн — 3 правки, Мерик — 1»: the word only after the first number, as in the approved text. */
export function digestList(entries: { name: string; count: number }[]): string {
  return entries.map((e, i) => (i === 0 ? `${e.name} — ${e.count} ${plural(e.count, EDIT_WORDS)}` : `${e.name} — ${e.count}`)).join(', ')
}

/** Puts values into {placeholders}; unknown placeholders stay as they are. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{([^{}]+)\}/g, (whole, key: string) => (key in values ? String(values[key]) : whole))
}

/** One of the variants of a message, at random. */
export function pickText(kind: MessageKind, values: Record<string, string | number> = {}, random: () => number = Math.random): string {
  const variants: readonly string[] = MESSAGES[kind]
  const template = variants[Math.min(variants.length - 1, Math.floor(random() * variants.length))] ?? ''
  return fill(template, values)
}
