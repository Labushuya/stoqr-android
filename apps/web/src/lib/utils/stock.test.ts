import { describe, it, expect } from 'vitest'
import { buildUnitMetaMap, aggregateStock, compareToTarget, planInventoryAdjustment, resolveUnitMeta, buildPackSize, pickPackDisplayUnit, packToDisplay, type UnitRow } from './stock'
import { formatStockTotal } from './format'

// Repräsentative System-Units (wie in Migration 0007 gebackfillt).
const SYSTEM_UNITS: UnitRow[] = [
  { symbol: 'piece', name: 'Stück', householdId: null, dimension: 'count', toBaseFactor: '1' },
  { symbol: 'g', name: 'Gramm', householdId: null, dimension: 'mass', toBaseFactor: '1' },
  { symbol: 'kg', name: 'Kilogramm', householdId: null, dimension: 'mass', toBaseFactor: '1000' },
  { symbol: 'ml', name: 'Milliliter', householdId: null, dimension: 'volume', toBaseFactor: '1' },
  { symbol: 'l', name: 'Liter', householdId: null, dimension: 'volume', toBaseFactor: '1000' },
  { symbol: 'Packung', name: 'Packung', householdId: null, dimension: 'count', toBaseFactor: '1' },
]

const meta = buildUnitMetaMap(SYSTEM_UNITS)

describe('buildUnitMetaMap', () => {
  it('parst toBaseFactor als Zahl', () => {
    expect(meta.get('kg')?.toBaseFactor).toBe(1000)
  })

  it('gibt Custom-Units Vorrang vor System bei Symbol-Kollision', () => {
    const m = buildUnitMetaMap([
      { symbol: 'kg', name: 'Kilogramm', householdId: null, dimension: 'mass', toBaseFactor: '1000' },
      { symbol: 'kg', name: 'Eigene kg', householdId: 'h1', dimension: 'count', toBaseFactor: '1' },
    ])
    expect(m.get('kg')?.name).toBe('Eigene kg')
    expect(m.get('kg')?.dimension).toBe('count')
  })
})

describe('aggregateStock', () => {
  it('summiert g + kg zu einer Massegruppe und skaliert auf kg', () => {
    const totals = aggregateStock(
      [
        { quantity: '500', unit: 'g', status: 'available' },
        { quantity: '1', unit: 'kg', status: 'available' },
      ],
      meta
    )
    expect(totals.groups).toHaveLength(1)
    expect(totals.groups[0].dimension).toBe('mass')
    expect(totals.groups[0].totalInBase).toBe(1500)
    expect(totals.groups[0].displayValue).toBe(1.5)
    expect(totals.groups[0].displayUnit).toBe('kg')
    expect(totals.itemCount).toBe(2)
  })

  it('bleibt bei <1000 g in Gramm', () => {
    const totals = aggregateStock([{ quantity: '300', unit: 'g', status: 'available' }], meta)
    expect(totals.groups[0].displayUnit).toBe('g')
    expect(totals.groups[0].displayValue).toBe(300)
  })

  it('trennt count-Einheiten von mass (zwei Gruppen)', () => {
    const totals = aggregateStock(
      [
        { quantity: '2', unit: 'Packung', status: 'available' },
        { quantity: '1', unit: 'kg', status: 'available' },
      ],
      meta
    )
    expect(totals.groups).toHaveLength(2)
    // count zuerst
    expect(totals.groups[0].displayUnit).toBe('Packung')
    expect(totals.groups[0].displayValue).toBe(2)
    expect(totals.groups[1].displayUnit).toBe('kg')
  })

  it('ignoriert nicht-available Bestände', () => {
    const totals = aggregateStock(
      [
        { quantity: '1', unit: 'kg', status: 'available' },
        { quantity: '5', unit: 'kg', status: 'consumed' },
      ],
      meta
    )
    expect(totals.groups[0].totalInBase).toBe(1000)
    expect(totals.itemCount).toBe(1)
  })

  it('behandelt unbekanntes Symbol als eigene count-Gruppe', () => {
    const totals = aggregateStock([{ quantity: '3', unit: 'Beutel', status: 'available' }], meta)
    expect(totals.groups).toHaveLength(1)
    expect(totals.groups[0].dimension).toBe('count')
    expect(totals.groups[0].displayUnit).toBe('Beutel')
    expect(totals.groups[0].displayValue).toBe(3)
  })

  it('summiert ml + l zu Liter', () => {
    const totals = aggregateStock(
      [
        { quantity: '750', unit: 'ml', status: 'available' },
        { quantity: '1', unit: 'l', status: 'available' },
      ],
      meta
    )
    expect(totals.groups[0].dimension).toBe('volume')
    expect(totals.groups[0].displayValue).toBe(1.75)
    expect(totals.groups[0].displayUnit).toBe('l')
  })
})

