import { describe, it, expect } from 'vitest'
import { baseUnitFactor, pricePerBaseUnit, rankCheapestStore, type StorePriceInfo } from './price-compare'
import { buildUnitMetaMap, type UnitRow } from './stock'

const SYSTEM_UNITS: UnitRow[] = [
  { symbol: 'piece', name: 'Stück', householdId: null, dimension: 'count', toBaseFactor: '1' },
  { symbol: 'g', name: 'Gramm', householdId: null, dimension: 'mass', toBaseFactor: '1' },
  { symbol: 'kg', name: 'Kilogramm', householdId: null, dimension: 'mass', toBaseFactor: '1000' },
  { symbol: 'ml', name: 'Milliliter', householdId: null, dimension: 'volume', toBaseFactor: '1' },
  { symbol: 'l', name: 'Liter', householdId: null, dimension: 'volume', toBaseFactor: '1000' },
  { symbol: 'Flasche', name: 'Flasche', householdId: null, dimension: 'count', toBaseFactor: '1' },
]
const meta = buildUnitMetaMap(SYSTEM_UNITS)

function price(o: Partial<StorePriceInfo> & { storeId: string }): StorePriceInfo {
  return { priceCt: 100, unit: 'l', basePriceCt: null, basePriceUnit: null, ...o }
}

describe('baseUnitFactor', () => {
  it('normiert auf g/ml-zentrierte Faktoren', () => {
    expect(baseUnitFactor('l')).toEqual({ dimension: 'volume', factor: 1000, symbol: 'ml' })
    expect(baseUnitFactor('kg')).toEqual({ dimension: 'mass', factor: 1000, symbol: 'g' })
    expect(baseUnitFactor('100g')).toEqual({ dimension: 'mass', factor: 100, symbol: 'g' })
    expect(baseUnitFactor('g')).toEqual({ dimension: 'mass', factor: 1, symbol: 'g' })
    expect(baseUnitFactor('Stück')).toEqual({ dimension: 'count', factor: 1, symbol: 'Stück' })
  })
  it('unbekannt/leer → null', () => {
    expect(baseUnitFactor('Rolle')).toBeNull()
    expect(baseUnitFactor(null)).toBeNull()
  })
})

describe('pricePerBaseUnit', () => {
  it('bevorzugt den Grundpreis (auf ml normiert)', () => {
    // 0,19 €/l → 19 Cent / 1000 ml = 0,019 ct/ml
    const r = pricePerBaseUnit(price({ storeId: 'a', priceCt: 29, unit: 'Flasche', basePriceCt: 19, basePriceUnit: 'l' }), {}, meta)
    expect(r).toEqual({ centsPerBase: 0.019, dimension: 'volume', symbol: 'ml' })
  })
  it('100g fair gegen kg', () => {
    // 0,89 €/100g → 89/100 = 0,89 ct/g ; 1,49 €/kg → 149/1000 = 0,149 ct/g
    const a = pricePerBaseUnit(price({ storeId: 'a', basePriceCt: 89, basePriceUnit: '100g' }), {}, meta)
    const b = pricePerBaseUnit(price({ storeId: 'b', basePriceCt: 149, basePriceUnit: 'kg' }), {}, meta)
    expect(a?.centsPerBase).toBeCloseTo(0.89, 5)
    expect(b?.centsPerBase).toBeCloseTo(0.149, 5)
  })
  it('Fallback ohne Grundpreis: priceCt/toBaseFactor (l → pro ml)', () => {
    const r = pricePerBaseUnit(price({ storeId: 'a', priceCt: 100, unit: 'l' }), {}, meta)
    expect(r).toEqual({ centsPerBase: 0.1, dimension: 'volume', symbol: 'ml' })
  })
  it('Fallback count: centsPerBase = priceCt, Symbol erhalten', () => {
    const r = pricePerBaseUnit(price({ storeId: 'a', priceCt: 199, unit: 'piece' }), {}, meta)
    expect(r).toEqual({ centsPerBase: 199, dimension: 'count', symbol: 'piece' })
  })
})

describe('rankCheapestStore', () => {
  it('markiert den billigsten pro Basiseinheit (Grundpreis)', () => {
    const r = rankCheapestStore([
      price({ storeId: 'penny', basePriceCt: 69, basePriceUnit: 'l' }),
      price({ storeId: 'globus', basePriceCt: 19, basePriceUnit: 'l' }),
    ], {}, meta)
    expect(r.cheapestStoreId).toBe('globus')
    expect(r.incomparableStoreIds).toEqual([])
  })
  it('mass vs volume → nicht vergleichbar, kein Ranking', () => {
    const r = rankCheapestStore([
      price({ storeId: 'a', basePriceCt: 50, basePriceUnit: 'kg' }),
      price({ storeId: 'b', basePriceCt: 50, basePriceUnit: 'l' }),
    ], {}, meta)
    // zwei getrennte 1er-Gruppen → keine vergleichbare Gruppe (≥2) → kein Marker
    expect(r.cheapestStoreId).toBeNull()
  })
  it('count-Symbol-Mismatch (Stück vs Flasche) nicht vergleichbar', () => {
    const r = rankCheapestStore([
      price({ storeId: 'a', priceCt: 100, unit: 'piece' }),
      price({ storeId: 'b', priceCt: 90, unit: 'Flasche' }),
    ], {}, meta)
    expect(r.cheapestStoreId).toBeNull()
  })
  it('Angebot gewinnt (isReduced zählt mit — kein Filter)', () => {
    const r = rankCheapestStore([
      price({ storeId: 'a', basePriceCt: 100, basePriceUnit: 'l' }),
      price({ storeId: 'b', basePriceCt: 55, basePriceUnit: 'l' }), // Angebot
    ], {}, meta)
    expect(r.cheapestStoreId).toBe('b')
  })
  it('Einzelmarkt → kein Marker', () => {
    const r = rankCheapestStore([price({ storeId: 'a', basePriceCt: 19, basePriceUnit: 'l' })], {}, meta)
    expect(r.cheapestStoreId).toBeNull()
  })
  it('gemischt: 2 vergleichbare + 1 andere Einheit → billigster der Gruppe, andere incomparable', () => {
    const r = rankCheapestStore([
      price({ storeId: 'a', basePriceCt: 30, basePriceUnit: 'l' }),
      price({ storeId: 'b', basePriceCt: 20, basePriceUnit: 'l' }),
      price({ storeId: 'c', priceCt: 100, unit: 'piece' }),
    ], {}, meta)
    expect(r.cheapestStoreId).toBe('b')
    expect(r.incomparableStoreIds).toContain('c')
  })
})
