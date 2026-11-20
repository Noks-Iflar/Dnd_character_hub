// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { applyTheme } from '../lib/theme'
import { ThemedIcon } from './ThemedIcon'

// React needs this flag to run act() outside a test renderer
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('ThemedIcon', () => {
  it('takes the picture from the folder of the current theme and follows a switch', () => {
    const host = document.createElement('div')
    const root = createRoot(host)
    act(() => applyTheme('dark'))
    act(() => root.render(<ThemedIcon name="map" size={60} />))
    const img = () => host.querySelector('img')
    expect(img()?.getAttribute('src')).toMatch(/ui\/icons\/dark\/map\.png$/)
    expect(img()?.getAttribute('alt')).toBe('')
    act(() => applyTheme('light'))
    expect(img()?.getAttribute('src')).toMatch(/ui\/icons\/light\/map\.png$/)
    act(() => root.unmount())
  })
})