describe('formatStockTotal', () => {
  it('formatiert gemischte Gruppen deutsch', () => {
    const totals = aggregateStock(
      [
        { quantity: '2', unit: 'Packung', status: 'available' },
        { quantity: '1500', unit: 'g', status: 'available' },
      ],
      meta
    )
    expect(formatStockTotal(totals)).toBe('2 Packung + 1,5 kg')
  })

  it('zeigt count-Einheit mit Namen (piece → Stück), nicht das Roh-Symbol (G21-1)', () => {
    const totals = aggregateStock(
      [{ quantity: '10', unit: 'piece', status: 'available' }],
      meta
    )
    expect(formatStockTotal(totals)).toBe('10 Stück')
  })

  it('faellt bei unbekannter count-Einheit auf das Symbol zurueck (kein Crash)', () => {
    const totals = aggregateStock(
      [{ quantity: '3', unit: 'blihn', status: 'available' }],
      meta
    )
    // 'blihn' ist keine bekannte Einheit → displayName == Symbol als Fallback.
    expect(formatStockTotal(totals)).toBe('3 blihn')
  })

  it('gibt — für leere Bestände zurück', () => {
    expect(formatStockTotal({ groups: [], itemCount: 0 })).toBe('—')
  })
})

describe('compareToTarget', () => {
  it('ok wenn Ist >= Soll (mass)', () => {
    const totals = aggregateStock([{ quantity: '2', unit: 'kg', status: 'available' }], meta)
    const r = compareToTarget(totals, { targetQuantity: '1', unit: 'kg' }, meta)
    expect(r.status).toBe('ok')
    expect(r.currentInBase).toBe(2000)
    expect(r.targetInBase).toBe(1000)
  })

  it('below_target wenn Ist < Soll', () => {
    const totals = aggregateStock([{ quantity: '500', unit: 'g', status: 'available' }], meta)
    const r = compareToTarget(totals, { targetQuantity: '1', unit: 'kg' }, meta)
    expect(r.status).toBe('below_target')
  })

  it('below_min wenn Ist < Min', () => {
    const totals = aggregateStock([{ quantity: '100', unit: 'g', status: 'available' }], meta)
    const r = compareToTarget(totals, { targetQuantity: '1', unit: 'kg', minQuantity: '0.5' }, meta)
    expect(r.status).toBe('below_min')
  })

  it('kein Bestand -> below_target', () => {
    const totals = aggregateStock([], meta)
    const r = compareToTarget(totals, { targetQuantity: '3', unit: 'piece' }, meta)
    expect(r.status).toBe('below_target')
    expect(r.currentInBase).toBe(0)
  })

  it('count symbolgenau: Soll Packung, Ist nur Stück -> not_comparable', () => {
    const totals = aggregateStock([{ quantity: '5', unit: 'piece', status: 'available' }], meta)
    const r = compareToTarget(totals, { targetQuantity: '2', unit: 'Packung' }, meta)
    expect(r.status).toBe('not_comparable')
  })

  it('count exakt: Soll Packung, Ist Packung -> ok', () => {
    const totals = aggregateStock([{ quantity: '3', unit: 'Packung', status: 'available' }], meta)
    const r = compareToTarget(totals, { targetQuantity: '2', unit: 'Packung' }, meta)
    expect(r.status).toBe('ok')
  })
})

