import { describe, it, expect } from 'vitest'
import { groupInventoryByProduct, type GroupableItem } from './inventory-group'
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

// Test-Helfer: minimalen Bestand bauen.
function item(
  overrides: Partial<Omit<GroupableItem, 'product'>> & {
    productId: string
    name?: string
    product?: Partial<GroupableItem['product']>
  }
): GroupableItem {
  const { productId, name, product, ...rest } = overrides
  return {
    quantity: '1',
    unit: 'piece',
    status: 'available',
    bestBeforeDate: null,
    ...rest,
    product: {
      id: productId,
      name: name ?? productId,
      ...product,
    },
  }
}

describe('groupInventoryByProduct', () => {
  it('fasst mehrere Bestände desselben Artikels zu EINER Gruppe zusammen', () => {
    const groups = groupInventoryByProduct(
      [
        item({ productId: 'p1', quantity: '2', unit: 'piece' }),
        item({ productId: 'p1', quantity: '3', unit: 'piece' }),
      ],
      meta
    )
    expect(groups).toHaveLength(1)
    expect(groups[0].product.id).toBe('p1')
    expect(groups[0].items).toHaveLength(2)
    expect(groups[0].totals.groups[0].displayValue).toBe(5)
    expect(groups[0].availableCount).toBe(2)
  })

  it('trennt verschiedene Artikel in getrennte Gruppen', () => {
    const groups = groupInventoryByProduct(
      [item({ productId: 'p1' }), item({ productId: 'p2' })],
      meta
    )
    expect(groups).toHaveLength(2)
  })

  it('summiert gemischte Masse-Einheiten je Artikel (g + kg → kg)', () => {
    const groups = groupInventoryByProduct(
      [
        item({ productId: 'p1', quantity: '500', unit: 'g' }),
        item({ productId: 'p1', quantity: '1', unit: 'kg' }),
      ],
      meta
    )
    expect(groups[0].totals.groups).toHaveLength(1)
    expect(groups[0].totals.groups[0].displayUnit).toBe('kg')
    expect(groups[0].totals.groups[0].displayValue).toBe(1.5)
  })

  it('rechnet Gebinde (Flasche) via buildPackSize auf Volumen um (Dual-Anzeige)', () => {
    const groups = groupInventoryByProduct(
      [
        item({
          productId: 'p1',
          quantity: '3',
          unit: 'Flasche',
          product: { defaultUnit: 'Flasche', defaultVolumeMl: '1500' },
        }),
      ],
      meta
    )
    const g = groups[0].totals.groups[0]
    expect(g.dimension).toBe('volume')
    expect(g.totalInBase).toBe(4500) // 3 × 1500 ml
    expect(g.packCount).toEqual({ value: 3, unit: 'Flasche' })
  })

  it('availableCount ignoriert consumed/verbrauchte Bestände', () => {
    const groups = groupInventoryByProduct(
      [
        item({ productId: 'p1', status: 'available' }),
        item({ productId: 'p1', status: 'consumed' }),
      ],
      meta
    )
    expect(groups[0].items).toHaveLength(2) // beide bleiben in der Gruppe
    expect(groups[0].availableCount).toBe(1) // aber nur einer zählt
    expect(groups[0].totals.itemCount).toBe(1) // aggregateStock filtert available
  })

  it('earliestBestBefore = frühestes MHD der VERFÜGBAREN Bestände', () => {
    const groups = groupInventoryByProduct(
      [
        item({ productId: 'p1', bestBeforeDate: '2026-08-01' }),
        item({ productId: 'p1', bestBeforeDate: '2026-06-15' }),
        // consumed mit noch früherem MHD darf NICHT gewinnen:
        item({ productId: 'p1', bestBeforeDate: '2026-01-01', status: 'consumed' }),
      ],
      meta
    )
    expect(groups[0].earliestBestBefore).toBe('2026-06-15')
  })

  it('earliestBestBefore = null, wenn kein verfügbarer Bestand ein MHD hat', () => {
    const groups = groupInventoryByProduct(
      [item({ productId: 'p1', bestBeforeDate: null })],
      meta
    )
    expect(groups[0].earliestBestBefore).toBeNull()
  })

  it('0-verfügbar-Fall: alle consumed → availableCount 0, totals leer', () => {
    const groups = groupInventoryByProduct(
      [
        item({ productId: 'p1', status: 'consumed' }),
        item({ productId: 'p1', status: 'discarded' }),
      ],
      meta
    )
    expect(groups[0].availableCount).toBe(0)
    expect(groups[0].totals.groups).toHaveLength(0)
    expect(groups[0].earliestBestBefore).toBeNull()
  })

  it('sortiert Gruppen nach frühestem MHD, MHD-lose ans Ende, dann Name', () => {
    const groups = groupInventoryByProduct(
      [
        item({ productId: 'p-none', name: 'Zebra', bestBeforeDate: null }),
        item({ productId: 'p-late', name: 'Banane', bestBeforeDate: '2026-12-01' }),
        item({ productId: 'p-early', name: 'Apfel', bestBeforeDate: '2026-06-01' }),
        item({ productId: 'p-none2', name: 'Ananas', bestBeforeDate: null }),
      ],
      meta
    )
    expect(groups.map((g) => g.product.id)).toEqual(['p-early', 'p-late', 'p-none2', 'p-none'])
  })

  it('leere Eingabe → leere Liste', () => {
    expect(groupInventoryByProduct([], meta)).toEqual([])
  })
})
