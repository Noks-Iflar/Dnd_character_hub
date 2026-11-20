import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link, NavLink, useLocation, useNavigate } from 'react-router'
import { useAuth } from '../lib/auth-context'
import { listCharacters, type Character } from '../lib/db'
import { clearOffline, loadOffline, onlineOr } from '../lib/offline'
import { parentPath } from '../lib/nav'
import { supabase } from '../lib/supabase'
import { useWide } from '../lib/use-wide'

const ICON = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, 'aria-hidden': true } as const

function MenuLink({ to, children, onGo }: { to: string; children: ReactNode; onGo: () => void }) {
  return (
    <NavLink className="drawer-link" to={to} end onClick={onGo}>
      {children}
    </NavLink>
  )
}

/** Links to every screen; shared by the phone drawer and the desktop sidebar. */
function NavList({ onGo }: { onGo: () => void }) {
  const auth = useAuth()
  const cached = loadOffline()
  const userId = auth.status === 'signed-in' ? auth.session.user.id : cached?.userId
  const mine = cached?.userId === userId ? cached : null
  const isGm = mine?.profile?.role === 'gm'
  const [characters, setCharacters] = useState<Character[]>(mine?.characters ?? [])

  useEffect(() => {
    if (auth.status !== 'signed-in') return
    let cancelled = false
    onlineOr(listCharacters).then(
      (list) => !cancelled && setCharacters(list),
      () => undefined, // offline: keep the cached list
    )
    return () => {
      cancelled = true
    }
  }, [auth.status])


  const own = isGm ? characters : characters.filter((c) => c.ownerId === userId)

  const onClose = onGo
  return (
    <>
        <MenuLink to="/" onGo={onClose}>Главная</MenuLink>
        {isGm && <MenuLink to="/gm" onGo={onClose}>Экран мастера</MenuLink>}
        {own.length > 0 && (
          <>
            <span className="drawer-caption">{isGm ? 'Персонажи' : own.length > 1 ? 'Мои персонажи' : 'Мой персонаж'}</span>
            {own.map((c) => (
              <MenuLink key={c.id} to={`/character/${c.id}`} onGo={onClose}>
                {c.name}
              </MenuLink>
            ))}
          </>
        )}
        <span className="drawer-caption">Кампания</span>
        <MenuLink to="/planner" onGo={onClose}>Планировщик</MenuLink>
        <MenuLink to="/diary" onGo={onClose}>Дневник</MenuLink>
        <MenuLink to="/library" onGo={onClose}>Библиотека</MenuLink>
        <MenuLink to="/map" onGo={onClose}>Карта мира</MenuLink>
        <span className="drawer-caption">Ещё</span>
        <MenuLink to="/sheet" onGo={onClose}>Открыть лист из файла</MenuLink>
        <MenuLink to="/settings" onGo={onClose}>Настройки</MenuLink>
        {auth.status === 'signed-in' && (
          <button
            type="button"
            className="drawer-link"
            onClick={() => {
              onClose()
              clearOffline()
              void supabase?.auth.signOut()
            }}
          >
            Выйти
          </button>
        )}
    </>
  )
}

function Drawer({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <nav className="drawer" aria-label="Разделы приложения" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <span className="brand">Dnd Hub</span>
          <button type="button" className="icon-btn" aria-label="Закрыть меню" onClick={onClose} autoFocus>
            <svg {...ICON}>
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        <NavList onGo={onClose} />
      </nav>
    </div>
  )
}

/** Always-visible menu on the left of wide screens. */
export function Sidebar() {
  return (
    <nav className="sidebar" aria-label="Разделы приложения">
      <Link className="brand sidebar-brand" to="/">
        Dnd Hub
      </Link>
      <NavList onGo={() => undefined} />
    </nav>
  )
}

/** Menu (☰) and back (‹) buttons for the left side of every header. */
export function NavButtons({ menu = true }: { menu?: boolean }) {
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const isHome = location.pathname === '/'
  const wide = useWide()

  function back() {
    // react-router keeps its position in history.state.idx; 0 means we came from outside the app
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0
    if (idx > 0) void navigate(-1)
    else void navigate(parentPath(location.pathname), { replace: true })
  }

  return (
    <span className="nav-buttons">
      {menu && !wide && (
        <button type="button" className="icon-btn" aria-label="Меню" aria-expanded={open} onClick={() => setOpen(true)}>
          <svg {...ICON}>
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
      )}
      {!isHome && (
        <button type="button" className="icon-btn" aria-label="Назад" onClick={back}>
          <svg {...ICON}>
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
      )}
      {/* rendered at the end of <body>: inside a header with art it would sit under the page title's layer */}
      {open && !wide && createPortal(<Drawer onClose={() => setOpen(false)} />, document.body)}
    </span>
  )
}

/** Brand link used next to the nav buttons. */
export function BrandLink() {
  return (
    <Link className="brand" to="/">
      Dnd Hub
    </Link>
  )
}