describe('planInventoryAdjustment', () => {
  const items = [
    { id: 'a', quantity: '500', unit: 'g', status: 'available', bestBeforeDate: '2026-01-01' },
    { id: 'b', quantity: '1', unit: 'kg', status: 'available', bestBeforeDate: '2026-06-01' },
  ]

  it('reduziert FIFO (aelteste MHD zuerst)', () => {
    // Ist = 1500 g, neuer Ist = 800 g -> 700 g entfernen: zuerst a (500 g) ganz, dann b um 200 g.
    const plan = planInventoryAdjustment(items, 800, { dimension: 'mass' }, meta)
    expect(plan.needsIncrease).toBe(false)
    expect(plan.updates).toContainEqual(expect.objectContaining({ id: 'a', newQuantity: 0 }))
    // b: 1000 g - 200 g = 800 g -> in kg = 0.8
    const bUpd = plan.updates.find((u) => u.id === 'b')
    expect(bUpd?.newQuantity).toBeCloseTo(0.8, 5)
    // Anreicherung: oldQuantity + Kontext vorhanden (fuer die Vorschau).
    const aUpd = plan.updates.find((u) => u.id === 'a')
    expect(aUpd?.oldQuantity).toBe(500)
    expect(aUpd?.unit).toBe('g')
    expect(aUpd?.bestBeforeDate).toBe('2026-01-01')
  })

  it('leert alles bei neuem Ist 0', () => {
    const plan = planInventoryAdjustment(items, 0, { dimension: 'mass' }, meta)
    expect(plan.updates).toContainEqual(expect.objectContaining({ id: 'a', newQuantity: 0 }))
    expect(plan.updates).toContainEqual(expect.objectContaining({ id: 'b', newQuantity: 0 }))
  })

  it('signalisiert needsIncrease wenn neuer Ist > aktueller Ist', () => {
    const plan = planInventoryAdjustment(items, 2000, { dimension: 'mass' }, meta)
    expect(plan.needsIncrease).toBe(true)
    expect(plan.updates).toHaveLength(0)
    expect(plan.shortfallInBase).toBeCloseTo(500, 5)
    // relevantRows listet die bestehenden Zeilen (fuer „bestehende aufstocken").
    expect(plan.relevantRows.map((r) => r.id).sort()).toEqual(['a', 'b'])
  })

  it('suggestedNewQuantity: Fehlmenge in ZIEL-Einheit (count/Symbol)', () => {
    // 4 Flaschen Ist, Ziel 6 -> Fehlmenge 2 (Flaschen).
    const countItems = [
      { id: 'x', quantity: '1', unit: 'Packung', status: 'available', bestBeforeDate: '2027-01-01' },
      { id: 'y', quantity: '3', unit: 'Packung', status: 'available', bestBeforeDate: '2026-12-01' },
    ]
    const plan = planInventoryAdjustment(countItems, 6, { dimension: 'count', symbol: 'Packung' }, meta)
    expect(plan.needsIncrease).toBe(true)
    expect(plan.suggestedNewQuantity).toBeCloseTo(2, 5)
    // FIFO-Reihenfolge in relevantRows: aeltestes MHD (y, 2026-12-01) zuerst.
    expect(plan.relevantRows[0].id).toBe('y')
  })

  it('count symbolgenau: reduziert nur passende Einheit', () => {
    const countItems = [
      { id: 'p1', quantity: '3', unit: 'Packung', status: 'available', bestBeforeDate: null },
      { id: 's1', quantity: '5', unit: 'piece', status: 'available', bestBeforeDate: null },
    ]
    const plan = planInventoryAdjustment(countItems, 1, { dimension: 'count', symbol: 'Packung' }, meta)
    // nur Packung betroffen: 3 -> 1
    expect(plan.updates).toEqual([expect.objectContaining({ id: 'p1', newQuantity: 1 })])
  })
})

// ── Einheiten v2: PackSize / resolveUnitMeta / buildPackSize ────────────────

