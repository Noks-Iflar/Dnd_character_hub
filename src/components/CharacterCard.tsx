import { Link } from 'react-router'
import type { CharacterSummary } from '../lib/summary'
import { Portrait } from './Portrait'

const SPINS = [0, 95, 200, 290]

/** Party / "my characters" card: ring portrait, name, class, player, HP and a badge with pending edits. */
export function CharacterCard({
  id,
  name,
  summary,
  player,
  pending = 0,
  index = 0,
}: {
  id: string
  name: string
  summary: CharacterSummary | undefined
  player?: string | null
  pending?: number
  index?: number
}) {
  const sheet = summary?.sheet
  const hp = sheet?.hp.value ?? null
  const max = sheet?.hp.max.value ?? null
  const low = hp !== null && max !== null && max > 0 && hp < max / 2
  const classLine = sheet ? [sheet.race, sheet.classes.map((c) => `${c.name} ${c.levels}`).join(' / ')].filter(Boolean).join(', ') : null
  return (
    <Link to={`/character/${id}`} className="character-card">
      <Portrait src={sheet?.portrait ?? null} name={sheet?.name ?? name} size={66} spin={SPINS[index % SPINS.length]} />
      <span className="character-card-text">
        <span className="character-card-name">{sheet?.name ?? name}</span>
        <span className="muted small">{[classLine, player ? `игрок ${player}` : null].filter(Boolean).join(' · ') || 'Снимка ещё нет'}</span>
        {hp !== null && <span className={`small ${low ? 'hp-low' : 'muted'}`}>ХП {max !== null ? `${hp}/${max}` : hp}</span>}
      </span>
      {pending > 0 && (
        <span className="badge-blood" title="Правок ждут переноса в Foundry" aria-label={`Правок ждут мастера: ${pending}`}>
          {pending}
        </span>
      )}
    </Link>
  )
}
