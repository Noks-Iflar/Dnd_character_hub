import { describe, expect, it } from 'vitest'
import { parentPath } from './nav'

describe('parentPath', () => {
  it('goes one level up inside the app', () => {
    expect(parentPath('/character/c1')).toBe('/')
    expect(parentPath('/character/c1/history')).toBe('/character/c1')
    expect(parentPath('/character/c1/v/s1')).toBe('/character/c1/history')
    expect(parentPath('/diary/lore/x')).toBe('/diary?tab=lore')
    expect(parentPath('/diary/session/x')).toBe('/diary')
    expect(parentPath('/planner')).toBe('/')
  })
})
