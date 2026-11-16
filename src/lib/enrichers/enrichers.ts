import DOMPurify from 'dompurify'

// Foundry text enrichers that make no sense without a running Foundry server.
// TODO: refine against real item descriptions from fixtures/ (phase 2).

const ROLL_COMMANDS = new Set(['r', 'roll', 'gmr', 'gmroll', 'br', 'broll', 'blindroll', 'sr', 'selfroll', 'pr', 'publicroll'])

/**
 * Document links: @UUID[...]{Name}, @Compendium[...]{Name}, @Item[...]{Name},
 * &Reference[prone]{Name}. With a label -> the label; @UUID without a label
 * has no readable name offline -> removed; &Reference without a label -> the key.
 */
const LINK_RE = /(@|&amp;|&)(\w+)\[([^\]]*)\](?:\{([^}]*)\})?/g

/** Russian names for &Reference keys used without a label (rules, conditions, actions). */
const REFERENCE_RU: Record<string, string> = {
  // conditions
  blinded: 'Ослеплённый', charmed: 'Обворожённый', deafened: 'Оглохший', exhaustion: 'Истощение',
  frightened: 'Испуганный', grappled: 'Схваченный', incapacitated: 'Недееспособный', invisible: 'Невидимый',
  paralyzed: 'Парализованный', petrified: 'Окаменевший', poisoned: 'Отравленный', prone: 'Сбитый с ног',
  restrained: 'Опутанный', stunned: 'Ошеломлённый', unconscious: 'Без сознания', burning: 'Горение',
  dehydration: 'Обезвоживание', malnutrition: 'Недоедание', concentration: 'Концентрация',
  // actions
  attack: 'Атака', dash: 'Рывок', disengage: 'Отход', dodge: 'Уклонение', help: 'Помощь', hide: 'Засада',
  influence: 'Влияние', magic: 'Магия', ready: 'Подготовка', search: 'Поиск', study: 'Изучение',
  utilize: 'Использование', reaction: 'Реакция', opportunityattacks: 'Провоцированные атаки',
  unarmedstrike: 'Безоружный удар', unarmed: 'Безоружный удар', hiding: 'Скрытность',
  // rules
  advantage: 'Преимущество', disadvantage: 'Помеха', d20test: 'Тест к20', d20: 'Тест к20',
  criticalhits: 'Критические попадания', expertise: 'Компетентность', inspiration: 'Вдохновение',
  initiative: 'Инициатива', speed: 'Скорость', flying: 'Полёт', difficultterrain: 'Труднопроходимая местность',
  longrest: 'Долгий отдых', long: 'Долгий отдых', shortrest: 'Короткий отдых',
  resistance: 'Сопротивление', damageresistance: 'Сопротивление', immunity: 'Иммунитет',
  damagevulnerability: 'Уязвимость', half: 'Укрытие на половину', 'three-quarters': 'Укрытие на три четверти',
  totalcover: 'Полное укрытие', brightlight: 'Яркий свет', dimlight: 'Тусклый свет', darkness: 'Темнота',
  darkvision: 'Тёмное зрение', blindsight: 'Слепое зрение', tremorsense: 'Чувство вибрации', truesight: 'Истинное зрение',
  friendly: 'Дружественный', high: 'Высокий прыжок',
  // weapon mastery
  sap: 'Ослабление', slow: 'Замедление', topple: 'Опрокидывание', vex: 'Изматывание',
  // creature types
  beast: 'Зверь', celestial: 'Небожитель', construct: 'Конструкт', elemental: 'Элементаль', fey: 'Фея',
  fiend: 'Исчадие', undead: 'Нежить',
  // damage types
  radiant: 'излучением', necrotic: 'некротической энергией',
}

const DAMAGE_RU: Record<string, string> = {
  acid: 'кислотой', bludgeoning: 'дробящий', cold: 'холодом', fire: 'огнём', force: 'силовым полем',
  lightning: 'электричеством', necrotic: 'некротической энергией', piercing: 'колющий', poison: 'ядом',
  psychic: 'психической энергией', radiant: 'излучением', slashing: 'рубящий', thunder: 'звуком',
  healing: 'лечение', temphp: 'временные хиты',
}

/** [[/damage 2d6 type=fire average]] -> "2d6 огнём" */
function damageText(args: string): string {
  const words = args.replace(/\btype=/gi, '').replace(/\baverage\b/gi, '').split(/\s+/).filter(Boolean)
  return words.map((w) => DAMAGE_RU[w.toLowerCase()] ?? w).join(' ')
}

/** &Reference[Charmed apply=false] -> "Обворожённый"; unknown keys stay as written. */
function referenceText(target: string): string {
  const key = target.trim().split(/\s+/)[0] ?? ''
  return REFERENCE_RU[key.toLowerCase()] ?? key
}

/** Inline rolls: [[/r 1d6 # flavor]]{Label}, [[1d6+2]], [[/damage 2d6 fire]]. */
const INLINE_RE = /\[\[([\s\S]*?)\]\](?:\{([^}]*)\})?/g

export function cleanEnrichers(text: string): string {
  return text
    .replace(INLINE_RE, (_match, inner: string, label?: string) => {
      if (label !== undefined) return label
      const content = inner.trim()
      if (/^\/?lookup\b/i.test(content)) return '' // [[lookup @...]]: value only Foundry can resolve
      const cmd = /^\/(\w+)\s*([\s\S]*)$/.exec(content)
      if (!cmd) return content // plain inline roll: [[1d6]]
      const [, name, args] = cmd
      if (ROLL_COMMANDS.has(name.toLowerCase())) {
        return args.split('#')[0].trim() // drop "# flavor"
      }
      if (/^(damage|healing|heal)$/i.test(name)) return damageText(args)
      return args.trim() // other commands (/damage, /check, ...): keep arguments
    })
    .replace(LINK_RE, (_match, prefix: string, _type: string, target: string, label?: string) => {
      if (label !== undefined) return label
      return prefix === '@' ? '' : referenceText(target)
    })
}

/** Cleans enrichers and sanitizes HTML. The only way Foundry HTML may reach the page. */
export function toSafeHtml(html: string): string {
  return DOMPurify.sanitize(cleanEnrichers(html))
}
