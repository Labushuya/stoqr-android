import { describe, it, expect } from 'vitest'
import { slugify, isSeedCategorySlug } from './category-slug'

describe('slugify', () => {
  it('lowercased kebab-case aus einfachem Namen', () => {
    expect(slugify('Getränke')).toBe('getraenke')
  })

  it('transliteriert deutsche Umlaute + ß', () => {
    expect(slugify('Müsli & Süßes')).toBe('muesli-suesses')
    expect(slugify('Öl')).toBe('oel')
  })

  it('mehrere Woerter → Bindestriche, keine Rand-/Doppel-Bindestriche', () => {
    expect(slugify('  Brot   und  Backwaren  ')).toBe('brot-und-backwaren')
    expect(slugify('Tiefkühl / Kost')).toBe('tiefkuehl-kost')
  })

  it('nicht-alphanumerische Zeichen werden entfernt', () => {
    expect(slugify('Snacks!!!')).toBe('snacks')
  })
})

describe('isSeedCategorySlug', () => {
  it('erkennt die 9 Basis-Slugs', () => {
    expect(isSeedCategorySlug('beverages')).toBe(true)
    expect(isSeedCategorySlug('meat-fish')).toBe(true)
    expect(isSeedCategorySlug('other')).toBe(true)
  })
  it('fremde Slugs sind nicht geschuetzt', () => {
    expect(isSeedCategorySlug('getraenke')).toBe(false)
    expect(isSeedCategorySlug('')).toBe(false)
  })
})
