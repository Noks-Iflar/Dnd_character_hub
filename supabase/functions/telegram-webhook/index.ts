// Telegram calls this for every message to the bot. Deployed with --no-verify-jwt:
// instead of a Supabase login, every request must carry the secret header set in setWebhook.
import { serviceDb } from '../_shared/db.ts'
import { pickText } from '../_shared/format.ts'
import { HINT_BAD_CODE, HINT_START } from '../_shared/messages.ts'
import { sameSecret, sendMessage, webhookSecret } from '../_shared/telegram.ts'

const CODE = /^[A-Za-z0-9_-]{16,64}$/

// Always answer 200 to Telegram: otherwise it repeats the same update again and again
const done = () => new Response('ok')

Deno.serve(async (req) => {
  if (req.method !== 'POST') return done()
  if (!sameSecret(req.headers.get('X-Telegram-Bot-Api-Secret-Token') ?? '', await webhookSecret())) {
    return new Response('forbidden', { status: 401 })
  }
  const update = (await req.json().catch(() => null)) as { message?: { chat?: { id?: unknown; type?: unknown }; text?: unknown } } | null
  const chat = update?.message?.chat
  const text = update?.message?.text
  // only private chats with a person; groups and channels are ignored
  if (typeof chat?.id !== 'number' || chat.type !== 'private' || typeof text !== 'string') return done()
  const chatId = chat.id
  const [command = '', arg = ''] = text.trim().split(/\s+/, 2)
  const db = serviceDb()

  try {
    // tidy up first: codes live 10 minutes
    await db.from('telegram_link_codes').delete().lt('expires_at', new Date().toISOString())
    switch (command.split('@')[0]) {
      case '/start': {
        if (!arg) {
          await sendMessage(chatId, HINT_START, '#/settings')
          return done()
        }
        const code = CODE.test(arg)
          ? (await db.from('telegram_link_codes').select('user_id, expires_at').eq('code', arg).maybeSingle()).data
          : null
        if (!code || Date.parse(code.expires_at as string) < Date.now()) {
          await sendMessage(chatId, HINT_BAD_CODE, '#/settings')
          return done()
        }
        // the code works once
        await db.from('telegram_link_codes').delete().eq('code', arg)
        const linked = await db
          .from('telegram_links')
          .upsert({ user_id: code.user_id, chat_id: chatId, linked_at: new Date().toISOString() })
        if (linked.error) throw linked.error
        await sendMessage(chatId, pickText('linked'), '#/settings')
        break
      }
      case '/stop': {
        await db.from('telegram_links').delete().eq('chat_id', chatId)
        await sendMessage(chatId, pickText('unlinked'))
        break
      }
    }
  } catch (e) {
    console.error('telegram-webhook failed', e instanceof Error ? e.message : String(e))
  }
  return done()
})
