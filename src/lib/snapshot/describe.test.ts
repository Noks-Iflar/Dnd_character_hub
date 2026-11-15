import { describe, expect, it } from 'vitest'
import { describePath, describeValue } from './describe'

const source = { items: [{ _id: 'abcdefghij012345', name: 'Ярость' }] }

describe('describePath', () => {
  it('names fixed fields, coins, slots and items', () => {
    expect(describePath('system.attributes.hp.value')).toBe('Хиты')
    expect(describePath('system.currency.gp')).toBe('Монеты: золотые')
    expect(describePath('system.spells.spell2.value')).toBe('Ячейки 2 круга')
    expect(describePath('system.spells.pact.value')).toBe('Ячейки договора')
    expect(describePath('items.abcdefghij012345.system.uses.spent', source)).toBe('Ярость: потрачено зарядов')
    expect(describePath('items.zzzzzzzzzzzzzzzz.system.quantity', source)).toBe('предмет zzzzzzzzzzzzzzzz: количество')
  })

  it('formats values', () => {
    expect([describeValue(true), describeValue(false), describeValue(3), describeValue(null)]).toEqual(['да', 'нет', '3', '—'])
  })
})
