import { useState } from 'react'
import { chooseTheme, currentTheme, type Theme } from '../lib/theme'

/** Sun / moon button that switches between the parchment and the dark canvas theme. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(currentTheme)
  const next: Theme = theme === 'dark' ? 'light' : 'dark'
  return (
    <button
      type="button"
      className="icon-btn"
      aria-label={next === 'light' ? 'Светлая тема' : 'Тёмная тема'}
      title={next === 'light' ? 'Светлая тема' : 'Тёмная тема'}
      onClick={() => {
        chooseTheme(next)
        setTheme(next)
      }}
    >
      {theme === 'dark' ? (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
        </svg>
      )}
    </button>
  )
}
