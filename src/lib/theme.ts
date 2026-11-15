// Light / dark theme. The choice is per device; without one we follow the system setting.
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
}

export function chooseTheme(theme: Theme): void {
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    // Not saved (private mode): the theme still changes for this visit
  }
  applyTheme(theme)
}
