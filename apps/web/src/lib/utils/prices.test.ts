import { describe, it, expect } from 'vitest'
import { buildUnitMetaMap, type UnitRow } from './stock'
import { estimateLineCost, summarizeCosts, formatEuroApprox } from './prices'

const SYSTEM_UNITS: UnitRow[] = [
  { symbol: 'piece', name: 'Stück', householdId: null, dimension: 'count', toBaseFactor: '1' },
  { symbol: 'g', name: 'Gramm', householdId: null, dimension: 'mass', toBaseFactor: '1' },
  { symbol: 'kg', name: 'Kilogramm', householdId: null, dimension: 'mass', toBaseFactor: '1000' },
  { symbol: 'ml', name: 'Milliliter', householdId: null, dimension: 'volume', toBaseFactor: '1' },
  { symbol: 'l', name: 'Liter', householdId: null, dimension: 'volume', toBaseFactor: '1000' },
  { symbol: 'Packung', name: 'Packung', householdId: null, dimension: 'count', toBaseFactor: '1' },
]
const meta = buildUnitMetaMap(SYSTEM_UNITS)

describe('estimateLineCost', () => {
  it('kein Preis → cents null, hasPrice false', () => {
    const r = estimateLineCost(2, 'piece', null, meta)
    expect(r).toMatchObject({ cents: null, comparable: true, hasPrice: false })
  })

  it('count gleiche Einheit: Menge × Preis', () => {
    // 2 Packung × 1,19 € = 2,38 €
    const r = estimateLineCost(2, 'Packung', { priceCt: 119, unit: 'Packung' }, meta)
    expect(r.cents).toBe(238)
    expect(r.comparable).toBe(true)
  })

  it('count verschiedene Symbole → nicht vergleichbar', () => {
    const r = estimateLineCost(2, 'piece', { priceCt: 100, unit: 'Packung' }, meta)
    expect(r).toMatchObject({ cents: null, comparable: false, hasPrice: true })
  })

  it('mass: Preis pro kg, Bedarf in g (500 g bei 1,50 €/kg = 0,75 €)', () => {
    const r = estimateLineCost(500, 'g', { priceCt: 150, unit: 'kg' }, meta)
    expect(r.cents).toBe(75)
    expect(r.comparable).toBe(true)
  })

  it('mass: Preis pro g, Bedarf in kg (2 kg bei 0,20 €/100 g... hier 1 ct/g → 2000 ct)', () => {
    const r = estimateLineCost(2, 'kg', { priceCt: 1, unit: 'g' }, meta)
    expect(r.cents).toBe(2000)
  })

  it('volume: Preis pro l, Bedarf in ml (250 ml bei 2,00 €/l = 0,50 €)', () => {
    const r = estimateLineCost(250, 'ml', { priceCt: 200, unit: 'l' }, meta)
    expect(r.cents).toBe(50)
  })

  it('dimension-mismatch (mass vs volume) → nicht vergleichbar', () => {
    const r = estimateLineCost(1, 'kg', { priceCt: 100, unit: 'l' }, meta)
    expect(r).toMatchObject({ cents: null, comparable: false, hasPrice: true })
  })

  it('count vs mass → nicht vergleichbar', () => {
    const r = estimateLineCost(1, 'Packung', { priceCt: 100, unit: 'kg' }, meta)
    expect(r.comparable).toBe(false)
    expect(r.cents).toBeNull()
  })

  it('rundet auf ganze Cent', () => {
    // 333 g bei 1,00 €/kg = 33,3 ct → 33
    const r = estimateLineCost(333, 'g', { priceCt: 100, unit: 'kg' }, meta)
    expect(r.cents).toBe(33)
  })
})

