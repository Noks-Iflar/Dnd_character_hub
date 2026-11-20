import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { BrushButton } from '../../components/BrushButton'
import { ChangeLine } from '../../components/ChangeLine'
import { latestSnapshot, type Character, type PendingChange } from '../../lib/db'
import { formatDateTime } from '../../lib/format-date'
import { countDecisions, reviewLines, rowIds } from '../../lib/review'
import type { Review } from '../../lib/snapshot/changes'
import type { JsonObject } from '../../lib/snapshot/read'

/** Item names for item fields come from the character's latest snapshot; loaded once. */
function useSources(characterIds: string[]): Record<string, JsonObject | null> {
  const [sources, setSources] = useState<Record<string, JsonObject | null>>({})
  const key = characterIds.join(',')
  useEffect(() => {
    let cancelled = false
    for (const id of key ? key.split(',') : []) {
      latestSnapshot(id).then(
        (s) => !cancelled && setSources((m) => ({ ...m, [id]: s?.snapshot.source ?? null })),
        () => undefined, // names are a nicety: without them the line shows the field path
      )
    }
    return () => {
      cancelled = true
    }
  }, [key])
  return sources
}

/**
 * Player edits waiting for the GM: one line per field (only the final value goes to Foundry)
 * or per added item, each accepted or rejected on its own. Pressing the chosen answer again
 * takes the decision back.
 */
export function ReviewChanges({
  characters,
  pending,
  ownerName,
  onDecide,
  children,
}: {
  characters: Character[]
  pending: PendingChange[]
  ownerName: (ownerId: string | null) => string | null
  onDecide: (ids: string[], review: Review) => void
  children?: ReactNode
}) {
  const groups = useMemo(
    () =>
      characters
        .map((character) => ({ character, lines: reviewLines(pending.filter((c) => c.characterId === character.id)) }))
        .filter((g) => g.lines.length > 0),
    [characters, pending],
  )
  const all = groups.flatMap((g) => g.lines)
  const counts = countDecisions(all)
  const withItems = groups.filter((g) => g.lines.some((l) => l.path.startsWith('items.'))).map((g) => g.character.id)
  const sources = useSources(withItems)

  return (
    <section className="card review" aria-labelledby="review-title">
      <div className="review-head">
        <span id="review-title" className="label-caps">
          Правки игроков
        </span>
        <span className="muted small" aria-live="polite">
          Не решено: {counts.undecided} · принято: {counts.accepted} · отклонено: {counts.rejected}
        </span>
      </div>
      {groups.map(({ character, lines }) => (
        <div key={character.id} className="review-group">
          <div className="review-character">
            <span className="name-small">{character.name}</span>
            {ownerName(character.ownerId) && <span className="muted small"> · игрок {ownerName(character.ownerId)}</span>}
          </div>
          <ul className="review-lines">
            {lines.map((line) => (
              <li key={line.key} className={`review-line ${line.decision}`}>
                <div className="review-what">
                  <span className="review-text">
                    <ChangeLine line={line} source={sources[character.id] ?? null} />
                  </span>
                  <span className="muted small">
                    {formatDateTime(line.last.createdAt)}
                    {line.rows.length > 1 ? ` · правок: ${line.rows.length}` : ''}
                  </span>
                </div>
                <div className="segmented review-decision" role="group" aria-label="Решение по правке">
                  <button
                    type="button"
                    className="accept"
                    aria-pressed={line.decision === 'accepted'}
                    onClick={() => onDecide(rowIds([line]), line.decision === 'accepted' ? null : 'accepted')}
                  >
                    Принять
                  </button>
                  <button
                    type="button"
                    className="reject"
                    aria-pressed={line.decision === 'rejected'}
                    onClick={() => onDecide(rowIds([line]), line.decision === 'rejected' ? null : 'rejected')}
                  >
                    Отклонить
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {counts.undecided > 0 && (
        <BrushButton variant="link" className="review-accept-all" onClick={() => onDecide(rowIds(all.filter((l) => l.decision === 'undecided')), 'accepted')}>
          Принять все нерешённые ({counts.undecided})
        </BrushButton>
      )}
      <span className="muted small">
        В файл для Foundry попадут только принятые правки. Отклонённые сразу пропадут с листа игрока, и он увидит, что ты их отклонил.
      </span>
      {children}
    </section>
  )
}