describe('buildPackSize', () => {
  it('Volumen-Gebinde: Flasche mit defaultVolumeMl', () => {
    const ps = buildPackSize({ defaultUnit: 'Flasche', defaultVolumeMl: '1500', defaultWeightG: null })
    expect(ps).toEqual({ unitSymbol: 'Flasche', baseFactor: 1500, dimension: 'volume' })
  })
  it('Masse-Gebinde: Packung mit defaultWeightG', () => {
    const ps = buildPackSize({ defaultUnit: 'Packung', defaultVolumeMl: null, defaultWeightG: '500' })
    expect(ps).toEqual({ unitSymbol: 'Packung', baseFactor: 500, dimension: 'mass' })
  })
  it('kein Gebinde ohne Maß → undefined', () => {
    expect(buildPackSize({ defaultUnit: 'Flasche', defaultVolumeMl: null, defaultWeightG: null })).toBeUndefined()
    expect(buildPackSize({ defaultUnit: 'Flasche', defaultVolumeMl: '0', defaultWeightG: '0' })).toBeUndefined()
  })
  it('Volumen gewinnt, wenn beide gesetzt', () => {
    const ps = buildPackSize({ defaultUnit: 'x', defaultVolumeMl: '250', defaultWeightG: '300' })
    expect(ps?.dimension).toBe('volume')
    expect(ps?.baseFactor).toBe(250)
  })
  it('ohne defaultUnit → undefined', () => {
    expect(buildPackSize({ defaultVolumeMl: '1000' })).toBeUndefined()
  })
})

describe('resolveUnitMeta', () => {
  it('ohne packSize: normale metaMap-Auflösung', () => {
    const m = resolveUnitMeta('kg', meta)
    expect(m.dimension).toBe('mass')
    expect(m.toBaseFactor).toBe(1000)
  })
  it('unbekannte Einheit ohne packSize → count/1-Fallback', () => {
    const m = resolveUnitMeta('Zomps', meta)
    expect(m).toEqual({ symbol: 'Zomps', name: 'Zomps', dimension: 'count', toBaseFactor: 1 })
  })
  it('packSize greift NUR für das passende Symbol', () => {
    const ps = { unitSymbol: 'Flasche', baseFactor: 1500, dimension: 'volume' as const }
    const flasche = resolveUnitMeta('Flasche', meta, ps)
    expect(flasche.dimension).toBe('volume')
    expect(flasche.toBaseFactor).toBe(1500)
    // anderes Symbol bleibt unberührt
    const kg = resolveUnitMeta('kg', meta, ps)
    expect(kg.dimension).toBe('mass')
    expect(kg.toBaseFactor).toBe(1000)
  })
})

// ── Einheiten v2: Gebinde-Umrechnung in den Kernfunktionen ──────────────────

describe('aggregateStock mit packSize (Gebinde)', () => {
  const flaschePack = { unitSymbol: 'Flasche', baseFactor: 1500, dimension: 'volume' as const }

  it('rechnet 3 Flaschen à 1,5 l auf 4,5 l Volumen um + Dual-Anzeige', () => {
    const totals = aggregateStock([{ quantity: '3', unit: 'Flasche', status: 'available' }], meta, flaschePack)
    expect(totals.groups).toHaveLength(1)
    const g = totals.groups[0]
    expect(g.dimension).toBe('volume')
    expect(g.totalInBase).toBe(4500)
    expect(g.displayUnit).toBe('l')
    expect(g.displayValue).toBe(4.5)
    expect(g.packCount).toEqual({ value: 3, unit: 'Flasche' }) // Dual: "3 Flasche (4,5 l)"
  })

  it('Gebinde-Flaschen + lose Liter landen in EINER Volumen-Gruppe', () => {
    const totals = aggregateStock(
      [
        { quantity: '2', unit: 'Flasche', status: 'available' }, // 3000 ml
        { quantity: '1', unit: 'l', status: 'available' }, // 1000 ml
      ],
      meta,
      flaschePack
    )
    expect(totals.groups).toHaveLength(1)
    expect(totals.groups[0].totalInBase).toBe(4000)
    expect(totals.groups[0].packCount).toEqual({ value: 2, unit: 'Flasche' })
  })

  it('Fallback ohne packSize: Flasche bleibt count (kein packCount)', () => {
    const totals = aggregateStock([{ quantity: '3', unit: 'Flasche', status: 'available' }], meta)
    expect(totals.groups[0].dimension).toBe('count')
    expect(totals.groups[0].displayUnit).toBe('Flasche')
    expect(totals.groups[0].packCount).toBeUndefined()
  })
})

