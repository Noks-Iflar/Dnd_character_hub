import type { ReactNode } from 'react'
import { BrandLink, NavButtons } from './NavMenu'
import { ThemeToggle } from './ThemeToggle'

/** Top bar: menu, back and "Dnd Hub" on the left, page actions and the theme switch on the right. */
export function AppHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="app-header">
      <span className="app-header-nav">
        <NavButtons />
        <BrandLink />
      </span>
      <div className="app-header-actions">
        {children}
        <ThemeToggle />
      </div>
    </header>
  )
}
