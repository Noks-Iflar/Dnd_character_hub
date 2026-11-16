// Session planner: week grid in the viewer's time zone, free time stored as 30-minute UTC slots.
import { get, str } from './snapshot/read'
import { supabase } from './supabase'
import { fromWall, toWall } from './timezone'

export const SLOT_MS = 30 * 60 * 1000
/** Two-hour blocks from 08:00 to midnight, in the viewer's local time */
export const BLOCK_HOURS = [8, 10, 12, 14, 16, 18, 20, 22]
export const DAY_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

export type WallDate = { year: number; month: number; day: number }

/** Wall date `n` days after `d` (calendar arithmetic, no time zone involved). */
export function addDays(d: WallDate, n: number): WallDate {
  const t = new Date(Date.UTC(d.year, d.month - 1, d.day + n))
  return { year: t.getUTCFullYear(), month: t.getUTCMonth() + 1, day: t.getUTCDate() }
}

/** Monday of the week that contains instant `ms`, as a wall date in `zone`. */
export function weekMonday(ms: number, zone: string): WallDate {
  const w = toWall(ms, zone)
  const weekday = (new Date(Date.UTC(w.year, w.month - 1, w.day)).getUTCDay() + 6) % 7 // Monday = 0
  return addDays({ year: w.year, month: w.month, day: w.day }, -weekday)
}

/** The four 30-minute UTC slots of a two-hour local block. */
export function blockSlots(date: WallDate, hour: number, zone: string): number[] {
  const start = fromWall({ ...date, hour, minute: 0 }, zone)
  return [0, 1, 2, 3].map((k) => start + k * SLOT_MS)
}

/** Users free for the whole block. */
export function freeUsers(slots: number[], availability: Map<string, Set<number>>): string[] {
  const out: string[] = []
  for (const [user, set] of availability) if (slots.every((s) => set.has(s))) out.push(user)
  return out
}

// ---- database ----

function client() {
  if (!supabase) throw new Error('Приложение не подключено к серверу.')
  return supabase
}

/** Free time of everyone between two instants: user id -> set of slot starts (ms). */
export async function loadAvailability(fromMs: number, toMs: number): Promise<Map<string, Set<number>>> {
  const { data, error } = await client()
    .from('availability')
    .select('user_id, slot_start')
    .gte('slot_start', new Date(fromMs).toISOString())
    .lt('slot_start', new Date(toMs).toISOString())
    .limit(10000)
  if (error) throw new Error(error.message)
  const out = new Map<string, Set<number>>()
  for (const row of data ?? []) {
    const user = str(get(row, 'user_id'))
    const at = Date.parse(str(get(row, 'slot_start')) ?? '')
    if (!user || Number.isNaN(at)) continue
    let set = out.get(user)
    if (!set) out.set(user, (set = new Set()))
    set.add(at)
  }
  return out
}

/** Marks or clears own free time for the given slots. */
export async function setMyAvailability(slots: number[], free: boolean): Promise<void> {
  const iso = slots.map((s) => new Date(s).toISOString())
  if (free) {
    const { error } = await client()
      .from('availability')
      .upsert(
        iso.map((slot_start) => ({ slot_start })),
        { onConflict: 'user_id,slot_start', ignoreDuplicates: true },
      )
    if (error) throw new Error(error.message)
  } else {
    const { error } = await client().from('availability').delete().in('slot_start', iso)
    if (error) throw new Error(error.message)
  }
}

export type PlannedSession = { id: string; startsAt: number; note: string | null }

export async function listPlannedSessions(): Promise<PlannedSession[]> {
  const { data, error } = await client().from('planned_sessions').select('id, starts_at, note').order('starts_at')
  if (error) throw new Error(error.message)
  const out: PlannedSession[] = []
  for (const row of data ?? []) {
    const id = str(get(row, 'id'))
    const startsAt = Date.parse(str(get(row, 'starts_at')) ?? '')
    if (id && !Number.isNaN(startsAt)) out.push({ id, startsAt, note: str(get(row, 'note')) })
  }
  return out
}

export async function addPlannedSession(startsAt: number, note: string | null): Promise<void> {
  const { error } = await client().from('planned_sessions').insert({ starts_at: new Date(startsAt).toISOString(), note })
  if (error) throw new Error(/row-level security/i.test(error.message) ? 'Назначать сессии может только мастер.' : error.message)
}

export async function deletePlannedSession(id: string): Promise<void> {
  const { error } = await client().from('planned_sessions').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

/** Next session after `now` (sessions stay "next" for 4 hours after the start). */
export function nextSession(sessions: PlannedSession[], now = Date.now()): PlannedSession | null {
  return sessions.find((s) => s.startsAt + 4 * 3600 * 1000 > now) ?? null
}

