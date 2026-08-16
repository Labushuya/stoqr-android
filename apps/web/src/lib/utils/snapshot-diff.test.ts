import { describe, it, expect } from 'vitest'
import { snapshotDiffers, type SnapshotComparable } from './snapshot-diff'

const base: SnapshotComparable = {
  name: 'Mineralwasser, Classic',
  category: ['Getränke', 'Wasser'],
  priceCt: 29,
  currency: 'EUR',
  imageRemoteUrl: 'https://x/4306188415978.jpg',
}

describe('snapshotDiffers', () => {
  it('gleich -> false (auch bei anderer Kategorie-Reihenfolge)', () => {
    expect(snapshotDiffers(base, { ...base, category: ['Wasser', 'Getränke'] })).toBe(false)
  })
  it('anderer Preis -> true', () => {
    expect(snapshotDiffers(base, { ...base, priceCt: 39 })).toBe(true)
  })
  it('anderer Name -> true', () => {
    expect(snapshotDiffers(base, { ...base, name: 'Anders' })).toBe(true)
  })
  it('andere Kategorie-Menge -> true', () => {
    expect(snapshotDiffers(base, { ...base, category: ['Getränke'] })).toBe(true)
  })
  it('andere Bild-URL -> true', () => {
    expect(snapshotDiffers(base, { ...base, imageRemoteUrl: 'https://x/other.jpg' })).toBe(true)
  })
  it('null-tolerant', () => {
    const empty: SnapshotComparable = { name: null, category: null, priceCt: null, currency: null, imageRemoteUrl: null }
    expect(snapshotDiffers(empty, { ...empty })).toBe(false)
    expect(snapshotDiffers(empty, { ...empty, priceCt: 0 })).toBe(true)
  })
})
