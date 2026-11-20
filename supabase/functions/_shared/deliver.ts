// Sends one message to one person at most once, and keeps the send log.
import type { Db } from './db.ts'
import { sendMessage, TelegramError } from './telegram.ts'

export type Pref =
  | 'session_scheduled'
  | 'session_moved'
  | 'game_started'
  | 'snapshot_ready'
  | 'edits_applied'
  | 'edits_digest'
  | 'all_marked'
  | 'remind_24h'
  | 'remind_1h'

export type Person = { id: string; role: 'gm' | 'player'; timezone: string; name: string; chatId: number | null; prefs: Partial<Record<Pref, boolean>> }

/** Everyone with their chat (if connected) and switches. A handful of rows: loaded whole. */
export async function loadPeople(db: Db): Promise<Person[]> {
  const [profiles, links, prefs] = await Promise.all([
    db.from('profiles').select('id, role, timezone, display_name'),
    db.from('telegram_links').select('user_id, chat_id'),
    db.from('notification_prefs').select('*'),
  ])
  if (profiles.error) throw profiles.error
  if (links.error) throw links.error
  if (prefs.error) throw prefs.error
  return (profiles.data ?? []).map((p) => ({
    id: p.id as string,
    role: p.role === 'gm' ? 'gm' : 'player',
    timezone: (p.timezone as string) || 'UTC',
    name: (p.display_name as string) || '',
    chatId: (links.data ?? []).find((l) => l.user_id === p.id)?.chat_id ?? null,
    prefs: ((prefs.data ?? []).find((x) => x.user_id === p.id) ?? {}) as Partial<Record<Pref, boolean>>,
  }))
}

/** Switch on unless the person turned it off (no row = everything on). */
export const wants = (person: Person, pref: Pref): boolean => person.prefs[pref] !== false

export type Outcome = 'sent' | 'skipped' | 'duplicate' | 'failed'

/**
 * Claims `key` in the log first (one copy even if two jobs run at once), then sends.
 * Telegram errors never reach the app: they go to the log; a blocked bot unlinks the person.
 */
export async function deliver(
  db: Db,
  person: Person,
  pref: Pref | 'test',
  key: string,
  text: string,
  route?: string,
): Promise<Outcome> {
  if (person.chatId === null) return 'skipped'
  if (pref !== 'test' && !wants(person, pref)) return 'skipped'
  const claim = await db.from('notification_log').insert({ key, user_id: person.id, kind: pref })
  if (claim.error) {
    if (claim.error.code === '23505') return 'duplicate'
    throw claim.error
  }
  try {
    await sendMessage(person.chatId, text, route)
    await db.from('notification_log').update({ ok: true }).eq('key', key)
    return 'sent'
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    await db.from('notification_log').update({ ok: false, error: message.slice(0, 500) }).eq('key', key)
    if (e instanceof TelegramError && e.gone) await db.from('telegram_links').delete().eq('user_id', person.id)
    console.warn('telegram send failed', { kind: pref, status: e instanceof TelegramError ? e.status : null, message })
    return 'failed'
  }
}
