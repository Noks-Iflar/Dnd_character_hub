// Dice formula parsing and rolling: "1d20+5", "2d6 + 3", "2d20kh", "1d8 - 1".
// Supported: NdM dice (N optional), kh/kl keep modifiers, integer constants, + and -.
// Foundry flavor tags like "[piercing]" are ignored.

export type DiceTerm = {
  kind: 'dice'
  sign: 1 | -1
  count: number
  faces: number
  keep?: { mode: 'highest' | 'lowest'; count: number }
}

export type ConstTerm = { kind: 'const'; sign: 1 | -1; value: number }

export type Term = DiceTerm | ConstTerm

export type DieResult = { faces: number; value: number; kept: boolean }

export type RollResult = {
  formula: string
  total: number
  dice: DieResult[]
}

/** Returns an integer in [1, faces]. Injectable for tests. */
export type RandomDie = (faces: number) => number

export const defaultRandomDie: RandomDie = (faces) => {
  const buf = new Uint32Array(1)
  crypto.getRandomValues(buf)
  return (buf[0] % faces) + 1
}

const MAX_DICE = 100
const MAX_FACES = 1000

const TERM_RE = /^(\d*)d(\d+)(?:(kh|kl)(\d*))?$|^(\d+)$/

/** Parses a formula into terms. Returns null if the formula is not supported. */
export function parseFormula(formula: string): Term[] | null {
  const cleaned = formula
    .replace(/\[[^\]]*\]/g, '') // flavor tags
    .replace(/\s+/g, '')
    .toLowerCase()
  if (cleaned === '') return null

  // Split into signed chunks: "1d20+5-1" -> ["1d20", "+5", "-1"]
  const chunks = cleaned.match(/[+-]?[^+-]+/g)
  if (!chunks || chunks.join('') !== cleaned) return null

  const terms: Term[] = []
  for (const chunk of chunks) {
    const sign: 1 | -1 = chunk.startsWith('-') ? -1 : 1
    const body = chunk.replace(/^[+-]/, '')
    const m = TERM_RE.exec(body)
    if (!m) return null

    if (m[5] !== undefined) {
      terms.push({ kind: 'const', sign, value: Number(m[5]) })
      continue
    }

    const count = m[1] === '' ? 1 : Number(m[1])
    const faces = Number(m[2])
    if (count < 1 || count > MAX_DICE || faces < 1 || faces > MAX_FACES) return null

    const term: DiceTerm = { kind: 'dice', sign, count, faces }
    if (m[3]) {
      const keepCount = m[4] === '' ? 1 : Number(m[4])
      if (keepCount < 1 || keepCount > count) return null
      term.keep = { mode: m[3] === 'kh' ? 'highest' : 'lowest', count: keepCount }
    }
    terms.push(term)
  }
  return terms
}

/** Rolls a formula. Returns null if the formula is not supported. */
export function roll(formula: string, randomDie: RandomDie = defaultRandomDie): RollResult | null {
  const terms = parseFormula(formula)
  if (!terms) return null

  let total = 0
  const dice: DieResult[] = []

  for (const term of terms) {
    if (term.kind === 'const') {
      total += term.sign * term.value
      continue
    }
    const values = Array.from({ length: term.count }, () => randomDie(term.faces))
    const kept = keptMask(values, term.keep)
    values.forEach((value, i) => {
      dice.push({ faces: term.faces, value, kept: kept[i] })
      if (kept[i]) total += term.sign * value
    })
  }

  return { formula, total, dice }
}

function keptMask(values: number[], keep: DiceTerm['keep']): boolean[] {
  if (!keep) return values.map(() => true)
  const order = values
    .map((value, index) => ({ value, index }))
    .sort((a, b) => (keep.mode === 'highest' ? b.value - a.value : a.value - b.value))
  const keptIndexes = new Set(order.slice(0, keep.count).map((x) => x.index))
  return values.map((_, i) => keptIndexes.has(i))
}
