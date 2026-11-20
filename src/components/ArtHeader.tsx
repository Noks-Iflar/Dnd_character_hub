import type { CSSProperties, ReactNode } from 'react'
import { NavButtons } from './NavMenu'
import { SettingsLink } from './SettingsLink'

/** Header arts in public/ui/art/headers/: header-<name>-800.webp, -1600.webp and -1600.jpg (fallback). */
export type ArtName = 'login' | 'planner' | 'master' | 'lore' | 'magic'

const base = `${import.meta.env.BASE_URL}ui/art/headers/header-`

/**
 * Header with a painted art. Its height follows the art's 2576:1274 proportion, so on a phone
 * the whole picture shows and nothing is cut at the sides; only a wide screen hits max-height,
 * and then only sky and floor go (top/bottom, by `focusY`: 0 keeps the top, 1 the bottom).
 * The bottom 35% fades into the page; text and buttons go only into the bottom 25% (`children`)
 * or into the top corners (`top`), where there are no faces.
 */
export function ArtHeader({
  name,
  alt,
  focusY,
  priority = false,
  sizes = '(min-width: 1024px) 1120px, 100vw',
  top,
  children,
  inline = false,
  className,
}: {
  name: ArtName
  alt: string
  focusY: number
  /** the first screen (sign-in): load the art right away */
  priority?: boolean
  /** how wide the header is drawn, for the browser to pick 800 or 1600 */
  sizes?: string
  /** small controls over the top corners (menu, back, settings) */
  top?: ReactNode
  /** title over the bottom 25% */
  children?: ReactNode
  /** not the first thing on the page (e.g. the «Магия» tab under the sheet header) */
  inline?: boolean
  className?: string
}) {
  const style = { '--focus-y': String(Math.min(1, Math.max(0, focusY))) } as CSSProperties
  return (
    <div className={['art-hero', inline && 'art-hero-inline', className].filter(Boolean).join(' ')} style={style}>
      <picture>
        <source type="image/webp" srcSet={`${base}${name}-800.webp 800w, ${base}${name}-1600.webp 1600w`} sizes={sizes} />
        <img
          src={`${base}${name}-1600.jpg`}
          alt={alt}
          width={1600}
          height={791}
          decoding="async"
          {...(priority ? { fetchPriority: 'high' as const } : {})}
        />
      </picture>
      <div className="art-hero-fade" aria-hidden="true" />
      {top && <div className="art-hero-top">{top}</div>}
      {children && <div className="art-hero-bottom">{children}</div>}
    </div>
  )
}

/** Corner controls of a screen with an art header: menu and back on the left, settings on the right. */
export function ArtNav() {
  return (
    <>
      <span className="art-pill">
        <NavButtons />
      </span>
      <span className="art-pill">
        <SettingsLink />
      </span>
    </>
  )
}
