import { useState } from 'react'
import { latestSnapshot, type PendingChange } from '../../lib/db'
import { formatDateTime } from '../../lib/format-date'
import { describePath, describeValue } from '../../lib/snapshot/describe'
import type { JsonObject } from '../../lib/snapshot/read'

/** Edits of one character waiting to be applied in Foundry. Loads item names on first open. */
export function PendingChanges({
  characterId,
  changes,
  onMarkApplied,
}: {
  characterId: string
  changes: PendingChange[]
  onMarkApplied: (ids: string[]) => void
}) {
  const [source, setSource] = useState<JsonObject | null>(null)
  const [requested, setRequested] = useState(false)

  function onToggle(open: boolean) {
    if (!open || requested) return
    setRequested(true)
    latestSnapshot(characterId)
      .then((s) => setSource(s?.snapshot.source ?? null))
      .catch(() => setSource(null))
  }

  // One line per field: value before the first edit -> value after the last edit
  const latestByPath = new Map<string, PendingChange>()
  for (const c of changes) {
    const first = latestByPath.get(c.path)
    latestByPath.set(c.path, first ? { ...c, oldValue: first.oldValue } : c)
  }

  return (
    <details className="list-details" onToggle={(e) => onToggle(e.currentTarget.open)}>
      <summary>
        <span className="grow">Ждут переноса в Foundry</span>
        <span className="chip chip-blood">{changes.length}</span>
      </summary>
      <ul className="plain-list" style={{ padding: '10px 14px' }}>
        {[...latestByPath.values()].map((c) => (
          <li key={c.id}>
            <span>{describePath(c.path, source)}: </span>
            <span className="muted">{describeValue(c.oldValue)}</span> → <strong>{describeValue(c.newValue)}</strong>
            <span className="muted small"> · {formatDateTime(c.createdAt)}</span>
          </li>
        ))}
      </ul>
      {latestByPath.size < changes.length && (
        <p className="muted small" style={{ padding: '0 14px' }}>
          Показаны итоговые значения: {changes.length} правок по {latestByPath.size} полям.
        </p>
      )}
      <div style={{ padding: '0 14px 14px' }}>
        <button type="button" className="btn" onClick={() => onMarkApplied(changes.map((c) => c.id))}>
          Я перенёс в Foundry — отметить применёнными
        </button>
      </div>
    </details>
  )
}
