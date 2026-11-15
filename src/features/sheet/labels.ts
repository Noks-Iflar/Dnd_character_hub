// Russian wording for Foundry labels that come in English when the translation module did not translate them.

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
  return many
}

const EXACT: Record<string, string> = {
  action: 'действие',
  'bonus action': 'бонусное действие',
  reaction: 'реакция',
  'free action': 'без действия',
  touch: 'касание',
  self: 'на себя',
  any: 'любая',
  instantaneous: 'мгновенно',
  'until dispelled': 'пока не рассеют',
  special: 'особая',
  permanent: 'постоянно',
}

const UNITS: [RegExp, string, string, string][] = [
  [/^rounds?$/, 'раунд', 'раунда', 'раундов'],
  [/^minutes?$/, 'минута', 'минуты', 'минут'],
  [/^hours?$/, 'час', 'часа', 'часов'],
  [/^days?$/, 'день', 'дня', 'дней'],
]

/** "Action" -> "действие", "30 ft" -> "30 фт", "1 hour" -> "1 час"; anything unknown is returned as is. */
export function ruLabel(label: string | null): string | null {
  if (!label) return null
  const text = label.trim()
  const exact = EXACT[text.toLowerCase()]
  if (exact) return exact
  let m = /^(\d+(?:[.,]\d+)?)\s*(?:ft|feet|foot)\.?$/i.exec(text)
  if (m) return `${m[1]} фт`
  m = /^(\d+)\s*\/\s*(\d+)\s*(?:ft|feet)\.?$/i.exec(text)
  if (m) return `${m[1]}/${m[2]} фт`
  m = /^(\d+)\s+([A-Za-z]+)$/.exec(text)
  if (m) {
    const n = Number(m[1])
    const unit = UNITS.find(([re]) => re.test((m?.[2] ?? '').toLowerCase()))
    if (unit) return `${n} ${plural(n, unit[1], unit[2], unit[3])}`
  }
  return text
}
