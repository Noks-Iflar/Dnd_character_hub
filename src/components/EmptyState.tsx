import type { ReactNode } from 'react'
import { ThemedIcon, type IconName } from './ThemedIcon'

type Picture = { image: 'empty-scroll' | 'empty-chest'; alt: string; icon?: undefined } | { icon: IconName; image?: undefined; alt?: undefined }

/** Picture (art or a painted icon), title with a brush stroke, explanation. Used for "no snapshot yet", "no edits", "no map yet". */
export function EmptyState(props: Picture & { title: string; red?: boolean; children: ReactNode }) {
  const { title, red = false, children } = props
  return (
    <div className="empty-state">
      {props.icon ? (
        <ThemedIcon name={props.icon} size={120} />
      ) : (
        <img src={`${import.meta.env.BASE_URL}ui/art/${props.image}.webp`} alt={props.alt} width={220} height={220} />
      )}
      <h2>{title}</h2>
      <span className={`brush-underline${red ? ' red' : ''}`} aria-hidden="true" />
      <p>{children}</p>
    </div>
  )
}
