// Sends notifications for app events (called by database triggers) and on schedule (hourly job).
// Deployed with --no-verify-jwt; every call must carry the x-notify-secret header,
// checked against the secret kept in the database Vault (see migration 0011).
import { json, serviceDb, type Db } from '../_shared/db.ts'
import { deliver, loadPeople, type Person } from '../_shared/deliver.ts'
import { dateLabel, digestList, localDate, localHour, pickText, timeLabel } from '../_shared/format.ts'
import { DIGEST_HOUR, planningRound, reminderDue, tenMinuteBucket } from '../_shared/schedule.ts'

type Event =
  | { type: 'session_scheduled' | 'session_moved'; session_id?: string }
  | { type: 'game_started' | 'edits_applied'; character_ids?: string[] }
  | { type: 'snapshot_ready'; snapshot_ids?: string[] }
  | { type: 'availability' }
  | { type: 'tick' }

const ids = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

/** «Сессия назначена» / «перенесена» to every player, with date and time in their own zone. */
async function sessionNews(db: Db, people: Person[], type: 'session_scheduled' | 'session_moved', sessionId: string, now: number) {
  const { data: s } = await db.from('planned_sessions').select('id, starts_at').eq('id', sessionId).maybeSingle()
  const at = s ? Date.parse(s.starts_at as string) : NaN
  if (!s || !(at > now)) return
  for (const p of people.filter((x) => x.role === 'player')) {
    const text = pickText(type, { дата: dateLabel(at, p.timezone), время: timeLabel(at, p.timezone) })
    await deliver(db, p, type, `${type}:${s.id}:${at}:${p.id}`, text, '#/planner')
  }
}

/** One message per player whose characters were touched by one action (the whole party at once). */
async function toOwners(db: Db, people: Person[], kind: 'game_started' | 'snapshot_ready' | 'edits_applied', characterIds: string[], now: number) {
  if (!characterIds.length) return
  const { data } = await db.from('characters').select('id, owner_id, status').in('id', characterIds)
  const byOwner = new Map<string, string>()
  for (const c of data ?? []) {
    if (kind === 'game_started' && c.status !== 'in_game') continue
    if (c.owner_id && !byOwner.has(c.owner_id as string)) byOwner.set(c.owner_id as string, c.id as string)
  }
  for (const [ownerId, characterId] of byOwner) {
    const person = people.find((p) => p.id === ownerId)
    if (person) await deliver(db, person, kind, `${kind}:${ownerId}:${tenMinuteBucket(now)}`, pickText(kind), `#/character/${characterId}`)
  }
}

/** «Все отметили время»: every player who has a character marked some future time, and no session is set yet. */
async function allMarked(db: Db, people: Person[], now: number) {
  const nowIso = new Date(now).toISOString()
  const [chars, sessions] = await Promise.all([db.from('characters').select('owner_id'), db.from('planned_sessions').select('id, starts_at')])
  const list = (sessions.data ?? []).map((s) => ({ id: s.id as string, startsAt: Date.parse(s.starts_at as string) }))
  if (list.some((s) => s.startsAt > now)) return
  const players = [...new Set((chars.data ?? []).map((c) => c.owner_id as string | null))].filter(
    (id): id is string => !!id && people.some((p) => p.id === id && p.role === 'player'),
  )
  if (!players.length) return
  for (const id of players) {
    const { data } = await db.from('availability').select('user_id').eq('user_id', id).gt('slot_start', nowIso).limit(1)
    if (!data?.length) return
  }
  const round = planningRound(list, now)
  for (const gm of people.filter((p) => p.role === 'gm')) {
    await deliver(db, gm, 'all_marked', `all_marked:${round}:${gm.id}`, pickText('all_marked'), '#/planner')
  }
}

/** Hourly: reminders a day and an hour before, and the GM's evening digest of player edits. */
async function tick(db: Db, people: Person[], now: number) {
  const { data: sessions } = await db
    .from('planned_sessions')
    .select('id, starts_at, created_at')
    .gt('starts_at', new Date(now).toISOString())
    .lte('starts_at', new Date(now + 25 * 60 * 60 * 1000).toISOString())
  for (const s of sessions ?? []) {
    const at = Date.parse(s.starts_at as string)
    const due = reminderDue(at, now, Date.parse(s.created_at as string))
    if (!due) continue
    for (const p of people) {
      const text = pickText(p.role === 'gm' ? `${due}_gm` : `${due}_player`, { время: timeLabel(at, p.timezone) })
      await deliver(db, p, due, `${due}:${s.id}:${at}:${p.id}`, text, '#/planner')
    }
  }

  const gms = people.filter((p) => p.role === 'gm')
  for (const gm of gms) {
    if (localHour(now, gm.timezone) !== DIGEST_HOUR) continue
    const { data: last } = await db
      .from('notification_log')
      .select('sent_at')
      .eq('user_id', gm.id)
      .eq('kind', 'edits_digest')
      .eq('ok', true)
      .order('sent_at', { ascending: false })
      .limit(1)
    const since = last?.[0]?.sent_at ?? new Date(now - 24 * 60 * 60 * 1000).toISOString()
    const { data: edits } = await db.from('changes').select('character_id, author_id').gt('created_at', since)
    const counts = new Map<string, number>()
    for (const e of edits ?? []) {
      if (gms.some((g) => g.id === e.author_id)) continue // the GM's own edits are not news to the GM
      counts.set(e.character_id as string, (counts.get(e.character_id as string) ?? 0) + 1)
    }
    if (!counts.size) continue
    const { data: chars } = await db.from('characters').select('id, name').in('id', [...counts.keys()])
    const entries = [...counts]
      .map(([id, count]) => ({ name: (chars ?? []).find((c) => c.id === id)?.name ?? '?', count }))
      .sort((a, b) => b.count - a.count)
    await deliver(db, gm, 'edits_digest', `edits_digest:${gm.id}:${localDate(now, gm.timezone)}`, pickText('edits_digest', { список: digestList(entries) }), '#/gm')
  }

  // in case a trigger call was lost
  await allMarked(db, people, now)
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)
  const db = serviceDb()
  const secret = req.headers.get('x-notify-secret') ?? ''
  const { data: allowed } = await db.rpc('notify_secret_ok', { secret })
  if (allowed !== true) return json({ error: 'forbidden' }, 401)

  const event = (await req.json().catch(() => ({}))) as Event & Record<string, unknown>
  const now = Date.now()
  try {
    const people = await loadPeople(db)
    switch (event.type) {
      case 'session_scheduled':
      case 'session_moved':
        if (typeof event.session_id === 'string') await sessionNews(db, people, event.type, event.session_id, now)
        break
      case 'game_started':
      case 'edits_applied':
        await toOwners(db, people, event.type, ids(event.character_ids), now)
        break
      case 'snapshot_ready': {
        const { data } = await db.from('snapshots').select('character_id').in('id', ids(event.snapshot_ids))
        await toOwners(db, people, 'snapshot_ready', (data ?? []).map((s) => s.character_id as string), now)
        break
      }
      case 'availability':
        await allMarked(db, people, now)
        break
      case 'tick':
        await tick(db, people, now)
        break
      default:
        return json({ error: 'unknown event' }, 400)
    }
    return json({ ok: true })
  } catch (e) {
    // the app never waits for this: log and move on
    console.error('notify failed', { type: event.type, message: e instanceof Error ? e.message : String(e) })
    return json({ ok: false }, 500)
  }
})
