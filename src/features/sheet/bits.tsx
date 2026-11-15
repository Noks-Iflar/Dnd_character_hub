import { toSafeHtml } from '../../lib/enrichers/enrichers'

/** Diamond pips for slots and charges; a plain "n / max" when there are too many. */
export function Pips({ value, max }: { value: number; max: number }) {
  if (max > 10) return <span className="row-number">{`${value} / ${max}`}</span>
  return (
    <span className="pips" aria-label={`${value} из ${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={`pip${i < value ? ' full' : ''}`} />
      ))}
    </span>
  )
}

/** Foundry HTML, cleaned of enrichers and sanitized. */
export function Description({ html }: { html: string }) {
  const safe = toSafeHtml(html).trim()
  if (!safe) return <p className="muted description">Описания нет.</p>
  return <div className="description" dangerouslySetInnerHTML={{ __html: safe }} />
}
