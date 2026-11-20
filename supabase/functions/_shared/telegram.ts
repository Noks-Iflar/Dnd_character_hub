// Telegram Bot API calls. The token comes only from the Edge Function secret TELEGRAM_BOT_TOKEN.
import { OPEN_BUTTON } from './messages.ts'

export class TelegramError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
  /** The person blocked the bot or deleted the chat: the link is dead. */
  get gone(): boolean {
    return this.status === 403 || (this.status === 400 && /chat not found/i.test(this.message))
  }
}

export function botToken(): string {
  const token = Deno.env.get('TELEGRAM_BOT_TOKEN')
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not set in Edge Function secrets')
  return token
}

async function call(method: string, payload: Record<string, unknown>): Promise<unknown> {
  // TELEGRAM_API_URL only for local tests against a fake Telegram
  const api = Deno.env.get('TELEGRAM_API_URL') ?? 'https://api.telegram.org'
  const res = await fetch(`${api}/bot${botToken()}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string; result?: unknown }
  // never echo the URL: it holds the token
  if (!res.ok || !data.ok) throw new TelegramError(res.status, data.description ?? `HTTP ${res.status}`)
  return data.result
}

/** Address of the app; the button under each message opens `appUrl() + route` (e.g. "#/planner"). */
export function appUrl(): string {
  return Deno.env.get('APP_URL') ?? 'https://noks-iflar.github.io/Dnd_character_hub/'
}

export function sendMessage(chatId: number, text: string, route?: string): Promise<unknown> {
  return call('sendMessage', {
    chat_id: chatId,
    text,
    reply_markup: { inline_keyboard: [[{ text: OPEN_BUTTON, url: appUrl() + (route ?? '') }]] },
  })
}

/** The webhook secret is derived from the bot token: one secret less to keep, and it changes with the token. */
export async function webhookSecret(): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`dndhub-webhook:${botToken()}`))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Points Telegram at our telegram-webhook function, with the secret header it must send back. */
export async function setWebhook(functionsUrl: string): Promise<unknown> {
  return call('setWebhook', {
    url: `${functionsUrl}/telegram-webhook`,
    secret_token: await webhookSecret(),
    allowed_updates: ['message'],
    drop_pending_updates: true,
  })
}

export function setCommands(): Promise<unknown> {
  return call('setMyCommands', {
    commands: [
      { command: 'start', description: 'Позвать ворона' },
      { command: 'stop', description: 'Отпустить ворона' },
    ],
  })
}

/** Compares secrets without leaking their length or content through timing. */
export function sameSecret(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a)
  const y = new TextEncoder().encode(b)
  let diff = x.length ^ y.length
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0)
  return diff === 0
}
