import { useTheme } from '../lib/theme'

/** Painted icons from public/ui/icons/<theme>/<name>.png (see the README there). */
export type IconName =
  | 'bookshelf'
  | 'character-sheet'
  | 'crossed-swords'
  | 'dm-screen'
  | 'door'
  | 'hourglass'
  | 'journal'
  | 'letters-bundle'
  | 'map'
  | 'pocket-watch'
  | 'quill-scroll'
  | 'sealed-letter'
  | 'signet-ring'

/**
 * Painted icon for the current theme: dark-theme icons have light outlines on dark objects,
 * parchment ones dark outlines on light objects. Use from 32 px; small glyphs stay line icons.
 * Decorative: the button or tile next to it already has a text label.
 */
export function ThemedIcon({ name, size, className }: { name: IconName; size: number; className?: string }) {
  const theme = useTheme()
  return (
    <img
      className={className ? `themed-icon ${className}` : 'themed-icon'}
      src={`${import.meta.env.BASE_URL}ui/icons/${theme}/${name}.png`}
      alt=""
      width={size}
      height={size}
      draggable={false}
    />
  )
}
