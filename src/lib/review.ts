// The GM's review of player edits: edits grouped into lines, one decision per line.
import type { Change, ChangeValue, Review } from './snapshot/changes'

export type Decision = 'undecided' | 'accepted' | 'rejected'

/**
 * One line of the review: all edits of one field of one character (only the final value
 * reaches Foundry), or one added library item. The decision is stored on every edit of the line.
 */
export type ReviewLine<T extends Change = Change> = {
  key: string
  kind: 'set' | 'add_item'
  path: string
  /** oldest first */
  rows: T[]
  /** value before the first edit (the snapshot value) */
  oldValue: ChangeValue | null
  /** value after the last edit */
  newValue: ChangeValue
  last: T
  decision: Decision
}

/** A new edit after the decision makes the line undecided again: the final value changed. */
export function decisionOf(rows: { review?: Review }[]): Decision {
  if (rows.length && rows.every((r) => r.review === 'accepted')) return 'accepted'
  if (rows.length && rows.every((r) => r.review === 'rejected')) return 'rejected'
  return 'undecided'
}

/** Lines in the order their first edit was made. `scope` separates characters (e.g. by character id). */
export function reviewLines<T extends Change>(changes: T[], scope: (c: T) => string = () => ''): ReviewLine<T>[] {
  const ordered = [...changes].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const byKey = new Map<string, T[]>()
  for (const c of ordered) {
    const key = `${scope(c)}|${c.kind === 'add_item' ? `add:${c.id}` : c.path}`
    const rows = byKey.get(key)
    if (rows) rows.push(c)
    else byKey.set(key, [c])
  }
  return [...byKey].map(([key, rows]) => {
    const first = rows[0] as T
    const last = rows[rows.length - 1] as T
    return {
      key,
      kind: first.kind === 'add_item' ? 'add_item' : 'set',
      path: first.path,
      rows,
      oldValue: first.oldValue,
      newValue: last.newValue,
      last,
      decision: decisionOf(rows),
    }
  })
}

export const rowIds = (lines: ReviewLine[]): string[] => lines.flatMap((l) => l.rows.map((r) => r.id))

/** How many lines are in each state. */
export function countDecisions(lines: ReviewLine[]): Record<Decision, number> {
  const out: Record<Decision, number> = { undecided: 0, accepted: 0, rejected: 0 }
  for (const l of lines) out[l.decision] += 1
  return out
}