describe('summarizeCosts', () => {
  it('summiert nur bezifferbare Positionen und zählt Lücken', () => {
    const lines = [
      { cents: 238, depositCents: 0, comparable: true, hasPrice: true },
      { cents: null, depositCents: 0, comparable: true, hasPrice: false }, // ohne Preis
      { cents: 75, depositCents: 0, comparable: true, hasPrice: true },
      { cents: null, depositCents: 0, comparable: false, hasPrice: true }, // inkompatibel
    ]
    const s = summarizeCosts(lines)
    expect(s.totalCents).toBe(313)
    expect(s.itemsWithoutPrice).toBe(1)
    expect(s.itemsNotComparable).toBe(1)
    expect(s.isPartial).toBe(true)
  })

  it('isPartial false, wenn alle Positionen beziffert', () => {
    const s = summarizeCosts([
      { cents: 100, depositCents: 0, comparable: true, hasPrice: true },
      { cents: 50, depositCents: 0, comparable: true, hasPrice: true },
    ])
    expect(s).toEqual({ totalCents: 150, totalDepositCents: 0, itemsWithoutPrice: 0, itemsNotComparable: 0, isPartial: false })
  })

  it('summiert Pfand separat (G47/G49)', () => {
    const s = summarizeCosts([
      { cents: 100, depositCents: 25, comparable: true, hasPrice: true },
      { cents: 200, depositCents: 50, comparable: true, hasPrice: true },
      { cents: 80, depositCents: 0, comparable: true, hasPrice: true },
    ])
    expect(s.totalCents).toBe(380)
    expect(s.totalDepositCents).toBe(75)
  })
})

describe('estimateLineCost — Pfand (G49: nur count)', () => {
  it('count: Pfand je Stück, getrennt von der Ware', () => {
    // 6 Flaschen à 0,89 € + 0,25 € Pfand; Preis enthält Pfand NICHT.
    const r = estimateLineCost(6, 'Flasche', { priceCt: 89, unit: 'Flasche', depositCt: 25, priceIncludesDeposit: false }, meta)
    expect(r.cents).toBe(534) // reine Ware
    expect(r.depositCents).toBe(150) // 6 × 25
  })
  it('Preis enthält Pfand → kein zusätzliches Pfand', () => {
    const r = estimateLineCost(6, 'Flasche', { priceCt: 114, unit: 'Flasche', depositCt: 25, priceIncludesDeposit: true }, meta)
    expect(r.depositCents).toBe(0)
  })
  it('mass/volume: KEIN Pfand (Pfand ist an count gebunden), auch mit Gebinde', () => {
    const pack = { unitSymbol: 'Flasche', baseFactor: 1500, dimension: 'volume' as const }
    const r = estimateLineCost(3000, 'ml', { priceCt: 10, unit: 'l', depositCt: 25, priceIncludesDeposit: false }, meta, pack)
    expect(r.depositCents).toBe(0)
    expect(r.cents).toBe(30) // 3000 ml × (10 ct / 1000 ml)
  })
  it('mass ohne Gebinde: KEIN Pfand', () => {
    const r = estimateLineCost(3, 'kg', { priceCt: 150, unit: 'kg', depositCt: 25, priceIncludesDeposit: false }, meta)
    expect(r.depositCents).toBe(0)
  })
  it('kein depositCt → kein Pfand', () => {
    const r = estimateLineCost(2, 'Flasche', { priceCt: 89, unit: 'Flasche' }, meta)
    expect(r.depositCents).toBe(0)
  })
})

describe('formatEuroApprox', () => {
  it('formatiert Cent als ca. ~-Betrag', () => {
    const s = formatEuroApprox(238)
    expect(s.startsWith('ca. ~')).toBe(true)
    expect(s).toContain('2,38')
    expect(s).toContain('€')
  })
})

describe('estimateLineCost mit packSize (Gebinde)', () => {
  const flaschePack = { unitSymbol: 'Flasche', baseFactor: 1500, dimension: 'volume' as const }

  it('Preis pro Flasche, Bedarf in l → vergleichbar', () => {
    // Preis 0,29 €/Flasche (1,5 l) = 29 ct / 1500 ml. Bedarf 3 l = 3000 ml → 2 Flaschen = 58 ct.
    const r = estimateLineCost(3, 'l', { priceCt: 29, unit: 'Flasche' }, meta, flaschePack)
    expect(r.comparable).toBe(true)
    expect(r.cents).toBe(58)
  })

  it('Preis pro Flasche, Bedarf in Flaschen → Stückpreis', () => {
    const r = estimateLineCost(2, 'Flasche', { priceCt: 29, unit: 'Flasche' }, meta, flaschePack)
    expect(r.cents).toBe(58)
    expect(r.comparable).toBe(true)
  })

  it('ohne packSize: Flasche vs. l bleibt nicht vergleichbar (Fallback)', () => {
    const r = estimateLineCost(3, 'l', { priceCt: 29, unit: 'Flasche' }, meta)
    expect(r.comparable).toBe(false)
    expect(r.cents).toBeNull()
  })
})