describe('compareToTarget mit packSize', () => {
  const flaschePack = { unitSymbol: 'Flasche', baseFactor: 1500, dimension: 'volume' as const }

  it('Soll in Liter vs. Ist in Flaschen ist jetzt vergleichbar (nicht not_comparable)', () => {
    const totals = aggregateStock([{ quantity: '3', unit: 'Flasche', status: 'available' }], meta, flaschePack)
    const r = compareToTarget(totals, { targetQuantity: '6', unit: 'l' }, meta, flaschePack)
    // Ist 4,5 l < Soll 6 l
    expect(r.status).toBe('below_target')
    expect(r.currentInBase).toBe(4500)
    expect(r.targetInBase).toBe(6000)
  })

  it('Soll in Flaschen (per packSize zu Volumen) vs. Ist Flaschen -> ok', () => {
    const totals = aggregateStock([{ quantity: '4', unit: 'Flasche', status: 'available' }], meta, flaschePack)
    const r = compareToTarget(totals, { targetQuantity: '3', unit: 'Flasche' }, meta, flaschePack)
    // Ist 6000 ml >= Soll 4500 ml
    expect(r.status).toBe('ok')
  })
})

describe('planInventoryAdjustment mit packSize (FIFO in Flaschen)', () => {
  const flaschePack = { unitSymbol: 'Flasche', baseFactor: 1500, dimension: 'volume' as const }
  const items = [
    { id: 'a', quantity: '2', unit: 'Flasche', status: 'available', bestBeforeDate: '2026-01-01' }, // 3000 ml
    { id: 'b', quantity: '2', unit: 'Flasche', status: 'available', bestBeforeDate: '2026-06-01' }, // 3000 ml
  ]

  it('reduziert auf 3000 ml (=2 Flaschen): a ganz weg, b bleibt bei 2', () => {
    // Ist 6000 ml, Ziel 3000 ml -> 3000 ml entfernen: a (3000 ml) ganz.
    const plan = planInventoryAdjustment(items, 3000, { dimension: 'volume' }, meta, flaschePack)
    expect(plan.updates).toContainEqual(expect.objectContaining({ id: 'a', newQuantity: 0 }))
    // b unberührt (kein Update)
    expect(plan.updates.find((u) => u.id === 'b')).toBeUndefined()
  })

  it('teilweise Reduktion gibt Flaschen zurueck (nicht ml)', () => {
    // Ist 6000 ml, Ziel 4500 ml -> 1500 ml entfernen: a von 3000 auf 1500 ml = 1 Flasche.
    const plan = planInventoryAdjustment(items, 4500, { dimension: 'volume' }, meta, flaschePack)
    const aUpd = plan.updates.find((u) => u.id === 'a')
    expect(aUpd?.newQuantity).toBeCloseTo(1, 5) // 1 Flasche, NICHT 1500
  })
})

describe('pickPackDisplayUnit / packToDisplay (Gebinde-Anzeige, G7)', () => {
  it('mass < 1000 -> g', () => {
    expect(pickPackDisplayUnit(40, 'mass', meta)).toEqual({ value: 40, unitSymbol: 'g', unitName: 'Gramm' })
    expect(packToDisplay(40, 'mass', meta)).toBe('40 g')
  })
  it('mass >= 1000 -> kg', () => {
    expect(pickPackDisplayUnit(1500, 'mass', meta)).toEqual({ value: 1.5, unitSymbol: 'kg', unitName: 'Kilogramm' })
    expect(packToDisplay(1500, 'mass', meta)).toBe('1,5 kg')
  })
  it('volume < 1000 -> ml', () => {
    expect(packToDisplay(250, 'volume', meta)).toBe('250 ml')
  })
  it('volume >= 1000 -> l', () => {
    expect(pickPackDisplayUnit(1500, 'volume', meta)).toEqual({ value: 1.5, unitSymbol: 'l', unitName: 'Liter' })
    expect(packToDisplay(1500, 'volume', meta)).toBe('1,5 l')
  })
  it('0 / negativ / count -> kein Gebinde', () => {
    expect(pickPackDisplayUnit(0, 'mass', meta)).toBeNull()
    expect(pickPackDisplayUnit(-5, 'volume', meta)).toBeNull()
    expect(pickPackDisplayUnit(100, 'count', meta)).toBeNull()
    expect(packToDisplay(0, 'mass', meta)).toBe('')
  })
})
