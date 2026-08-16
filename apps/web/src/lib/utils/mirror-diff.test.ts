import { describe, it, expect } from 'vitest'
import { computeMirrorDiff } from './mirror-diff'

describe('computeMirrorDiff', () => {
  const article = { name: 'Mineralwasser', imageUrl: '/media/x.jpg', categoryId: 'cat-1' }

  it('kein Snapshot → keine Abweichung', () => {
    const d = computeMirrorDiff(article, null)
    expect(d.any).toBe(false)
    expect(d.name.differs).toBe(false)
  })

  it('identische Daten → keine Abweichung', () => {
    const d = computeMirrorDiff(article, {
      name: 'Mineralwasser',
      localImagePath: 'x.jpg',
      categoryId: 'cat-1',
    })
    expect(d.any).toBe(false)
  })

  it('abweichender Name wird markiert (kein fillsGap, da Artikel Name hat)', () => {
    const d = computeMirrorDiff(article, {
      name: 'Mineralwasser Classic',
      localImagePath: 'x.jpg',
      categoryId: 'cat-1',
    })
    expect(d.name.differs).toBe(true)
    expect(d.name.fillsGap).toBe(false)
    expect(d.any).toBe(true)
  })

  it('leeres Artikelfeld + Katalogwert → fillsGap', () => {
    const d = computeMirrorDiff(
      { name: '', imageUrl: null, categoryId: null },
      { name: 'Neuer Name', localImagePath: 'y.jpg', categoryId: 'cat-2' }
    )
    expect(d.name.fillsGap).toBe(true)
    expect(d.image.fillsGap).toBe(true)
    expect(d.category.fillsGap).toBe(true)
    expect(d.any).toBe(true)
  })

  it('gleiches Bild (media-Pfad) → keine Bild-Abweichung', () => {
    const d = computeMirrorDiff(article, {
      name: 'Mineralwasser',
      localImagePath: 'x.jpg',
      categoryId: 'cat-1',
    })
    expect(d.image.differs).toBe(false)
  })

  it('Katalog ohne Name → keine Name-Abweichung (nichts zu übernehmen)', () => {
    const d = computeMirrorDiff(article, {
      name: null,
      localImagePath: 'x.jpg',
      categoryId: 'cat-1',
    })
    expect(d.name.differs).toBe(false)
  })

  it('Whitespace wird normalisiert', () => {
    const d = computeMirrorDiff(
      { name: '  Mineralwasser  ', imageUrl: '/media/x.jpg', categoryId: 'cat-1' },
      { name: 'Mineralwasser', localImagePath: 'x.jpg', categoryId: 'cat-1' }
    )
    expect(d.any).toBe(false)
  })
})
