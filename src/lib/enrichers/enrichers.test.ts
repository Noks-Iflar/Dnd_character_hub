// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { cleanEnrichers, toSafeHtml } from './enrichers'

describe('cleanEnrichers', () => {
  it('replaces document links with their label', () => {
    expect(cleanEnrichers('См. @UUID[Compendium.dnd5e.items.Item.abc123]{Длинный меч}.')).toBe(
      'См. Длинный меч.',
    )
    expect(cleanEnrichers('@Compendium[dnd5e.spells.xyz]{Огненный шар}')).toBe('Огненный шар')
    expect(cleanEnrichers('@Item[abc]{Зелье}')).toBe('Зелье')
  })

  it('removes document links without a label', () => {
    expect(cleanEnrichers('до @UUID[Actor.abc123] после')).toBe('до  после')
  })

  it('keeps references readable', () => {
    expect(cleanEnrichers('&Reference[prone]{Сбит с ног}')).toBe('Сбит с ног')
    expect(cleanEnrichers('&Reference[prone]')).toBe('Сбитый с ног')
    expect(cleanEnrichers('&Reference[someNewRule]')).toBe('someNewRule')
  })

  it('handles references as they come in HTML (&amp;), with options and any case', () => {
    expect(cleanEnrichers('цель &amp;Reference[charmed apply=false]{Обворожена}, пока')).toBe('цель Обворожена, пока')
    expect(cleanEnrichers('&amp;Reference[friendly]{Дружественно} к вам')).toBe('Дружественно к вам')
    expect(cleanEnrichers('действие &amp;reference[Magic]')).toBe('действие Магия')
    expect(cleanEnrichers('&amp;Reference[Charmed apply=false]')).toBe('Обворожённый')
  })

  it('turns roll commands into formulas', () => {
    expect(cleanEnrichers('Урон [[/r 1d6]] огнём')).toBe('Урон 1d6 огнём')
    expect(cleanEnrichers('[[/roll 2d8 + 3 # Лечение]]')).toBe('2d8 + 3')
    expect(cleanEnrichers('[[/gmr 1d20]]')).toBe('1d20')
    expect(cleanEnrichers('[[1d4+1]]')).toBe('1d4+1')
  })

  it('prefers the label of an inline roll', () => {
    expect(cleanEnrichers('[[/r 1d6]]{шесть}')).toBe('шесть')
  })

  it('drops lookups that only Foundry can resolve', () => {
    expect(cleanEnrichers('кость ([[lookup @scale.bard.inspiration.die]]).')).toBe('кость ().')
    expect(cleanEnrichers('@Embed[Compendium.dnd5e.content24.JournalEntry.x inline]')).toBe('')
  })

  it('keeps arguments of other commands', () => {
    expect(cleanEnrichers('[[/check prc 11]]')).toBe('prc 11')
  })

  it('translates damage types', () => {
    expect(cleanEnrichers('[[/damage 2d6 fire]]')).toBe('2d6 огнём')
    expect(cleanEnrichers('[[/damage 4d6 average poison]]')).toBe('4d6 ядом')
    expect(cleanEnrichers('[[/damage 1d8 type=cold]]')).toBe('1d8 холодом')
  })

  it('handles several enrichers in one string', () => {
    expect(cleanEnrichers('@UUID[a]{А} и @UUID[b]{Б}: [[/r 1d6]] + [[/r 1d4]]')).toBe('А и Б: 1d6 + 1d4')
  })

  it('leaves plain text untouched', () => {
    expect(cleanEnrichers('Обычный текст [в скобках] и {фигурных}.')).toBe(
      'Обычный текст [в скобках] и {фигурных}.',
    )
  })
})

describe('toSafeHtml', () => {
  it('keeps safe formatting', () => {
    expect(toSafeHtml('<p><strong>Сила</strong> [[/r 1d6]]</p>')).toBe('<p><strong>Сила</strong> 1d6</p>')
  })

  it('removes scripts and event handlers', () => {
    const html = toSafeHtml('<p onclick="alert(1)">Текст</p><script>alert(2)</script><img src=x onerror="alert(3)">')
    expect(html).not.toMatch(/script|onclick|onerror|alert/)
    expect(html).toContain('Текст')
  })
})
