// Time zone arithmetic with the built-in Intl API (no libraries).
// Wall time = what a clock in a given IANA zone shows.

export type Wall = { year: number; month: number; day: number; hour: number; minute: number }

const formatters = new Map<string, Intl.DateTimeFormat>()

function formatter(zone: string): Intl.DateTimeFormat {
  let f = formatters.get(zone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
    })
    formatters.set(zone, f)
  }
  return f
}

/** Wall time in `zone` at the UTC instant `ms`. */
export function toWall(ms: number, zone: string): Wall {
  const parts: Record<string, number> = {}
  for (const p of formatter(zone).formatToParts(new Date(ms))) if (p.type !== 'literal') parts[p.type] = Number(p.value)
  return { year: parts.year ?? 0, month: parts.month ?? 1, day: parts.day ?? 1, hour: parts.hour ?? 0, minute: parts.minute ?? 0 }
}

/** Offset of `zone` from UTC at instant `ms`, in minutes (Moscow: +180). */
export function offsetMinutes(ms: number, zone: string): number {
  const w = toWall(ms, zone)
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute)
  return Math.round((asUtc - Math.floor(ms / 60000) * 60000) / 60000)
}

/** UTC instant of a wall time in `zone`. Times that do not exist (DST gap) move forward. */
export function fromWall(w: Wall, zone: string): number {
  const guess = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute)
  let ms = guess - offsetMinutes(guess, zone) * 60000
  // Second pass: the offset may differ at the real instant (around DST changes)
  ms = guess - offsetMinutes(ms, zone) * 60000
  return ms
}

export function isValidZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone })
    return true
  } catch {
    return false
  }
}

export function deviceZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}

/** All IANA zones the browser knows, with UTC first. */
export function allZones(): string[] {
  const list = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : []
  return ['UTC', ...list.filter((z) => z !== 'UTC')]
}

/** "UTC+3", "UTC−5", "UTC+5:30" */
export function offsetLabel(ms: number, zone: string): string {
  const m = offsetMinutes(ms, zone)
  if (m === 0) return 'UTC'
  const sign = m > 0 ? '+' : '−'
  const h = Math.floor(Math.abs(m) / 60)
  const rest = Math.abs(m) % 60
  return `UTC${sign}${h}${rest ? `:${String(rest).padStart(2, '0')}` : ''}`
}

/** Date and time of an instant for a person in `zone`, e.g. "сб, 5 декабря, 19:00". */
export function formatInZone(ms: number, zone: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('ru-RU', { timeZone: zone, ...options }).format(new Date(ms))
}
