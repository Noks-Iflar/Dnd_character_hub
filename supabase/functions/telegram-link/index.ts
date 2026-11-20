// Buttons from the app's settings: connect Telegram, send a test message,
// and (the GM, once) point the bot at our webhook. Needs a signed-in user (JWT is verified).
import { CORS, functionsUrl, json, serviceDb } from '../_shared/db.ts'
import { deliver, loadPeople } from '../_shared/deliver.ts'
import { pickText } from '../_shared/format.ts'
import { setCommands, setWebhook } from '../_shared/telegram.ts'

/** 32 random URL-safe characters: what t.me allows in ?start= */
function randomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const db = serviceDb()
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data } = await db.auth.getUser(jwt)
  const user = data.user
  if (!user) return json({ error: 'Нужно войти в Dnd Hub.' }, 401)
  const body = (await req.json().catch(() => ({}))) as { action?: string }

  try {
    if (body.action === 'link') {
      const bot = Deno.env.get('TELEGRAM_BOT_USERNAME')?.replace(/^@/, '')
      if (!bot) return json({ error: 'Бот ещё не настроен: мастер не задал TELEGRAM_BOT_USERNAME.' }, 500)
      const code = randomCode()
      // one live code per person
      await db.from('telegram_link_codes').delete().eq('user_id', user.id)
      const saved = await db.from('telegram_link_codes').insert({ code, user_id: user.id })
      if (saved.error) throw saved.error
      return json({ url: `https://t.me/${bot}?start=${code}` })
    }

    if (body.action === 'test') {
      const person = (await loadPeople(db)).find((p) => p.id === user.id)
      if (!person?.chatId) return json({ error: 'Telegram ещё не подключён.' }, 400)
      const outcome = await deliver(db, person, 'test', `test:${user.id}:${Date.now()}`, pickText('test'), '#/settings')
      return outcome === 'sent' ? json({ ok: true }) : json({ error: 'Telegram не принял сообщение. Если бот заблокирован, подключи его снова.' }, 502)
    }

    if (body.action === 'setup') {
      const { data: profile } = await db.from('profiles').select('role').eq('id', user.id).maybeSingle()
      if (profile?.role !== 'gm') return json({ error: 'Это делает мастер.' }, 403)
      await setWebhook(functionsUrl())
      await setCommands()
      return json({ ok: true })
    }

    return json({ error: 'Неизвестное действие.' }, 400)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('telegram-link failed', { action: body.action, message })
    return json({ error: `Не получилось: ${message}` }, 500)
  }
})
