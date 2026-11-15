// Small type-safe readers for untyped JSON (Foundry data is not trusted).

export type JsonObject = Record<string, unknown>

export function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Reads a nested value by path: get(obj, 'system', 'attributes', 'hp'). */
export function get(value: unknown, ...path: string[]): unknown {
  let current: unknown = value
  for (const key of path) {
    if (!isObject(current)) return undefined
    current = current[key]
  }
  return current
}

/** Number or numeric string -> number; anything else -> null. */
export function num(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value)
  return null
}

export function str(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

export function bool(value: unknown): boolean {
  return value === true
}

export function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}
