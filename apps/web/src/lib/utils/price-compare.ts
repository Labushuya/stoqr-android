// ---------------------------------------------------------------------------
// Günstigster-Markt-Vergleich (reine Funktionen, testbar) — Block G46.
//
// Ziel: je Artikel den billigsten Markt PRO BASISEINHEIT fair vergleichen.
// Vorrang: der gesetzlich ausgezeichnete Grundpreis (PAngV, product_prices.
// base_price_ct/unit aus G44) — er ist markt-übergreifend fair. Fehlt er, wird
// pro Basiseinheit selbst gerechnet (priceCt / toBaseFactor, wie estimateLineCost).
//
// Verglichen wird NUR innerhalb derselben Dimension (mass/volume) bzw. bei count
// nur bei exakt gleichem Symbol — sonst „nicht vergleichbar" (kein Ranking-Eintrag).
// ---------------------------------------------------------------------------

import { resolveUnitMeta, buildPackSize, type UnitMeta } from './stock'

// Eingabe je Marktpreis (Teilmenge von product_prices + store).
export type StorePriceInfo = {
  storeId: string
  priceCt: number
  unit: string
  basePriceCt: number | null
  basePriceUnit: string | null
}

// Für buildPackSize nötige Artikel-Stammdaten.
export type PackProduct = {
  defaultUnit?: string | null
  defaultVolumeMl?: string | number | null
  defaultWeightG?: string | number | null
}

// Vergleichs-Schlüssel: Cent pro Basiseinheit + Dimensions-/Symbol-Kennung, damit
// nur gleichartige Bezugsgrößen gegeneinander ranken.
export type PricePerBase = {
  centsPerBase: number
  dimension: 'mass' | 'volume' | 'count'
  symbol: string // bei count das Einheiten-Symbol; bei mass/volume die Basiseinheit ('g'/'ml')
}

/**
 * Normiert eine Grundpreis-Einheit (aus normalizeBaseUnit, globus-price.ts) auf
 * { dimension, factor } — factor = wie viele Basiseinheiten (g bzw. ml) die
 * ausgezeichnete Bezugsgröße umfasst. So wird '100g' fair gegen 'kg'/'g'.
 * count ('Stück'/…) → dimension count, factor 1. Unbekannt → null.
 */
export function baseUnitFactor(
  unit: string | null | undefined,
): { dimension: 'mass' | 'volume' | 'count'; factor: number; symbol: string } | null {
  if (!unit) return null
  const u = unit.trim().toLowerCase()
  switch (u) {
    case 'l':
      return { dimension: 'volume', factor: 1000, symbol: 'ml' }
    case 'ml':
      return { dimension: 'volume', factor: 1, symbol: 'ml' }
    case 'kg':
      return { dimension: 'mass', factor: 1000, symbol: 'g' }
    case 'g':
      return { dimension: 'mass', factor: 1, symbol: 'g' }
    case '100g':
      return { dimension: 'mass', factor: 100, symbol: 'g' }
    case '100ml':
      return { dimension: 'volume', factor: 100, symbol: 'ml' }
    case 'stück':
    case 'stueck':
    case 'stk':
      return { dimension: 'count', factor: 1, symbol: 'Stück' }
    default:
      return null
  }
}

/**
 * Cent pro Basiseinheit für einen Marktpreis. Grundpreis bevorzugt (auf g/ml
 * normiert), sonst Eigenrechnung über resolveUnitMeta + packSize des Artikels.
 * null = nicht vergleichbar (unbekannte Einheit).
 */
export function pricePerBaseUnit(
  price: StorePriceInfo,
  product: PackProduct,
  metaMap: Map<string, UnitMeta>,
): PricePerBase | null {
  // 1) Grundpreis bevorzugen, wenn vorhanden UND Einheit bekannt.
  if (price.basePriceCt != null && price.basePriceCt > 0) {
    const bu = baseUnitFactor(price.basePriceUnit)
    if (bu) {
      return {
        centsPerBase: price.basePriceCt / bu.factor,
        dimension: bu.dimension,
        symbol: bu.symbol,
      }
    }
  }
  // 2) Fallback: selbst pro Basiseinheit rechnen.
  const packSize = buildPackSize(product)
  const meta = resolveUnitMeta(price.unit, metaMap, packSize)
  if (meta.dimension === 'count') {
    return { centsPerBase: price.priceCt, dimension: 'count', symbol: meta.symbol }
  }
  const factor = meta.toBaseFactor || 1
  return {
    centsPerBase: price.priceCt / factor,
    dimension: meta.dimension,
    symbol: meta.dimension === 'mass' ? 'g' : 'ml',
  }
}

export type CheapestRanking = {
  cheapestStoreId: string | null
  // Cent-pro-Basiseinheit je (vergleichbarem) Markt, für optionale Anzeige.
  perBaseByStore: Map<string, PricePerBase>
  // Märkte, die mangels vergleichbarer Einheit NICHT ins Ranking eingehen.
  incomparableStoreIds: string[]
}

/**
 * Bestimmt den günstigsten Markt PRO BASISEINHEIT. Es wird die größte gemeinsam
 * vergleichbare Gruppe (dimension + bei count symbol) gebildet; nur ihre Märkte
 * ranken. Angebote zählen mit (kein isReduced-Filter). Trivialfall (≤1
 * vergleichbarer Markt) → cheapestStoreId=null (kein Marker).
 */
export function rankCheapestStore(
  prices: StorePriceInfo[],
  product: PackProduct,
  metaMap: Map<string, UnitMeta>,
): CheapestRanking {
  const perBaseByStore = new Map<string, PricePerBase>()
  const incomparableStoreIds: string[] = []

  for (const p of prices) {
    const ppb = pricePerBaseUnit(p, product, metaMap)
    if (ppb) perBaseByStore.set(p.storeId, ppb)
    else incomparableStoreIds.push(p.storeId)
  }

  // Größte vergleichbare Gruppe nach Schlüssel (dimension + symbol) bilden.
  const groups = new Map<string, { storeId: string; centsPerBase: number }[]>()
  for (const [storeId, ppb] of perBaseByStore) {
    const key = `${ppb.dimension}:${ppb.symbol}`
    const arr = groups.get(key) ?? []
    arr.push({ storeId, centsPerBase: ppb.centsPerBase })
    groups.set(key, arr)
  }
  let best: { storeId: string; centsPerBase: number }[] | null = null
  for (const arr of groups.values()) {
    if (arr.length >= 2 && (!best || arr.length > best.length)) best = arr
  }

  let cheapestStoreId: string | null = null
  if (best) {
    let min = Infinity
    for (const e of best) {
      if (e.centsPerBase < min) {
        min = e.centsPerBase
        cheapestStoreId = e.storeId
      }
    }
    // Märkte, die zwar einen perBase-Wert haben, aber NICHT in der Ranking-Gruppe
    // sind (andere Dimension/Symbol), gelten als nicht vergleichbar.
    const inBest = new Set(best.map((e) => e.storeId))
    for (const storeId of perBaseByStore.keys()) {
      if (!inBest.has(storeId)) incomparableStoreIds.push(storeId)
    }
  }

  return { cheapestStoreId, perBaseByStore, incomparableStoreIds }
}
