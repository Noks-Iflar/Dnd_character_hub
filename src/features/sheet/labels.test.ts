import { describe, expect, it } from 'vitest'
import { ruLabel } from './labels'

describe('ruLabel', () => {
  it('translates common Foundry labels', () => {
    expect(['Action', 'Bonus Action', 'Touch', 'Self', 'Instantaneous'].map(ruLabel)).toEqual([
      'действие',
      'бонусное действие',
      'касание',
      'на себя',
      'мгновенно',
    ])
    expect(['30 ft', '5 feet', '80/320 ft'].map(ruLabel)).toEqual(['30 фт', '5 фт', '80/320 фт'])
    expect(['1 hour', '2 hours', '10 minutes', '1 minute', '21 rounds'].map(ruLabel)).toEqual([
      '1 час',
      '2 часа',
      '10 минут',
      '1 минута',
      '21 раунд',
    ])
  })

  it('keeps already translated or unknown text', () => {
    expect(ruLabel('бонусное действие')).toBe('бонусное действие')
    expect(ruLabel('Special Thing')).toBe('Special Thing')
    expect(ruLabel(null)).toBe(null)
  })
})
