import { useEffect, useRef, useState } from 'react'

type Props = {
  value: number
  min?: number
  max?: number
  label: string
  /** Called once the player stops tapping, with the final value. */
  onCommit: (value: number) => void
  delayMs?: number
}

/** − value + control. Rapid taps are merged into a single edit. */
export function Stepper({ value, min = 0, max, label, onCommit, delayMs = 900 }: Props) {
  const [draft, setDraft] = useState(value)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [prevValue, setPrevValue] = useState(value)

  // A new value from outside (saved edit, new snapshot) resets the draft
  if (value !== prevValue) {
    setPrevValue(value)
    setDraft(value)
  }

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  function change(delta: number) {
    const next = Math.max(min, max === undefined ? draft + delta : Math.min(max, draft + delta))
    if (next === draft) return
    setDraft(next)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      timer.current = null
      if (next !== value) onCommit(next)
    }, delayMs)
  }

  const pending = draft !== value
  return (
    <span className="stepper" role="group" aria-label={label}>
      <button type="button" onClick={() => change(-1)} disabled={draft <= min} aria-label={`${label}: уменьшить`}>
        −
      </button>
      <span className={`stepper-value${pending ? ' pending' : ''}`} aria-live="polite">
        {draft}
      </span>
      <button type="button" onClick={() => change(1)} disabled={max !== undefined && draft >= max} aria-label={`${label}: увеличить`}>
        +
      </button>
    </span>
  )
}
