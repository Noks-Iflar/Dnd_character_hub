import type { ReactNode } from 'react'
import { useHasAccount } from '../lib/use-account'
import { BrandLink, NavButtons } from './NavMenu'
import { SettingsLink } from './SettingsLink'
import { ThemeToggle } from './ThemeToggle'

/**
 * Top bar: menu, back and "Dnd Hub" on the left (with an optional badge such as the role),
 * page actions and the settings gear on the right. Without an account (file viewer, login)
 * settings are out of reach, so the theme switch stays in the header.
 */
export function AppHeader({ children, badge, menu = true }: { children?: ReactNode; badge?: ReactNode; menu?: boolean }) {
  const hasAccount = useHasAccount()
  return (
    <header className="app-header">
      <span className="app-header-nav">
        <NavButtons menu={menu} />
        <BrandLink />
        {badge}
      </span>
      <div className="app-header-actions">
        {children}
        {hasAccount ? <SettingsLink /> : <ThemeToggle />}
      </div>
    </header>
  )
}
