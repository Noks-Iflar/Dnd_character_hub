// Light / dark theme. The choice is per device; without one we follow the system setting.
import { useSyncExternalStore } from 'react'

export type Theme = 'dark' | 'light'

const KEY = 'dndhub.theme'
const META_COLOR: Record<Theme, string> = { dark: '#18171a', light: '#ebe0c8' }

export function savedTheme(): Theme | null {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'dark' || v === 'light' ? v : null
  } catch {
    return null
  }
}

export function systemTheme(): Theme {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export function currentTheme(): Theme {
  return savedTheme() ?? systemTheme()
}

/** Puts the theme on <html data-theme> and the browser bar colour. */
export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', META_COLOR[theme])
  for (const notify of listeners) notify()
}

// Components that depend on the theme (themed icons, the theme switch) re-render on change
const listeners = new Set<() => void>()

function subscribe(notify: () => void): () => void {
  listeners.add(notify)
  return () => listeners.delete(notify)
}

function shownTheme(): Theme {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
}

/** The theme on screen right now; updates when it is switched. */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, shownTheme, () => 'dark')
}

export function chooseTheme(theme: Theme): void {
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    // Not saved (private mode): the theme still changes for this visit
  }
  applyTheme(theme)
}
