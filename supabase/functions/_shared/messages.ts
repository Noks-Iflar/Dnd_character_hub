// Texts of the Telegram bot «Ворон Длани». Edit freely, but keep the {placeholders}:
//   {дата}   — weekday and date in the recipient's time zone: «сб, 7 декабря»
//   {время}  — time in the recipient's time zone: «19:00»
//   {список} — for the GM's digest: «Дайдэн — 3 правки, Мерик — 1» (the word only after the first number)
// Where an event has several variants, the bot picks one at random.

export const MESSAGES = {
  // ---- players ----
  session_scheduled: [
    'Длань созывает своих. Сбор — {дата}, {время} по твоему времени.',
    'Ворон принёс приказ: явиться {дата}, в {время} по твоему времени. Опоздавших Длань не ждёт.',
  ],
  session_moved: ['Планы изменились. Новый сбор — {дата}, {время} по твоему времени.'],
  remind_24h_player: ['Свеча догорает: до сбора одни сутки. Завтра в {время}.', 'Завтра в {время} Длань ждёт. Наточи клинок и перечитай записи.'],
  remind_1h_player: ['Час до сбора. Проверь клинок, ячейки и совесть.', 'Через час — в путь. Тьма не ждёт, мастер тоже.'],
  game_started: [
    'Врата закрыты, сбор начался. Лист запечатан до следующего снимка.',
    'Ширма поднята. Теперь перо в руках судьбы — лист закрыт до конца сессии.',
  ],
  snapshot_ready: [
    'Летописец записал пережитое. Лист обновлён и снова открыт для правки.',
    'Пыль улеглась, раны сочтены. Лист обновлён после сессии — перо снова твоё.',
  ],
  edits_applied: ['Мастер скрепил твои правки печатью. Теперь это часть твоей истории.'],

  // ---- the GM ----
  edits_digest: ['Донесение писаря: {список}. Чернила ещё не высохли.'],
  all_marked: ['Все агенты назвали свои часы. Пора назначать сбор.'],
  remind_24h_gm: ['Сутки до сбора. Ширма ждёт.'],
  remind_1h_gm: ['Час до сбора. Расставь ловушки и зажги свечи.'],

  // ---- connecting the bot ----
  test: ['Пробное карканье. Если ты это читаешь — связь держится.'],
  linked: ['Ворон нашёл дорогу. Отныне вести Длани будут приходить сюда.'],
  unlinked: ['Ворон отпущен. Вестей не будет, пока не позовёшь снова.'],
} as const

/** Forms of «правка» for 1, 2–4 and 5+ (used in {список}). */
export const EDIT_WORDS: [string, string, string] = ['правка', 'правки', 'правок']

/** Caption of the link button under every message. */
export const OPEN_BUTTON = 'Открыть Dnd Hub'

// Not in the approved list: answers to a wrong or expired link code and to /start without a code.
export const HINT_BAD_CODE =
  'Ссылка устарела или уже использована. Открой Dnd Hub → Настройки → «Уведомления в Telegram» и нажми «Подключить Telegram» ещё раз.'
export const HINT_START = 'Чтобы получать вести, открой Dnd Hub → Настройки → «Уведомления в Telegram» и нажми «Подключить Telegram».'

export type MessageKind = keyof typeof MESSAGES
