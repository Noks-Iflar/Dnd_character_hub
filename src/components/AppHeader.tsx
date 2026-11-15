import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { ThemeToggle } from './ThemeToggle'

/** Top bar: d20 + "Dnd Hub" on the left, page actions and the theme switch on the right. */
export function AppHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="app-header">
      <Link className="brand" to="/">
        Dnd Hub
      </Link>
      <div className="app-header-actions">
        {children}
        <ThemeToggle />
      </div>
    </header>
  )
}
