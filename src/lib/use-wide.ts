import { useEffect, useState } from 'react'

/** Desktop layout breakpoint: sidebar instead of the ☰ drawer, two-column screens. */
export const WIDE_QUERY = '(min-width: 1024px)'

const matches = (query: string) => typeof window !== 'undefined' && !!window.matchMedia?.(query).matches

/** True while the window is at least as wide as `query` says; follows resizing. */
export function useMedia(query: string): boolean {
  const [on, setOn] = useState(() => matches(query))
  useEffect(() => {
    const mq = window.matchMedia?.(query)
    if (!mq) return
    const update = () => setOn(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [query])
  return on
}

export const useWide = () => useMedia(WIDE_QUERY)
