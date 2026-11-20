import { useRef, type ButtonHTMLAttributes, type ChangeEvent, type ReactNode } from 'react'
import { Link } from 'react-router'
import { ThemedIcon, type IconName } from './ThemedIcon'

/**
 * primary — the one main action of a screen (light ink stroke on the dark canvas, dark ink on parchment);
 * secondary — other actions (muted stroke); link — small actions, text only.
 */
export type BrushVariant = 'primary' | 'secondary' | 'link'

type Look = {
  variant?: BrushVariant
  /** painted icon left of the label; decorative, the label says what the button does */
  icon?: IconName
  iconSize?: number
  /** full width of the container */
  block?: boolean
  /** destructive action: red label */
  danger?: boolean
  className?: string
  children: ReactNode
}

type AsButton = Look & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'children'> & { to?: undefined; href?: undefined }
type AsLink = Look & { to: string; href?: undefined; replace?: boolean; onClick?: () => void; 'aria-label'?: string }
/** A page outside the app (e.g. Telegram), opened in a new tab */
type AsExternal = Look & { href: string; to?: undefined; onClick?: () => void }

function brushClass({ variant = 'secondary', block, danger, className }: Omit<Look, 'children'>): string {
  return ['brush-btn', `brush-btn--${variant}`, block && 'brush-btn--block', danger && 'brush-btn--danger', className]
    .filter(Boolean)
    .join(' ')
}

function Content({ icon, iconSize, variant, children }: Pick<Look, 'icon' | 'iconSize' | 'variant' | 'children'>) {
  return (
    <>
      {icon && <ThemedIcon name={icon} size={iconSize ?? (variant === 'link' ? 24 : 32)} inverse={variant === 'primary'} />}
      <span className="brush-btn-label">{children}</span>
    </>
  )
}

/** Every button of the app: one brush-stroke shape in three weights. Renders a real <button>, a router link or an <a>. */
export function BrushButton(props: AsButton | AsLink | AsExternal) {
  const { variant = 'secondary', icon, iconSize, block, danger, className, children } = props
  const cls = brushClass({ variant, block, danger, className })
  const content = (
    <Content icon={icon} iconSize={iconSize} variant={variant}>
      {children}
    </Content>
  )
  if (props.href !== undefined) {
    return (
      <a className={cls} href={props.href} target="_blank" rel="noopener noreferrer" onClick={props.onClick}>
        {content}
      </a>
    )
  }
  if (props.to !== undefined) {
    return (
      <Link className={cls} to={props.to} replace={props.replace} onClick={props.onClick} aria-label={props['aria-label']}>
        {content}
      </Link>
    )
  }
  const { variant: _v, icon: _i, iconSize: _s, block: _b, danger: _d, className: _c, children: _ch, to: _to, href: _h, type = 'button', ...rest } = props
  return (
    <button type={type} className={cls} {...rest}>
      {content}
    </button>
  )
}

/** A BrushButton that opens the file picker (keyboard-accessible, unlike a <label> around a hidden input). */
export function FileButton({
  accept,
  onChange,
  disabled,
  ...look
}: Look & { accept: string; onChange: (e: ChangeEvent<HTMLInputElement>) => void; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <>
      <BrushButton {...look} disabled={disabled} onClick={() => input.current?.click()} />
      <input ref={input} type="file" accept={accept} onChange={onChange} hidden tabIndex={-1} />
    </>
  )
}
