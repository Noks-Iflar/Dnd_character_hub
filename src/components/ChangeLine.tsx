import type { ReviewLine } from '../lib/review'
import { describePath, describeValue } from '../lib/snapshot/describe'
import type { JsonObject } from '../lib/snapshot/read'

/** What the line changes, in words: "Хиты: 59 → 40" or "Добавить: Зелье ×2". */
export function ChangeLine({ line, source }: { line: ReviewLine; source: JsonObject | null }) {
  const c = line.last
  if (line.kind === 'add_item') {
    return (
      <>
        <span>Добавить: </span>
        <strong>{c.itemName ?? 'предмет'}</strong>
        {c.itemType === 'spell' ? ' (заклинание)' : c.itemType === 'feat' ? ' (черта)' : ` ×${describeValue(c.newValue)}`}
      </>
    )
  }
  return (
    <>
      <span>{describePath(line.path, source)}: </span>
      <span className="muted">{describeValue(line.oldValue)}</span> → <strong>{describeValue(line.newValue)}</strong>
    </>
  )
}
