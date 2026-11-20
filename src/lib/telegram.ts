// Personal Telegram notifications from the app side: link status, switches,
// and the telegram-link Edge Function (connect, test message, bot setup by the GM).
import { supabase } from './supabase'

export type NotifyPref =
  | 'session_scheduled'
  | 'session_moved'
  | 'game_started'
  | 'snapshot_ready'
  | 'edits_applied'
  | 'edits_digest'
  | 'all_marked'
  | 'remind_24h'
  | 'remind_1h'

/** Switches each role sees, in this order. The GM's digest goes out at 20:00 in the GM's zone. */
export const PREFS_FOR: Record<'gm' | 'player', { key: NotifyPref; label: string }[]> = {
  player: [
    { key: 'session_scheduled', label: 'Сессия назначена' },
    { key: 'session_moved', label: 'Сессия перенесена' },
    { key: 'remind_24h', label: 'За сутки до сбора' },
    { key: 'remind_1h', label: 'За час до сбора' },
    { key: 'game_started', label: 'Мастер начал игру' },
    { key: 'snapshot_ready', label: 'Новый снимок после сессии' },
    { key: 'edits_applied', label: 'Мастер применил мои правки' },
  ],
  gm: [
    { key: 'edits_digest', label: 'Сводка правок игроков (раз в день, в 20:00)' },
    { key: 'all_marked', label: 'Все отметили время в планировщике' },
    { key: 'remind_24h', label: 'За сутки до сбора' },
    { key: 'remind_1h', label: 'За час до сбора' },
  ],
}

export type Prefs = Record<NotifyPref, boolean>

const ALL_ON: Prefs = {
  session_scheduled: true,
  session_moved: true,
  game_started: true,
  snapshot_ready: true,
  edits_applied: true,
  edits_digest: true,
  all_marked: true,
  remind_24h: true,
  remind_1h: true,
}

function client() {
  if (!supabase) throw new Error('Приложение не подключено к серверу.')
  return supabase
}

/** When the person connected Telegram, or null. The chat id itself is never readable from the app. */
export async function linkedAt(userId: string): Promise<string | null> {
  const { data, error } = await client().from('telegram_links').select('user_id, linked_at').eq('user_id', userId).maybeSingle()
  if (error) throw new Error(error.message)
  return typeof data?.linked_at === 'string' ? data.linked_at : null
}

/** No row yet = everything on. */
export async function loadPrefs(userId: string): Promise<Prefs> {
  const { data, error } = await client().from('notification_prefs').select('*').eq('user_id', userId).maybeSingle()
  if (error) throw new Error(error.message)
  const out = { ...ALL_ON }
  for (const key of Object.keys(ALL_ON) as NotifyPref[]) if (data && typeof data[key] === 'boolean') out[key] = data[key] as boolean
  return out
}

export async function savePref(userId: string, key: NotifyPref, on: boolean): Promise<void> {
  const { error } = await client()
    .from('notification_prefs')
    .upsert({ user_id: userId, [key]: on, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
  if (error) throw new Error(error.message)
}

export async function unlinkTelegram(userId: string): Promise<void> {
  const { error } = await client().from('telegram_links').delete().eq('user_id', userId)
  if (error) throw new Error(error.message)
}

/** Calls the telegram-link function; its error text is already in Russian. */
async function linkFunction(action: 'link' | 'test' | 'setup'): Promise<Record<string, unknown>> {
  const { data, error } = await client().functions.invoke<Record<string, unknown>>('telegram-link', { body: { action } })
  if (error) {
    const context: unknown = (error as { context?: unknown }).context
    const body = context instanceof Response ? ((await context.json().catch(() => null)) as { error?: unknown } | null) : null
    throw new Error(typeof body?.error === 'string' ? body.error : 'Сервер уведомлений не ответил. Возможно, функции ещё не развёрнуты.')
  }
  return data ?? {}
}

/** One-time link to the bot: https://t.me/<bot>?start=<code>, valid 10 minutes. */
export async function startLink(): Promise<string> {
  const data = await linkFunction('link')
  if (typeof data.url !== 'string') throw new Error('Сервер не вернул ссылку на бота.')
  return data.url
}

export const sendTest = (): Promise<unknown> => linkFunction('test')

/** The GM, once: points the bot at the server (setWebhook) and sets its commands. */
export const setupBot = (): Promise<unknown> => linkFunction('setup')
