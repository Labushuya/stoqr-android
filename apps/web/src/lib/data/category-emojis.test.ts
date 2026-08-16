import { describe, it, expect } from 'vitest'
import { CATEGORY_EMOJIS, filterEmojis, emojisByContext } from './category-emojis'

describe('filterEmojis', () => {
  it('leere Suche → alle Emojis', () => {
    expect(filterEmojis('')).toHaveLength(CATEGORY_EMOJIS.length)
    expect(filterEmojis('   ')).toHaveLength(CATEGORY_EMOJIS.length)
  })

  it('findet per Keyword-Substring (case-insensitiv)', () => {
    // Nicht auf das exakte Emoji-Glyph pruefen (Variation-Selector-Fallen) —
    // stattdessen, dass die Keyword-Suche ueberhaupt trifft.
    expect(filterEmojis('tiefkuehl').length).toBeGreaterThan(0)
    expect(filterEmojis('kaese').some((e) => e.keywords.includes('kaese'))).toBe(true)
    expect(filterEmojis('wasser').some((e) => e.keywords.includes('wasser'))).toBe(true)
    // Raum-Emojis sind ebenfalls durchsuchbar (G26)
    expect(filterEmojis('kueche').some((e) => e.keywords.includes('kueche'))).toBe(true)
    expect(filterEmojis('schrank').length).toBeGreaterThan(0)
  })

  it('kein Treffer → leeres Array', () => {
    expect(filterEmojis('zzzznichtvorhanden')).toEqual([])
  })

  it('jedes Emoji hat mindestens ein Keyword und eine gueltige Gruppe', () => {
    const groups = new Set(['food', 'place', 'general'])
    expect(CATEGORY_EMOJIS.every((e) => e.keywords.length > 0 && groups.has(e.group))).toBe(true)
  })
})

describe('emojisByContext', () => {
  it('enthaelt IMMER alle Emojis (nur andere Reihenfolge)', () => {
    expect(emojisByContext('category')).toHaveLength(CATEGORY_EMOJIS.length)
    expect(emojisByContext('place')).toHaveLength(CATEGORY_EMOJIS.length)
  })

  it('category → Lebensmittel (food) zuerst', () => {
    expect(emojisByContext('category')[0].group).toBe('food')
  })

  it('place → Raeume/Orte (place) zuerst', () => {
    expect(emojisByContext('place')[0].group).toBe('place')
  })
})

