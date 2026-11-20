// When reminders and the GM's digest are due. Pure: tested with Vitest from the app.
// The hourly job may run a few minutes late; the send log keeps every message to one copy.

const HOUR = 60 * 60 * 1000

/** Local hour (in the GM's time zone) when the daily digest of player edits goes out. */
export const DIGEST_HOUR = 20

export type Reminder = 'remind_24h' | 'remind_1h'

/**
 * Which reminder is due for a session at `startsAt`, checked by an hourly job at `now`:
 * «за 24 часа» between 22 and 24 hours before (skipped if the session was set less than a day ahead —
 * then «Сессия назначена» came just now), «за 1 час» within the last 65 minutes.
 */
export function reminderDue(startsAt: number, now: number, createdAt: number): Reminder | null {
  const left = startsAt - now
  if (left <= 0) return null
  if (left <= 65 * 60 * 1000) return 'remind_1h'
  if (left > 22 * HOUR && left <= 24 * HOUR && startsAt - createdAt > 24 * HOUR) return 'remind_24h'
  return null
}

/**
 * The planning round: everything between the last session that already began and the next one.
 * «Все отметили время» is sent once per round.
 */
export function planningRound(sessions: { id: string; startsAt: number }[], now: number): string {
  const past = sessions.filter((s) => s.startsAt <= now).sort((a, b) => b.startsAt - a.startsAt)[0]
  return past ? past.id : 'first'
}

/** Groups many events of one action (the GM starts the game for the whole party) into one message per person. */
export const tenMinuteBucket = (now: number): number => Math.floor(now / (10 * 60 * 1000))
