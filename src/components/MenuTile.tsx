import { Link } from 'react-router'
import { ThemedIcon, type IconName } from './ThemedIcon'

/** A section of the app as a card: painted icon on top, name below. A link, not a button. */
export function MenuTile({ to, icon, label, note }: { to: string; icon: IconName; label: string; note?: string | null }) {
  return (
    <Link className="menu-tile" to={to}>
      <ThemedIcon name={icon} size={60} />
      <span className="menu-tile-label">{label}</span>
      {note && <span className="menu-tile-note">{note}</span>}
    </Link>
  )
}
