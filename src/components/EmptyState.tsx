import type { ReactNode } from 'react'

/** Picture, title with a brush stroke, explanation. Used for "no snapshot yet" and "no edits". */
export function EmptyState({
  image,
  alt,
  title,
  red = false,
  children,
}: {
  image: 'empty-scroll' | 'empty-chest'
  alt: string
  title: string
  red?: boolean
  children: ReactNode
}) {
  return (
    <div className="empty-state">
      <img src={`${import.meta.env.BASE_URL}ui/art/${image}.webp`} alt={alt} width={220} height={220} />
      <h2>{title}</h2>
      <span className={`brush-underline${red ? ' red' : ''}`} aria-hidden="true" />
      <p>{children}</p>
    </div>
  )
}
