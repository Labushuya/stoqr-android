// ---------------------------------------------------------------------------
// Bestands-Aggregation mit Einheiten-Umrechnung (reine Funktionen, testbar).
//
// Jeder Bestand (inventory_items) hat eine eigene Einheit (String = units.symbol).
// mass/volume-Einheiten werden über to_base_factor auf die Basiseinheit (g bzw. ml)
// normalisiert und summiert; count-artige Einheiten (Stück/Packung/…) sind nicht
// ineinander umrechenbar und werden je Symbol getrennt ausgewiesen.
// ---------------------------------------------------------------------------

export type Dimension = 'mass' | 'volume' | 'count'

export type UnitMeta = {
  symbol: string
  name: string
  dimension: Dimension
  toBaseFactor: number
}

// Rohform aus getUnits() — numeric-Felder kommen als String aus der DB.
export type UnitRow = {
  symbol: string
  name: string
  householdId: string | null
  dimension?: string | null
  toBaseFactor?: string | number | null
}

export type StockGroup = {
  dimension: Dimension
  totalInBase: number // Summe in Basiseinheit (g / ml / Stückzahl)
  displayValue: number // ggf. skaliert (>=1000 g -> kg)
  displayUnit: string // Symbol der Anzeige-Einheit
  displayName: string // Anzeige-Name (z.B. "Packung", "kg")
  // Einheiten v2: wenn diese (mass/volume-)Gruppe aus einem Gebinde (count→Volumen/Masse)
  // entstand, hält packCount die ursprüngliche Stückzahl + Einheit für die Dual-Anzeige
  // („3 Flasche (4,5 l)"). Sonst undefined.
  packCount?: { value: number; unit: string }
}

export type StockTotals = {
  groups: StockGroup[]
  itemCount: number // Anzahl available Bestände
}

/**
 * Baut eine Symbol → UnitMeta Map. Bei Symbol-Kollision haben Custom-Units
 * (householdId gesetzt) Vorrang vor System-Units (householdId null).
 */
export function buildUnitMetaMap(units: UnitRow[]): Map<string, UnitMeta> {
  const map = new Map<string, UnitMeta>()
  for (const u of units) {
    const existing = map.get(u.symbol)
    const isCustom = u.householdId != null
    // Custom überschreibt System; System überschreibt nichts Bestehendes.
    if (existing && !isCustom) continue
    map.set(u.symbol, {
      symbol: u.symbol,
      name: u.name,
      dimension: (u.dimension as Dimension) ?? 'count',
      toBaseFactor: u.toBaseFactor != null ? parseFloat(String(u.toBaseFactor)) : 1,
    })
  }
  return map
}

/**
 * Ist die Einheit eine count-Einheit (Stück/Flasche/Dose/…)? Pfand (G49) ist an
 * count gebunden — mass/volume (kg/l/g/ml) haben kein Pfand. Unbekanntes Symbol
 * ohne Meta gilt als count (Default in resolveUnitMeta).
 */
export function isCountUnit(unitSymbol: string | null | undefined, metaMap: Map<string, UnitMeta>): boolean {
  if (!unitSymbol) return false
  return (metaMap.get(unitSymbol)?.dimension ?? 'count') === 'count'
}

// Reihenfolge der Gruppen: count zuerst, dann mass, dann volume (deterministisch).
const DIMENSION_ORDER: Record<Dimension, number> = { count: 0, mass: 1, volume: 2 }

// ---------------------------------------------------------------------------
// Gebinde-Größe (Einheiten v2): eine count-Einheit eines Artikels (z.B. "Flasche")
// wird für Aggregation/Vergleich/Preis auf Volumen (ml) bzw. Masse (g) umgerechnet.
// packSize gilt PRO ARTIKEL und nur für dessen defaultUnit. Fehlt sie, bleibt alles
// wie bisher (count je Symbol, nicht umrechenbar).
// ---------------------------------------------------------------------------

export type PackSize = {
  unitSymbol: string // die count-Einheit, die ein Gebinde ist (z.B. "Flasche")
  baseFactor: number // 1 unitSymbol = baseFactor Basiseinheiten (ml bzw. g)
  dimension: 'mass' | 'volume'
}

/**
 * Liefert die UnitMeta für ein Symbol. Ist ein packSize für genau dieses Symbol
 * gesetzt, wird eine virtuelle Meta zurückgegeben, die das Gebinde auf mass/volume
 * abbildet (statt count). Sonst normale metaMap-Auflösung mit count/1-Fallback.
 */
export function resolveUnitMeta(
  unitSymbol: string,
  metaMap: Map<string, UnitMeta>,
  packSize?: PackSize
): UnitMeta {
  if (packSize && unitSymbol === packSize.unitSymbol) {
    return {
      symbol: unitSymbol,
      name: metaMap.get(unitSymbol)?.name ?? unitSymbol,
      dimension: packSize.dimension,
      toBaseFactor: packSize.baseFactor,
    }
  }
  return (
    metaMap.get(unitSymbol) ?? { symbol: unitSymbol, name: unitSymbol, dimension: 'count', toBaseFactor: 1 }
  )
}

/**
 * Baut aus den Artikel-Stammdaten eine PackSize — oder undefined, wenn kein Gebinde
 * hinterlegt ist. Bedingung: es ist genau eines von defaultVolumeMl/defaultWeightG > 0.
 * (numeric-Felder kommen als String aus der DB.) Volumen gewinnt, falls beide gesetzt
 * wären — die UI erzwingt aber Einzelauswahl.
 */
export function buildPackSize(product: {
  defaultUnit?: string | null
  defaultVolumeMl?: string | number | null
  defaultWeightG?: string | number | null
}): PackSize | undefined {
  const unit = product.defaultUnit
  if (!unit) return undefined
  const vol = product.defaultVolumeMl != null ? parseFloat(String(product.defaultVolumeMl)) : NaN
  const wt = product.defaultWeightG != null ? parseFloat(String(product.defaultWeightG)) : NaN
  if (Number.isFinite(vol) && vol > 0) {
    return { unitSymbol: unit, baseFactor: vol, dimension: 'volume' }
  }
  if (Number.isFinite(wt) && wt > 0) {
    return { unitSymbol: unit, baseFactor: wt, dimension: 'mass' }
  }
  return undefined
}

/**
 * Aggregiert available-Bestände zu einer nach Einheit gruppierten Gesamtsumme.
 */
export function aggregateStock(
  items: Array<{ quantity: string | number; unit: string; status: string }>,
  metaMap: Map<string, UnitMeta>,
  packSize?: PackSize
): StockTotals {
  const available = items.filter((i) => i.status === 'available')

  // Gruppierungsschlüssel: mass/volume pro Dimension zusammenfassen,
  // count pro Symbol getrennt.
  const buckets = new Map<
    string,
    { dimension: Dimension; totalInBase: number; unitSymbol: string; packCount: number }
  >()

  for (const item of available) {
    const meta = resolveUnitMeta(item.unit, metaMap, packSize)
    const qty = parseFloat(String(item.quantity)) || 0
    const key = meta.dimension === 'count' ? `count:${meta.symbol}` : meta.dimension
    // Gebinde: diese Zeile trägt zur Dual-Anzeige bei, wenn ihre Einheit die
    // packSize-Einheit ist (sie wurde per packSize nach mass/volume überführt).
    const isPack = packSize != null && item.unit === packSize.unitSymbol

    const bucket = buckets.get(key)
    if (bucket) {
      bucket.totalInBase += qty * meta.toBaseFactor
      if (isPack) bucket.packCount += qty
    } else {
      buckets.set(key, {
        dimension: meta.dimension,
        totalInBase: qty * meta.toBaseFactor,
        unitSymbol: meta.symbol,
        packCount: isPack ? qty : 0,
      })
    }
  }

  const groups: StockGroup[] = []
  for (const b of buckets.values()) {
    groups.push(toDisplayGroup(b, metaMap, packSize))
  }

  groups.sort((a, b) => {
    const d = DIMENSION_ORDER[a.dimension] - DIMENSION_ORDER[b.dimension]
    return d !== 0 ? d : a.displayUnit.localeCompare(b.displayUnit)
  })

  return { groups, itemCount: available.length }
}

// Wählt die Anzeige-Einheit einer Gruppe (mass >=1000g -> kg, volume >=1000ml -> l).
function toDisplayGroup(
  bucket: { dimension: Dimension; totalInBase: number; unitSymbol: string; packCount: number },
  metaMap: Map<string, UnitMeta>,
  packSize?: PackSize
): StockGroup {
  const { dimension, totalInBase } = bucket
  // Dual-Anzeige: nur wenn diese mass/volume-Gruppe aus einem Gebinde entstand.
  const packCount =
    packSize && bucket.packCount > 0
      ? { value: bucket.packCount, unit: nameFor(packSize.unitSymbol, metaMap, packSize.unitSymbol) }
      : undefined

  if (dimension === 'mass') {
    if (totalInBase >= 1000) {
      return { dimension, totalInBase, displayValue: totalInBase / 1000, displayUnit: 'kg', displayName: nameFor('kg', metaMap, 'kg'), packCount }
    }
    return { dimension, totalInBase, displayValue: totalInBase, displayUnit: 'g', displayName: nameFor('g', metaMap, 'g'), packCount }
  }

  if (dimension === 'volume') {
    if (totalInBase >= 1000) {
      return { dimension, totalInBase, displayValue: totalInBase / 1000, displayUnit: 'l', displayName: nameFor('l', metaMap, 'l'), packCount }
    }
    return { dimension, totalInBase, displayValue: totalInBase, displayUnit: 'ml', displayName: nameFor('ml', metaMap, 'ml'), packCount }
  }

  // count: das Symbol selbst ist die Anzeige-Einheit
  const symbol = bucket.unitSymbol
  return {
    dimension,
    totalInBase,
    displayValue: totalInBase,
    displayUnit: symbol,
    displayName: nameFor(symbol, metaMap, symbol),
  }
}

function nameFor(symbol: string, metaMap: Map<string, UnitMeta>, fallback: string): string {
  return metaMap.get(symbol)?.name ?? fallback
}

// ---------------------------------------------------------------------------
// Soll-Ist-Vergleich (Inkrement 2b)
// ---------------------------------------------------------------------------

export type TargetInput = {
  targetQuantity: string | number
  unit: string
  minQuantity?: string | number | null
}

export type TargetStatus = {
  status: 'ok' | 'below_target' | 'below_min' | 'not_comparable'
  targetInBase: number // Soll in Basiseinheit
  currentInBase: number // Ist in Basiseinheit (0 wenn keine passende Gruppe)
  minInBase: number | null
  unit: string // Soll-Einheit (Symbol)
  dimension: Dimension
}

/**
 * Vergleicht den aggregierten Ist-Bestand mit einem Soll (targetQuantity + unit + optional min).
 *
 * - mass/volume: passende Ist-Gruppe über die Dimension (via toBaseFactor umgerechnet).
 * - count: passende Ist-Gruppe nur über exakt dasselbe Symbol (nicht ineinander umrechenbar).
 * - Findet sich keine dimensionskompatible Ist-Gruppe → status 'not_comparable'.
 * Vergleich immer auf totalInBase (nicht displayValue).
 */
export function compareToTarget(
  totals: StockTotals,
  target: TargetInput,
  metaMap: Map<string, UnitMeta>,
  packSize?: PackSize
): TargetStatus {
  const meta = resolveUnitMeta(target.unit, metaMap, packSize)

  const targetQty = parseFloat(String(target.targetQuantity)) || 0
  const targetInBase = targetQty * meta.toBaseFactor
  const minQty =
    target.minQuantity != null && target.minQuantity !== ''
      ? parseFloat(String(target.minQuantity))
      : null
  const minInBase = minQty != null ? minQty * meta.toBaseFactor : null

  // Passende Ist-Gruppe finden.
  const group = totals.groups.find((g) => {
    if (meta.dimension === 'count') {
      return g.dimension === 'count' && g.displayUnit === meta.symbol
    }
    return g.dimension === meta.dimension
  })

  if (!group) {
    // Kein Ist in dieser Dimension/Einheit vorhanden → currentInBase 0,
    // aber vergleichbar (Bedarf = ganzes Soll), außer es gibt Ist in ANDEREN
    // count-Symbolen, das wir nicht verrechnen können.
    const hasIncompatibleCount =
      meta.dimension === 'count' && totals.groups.some((g) => g.dimension === 'count')
    if (hasIncompatibleCount) {
      return {
        status: 'not_comparable',
        targetInBase,
        currentInBase: 0,
        minInBase,
        unit: meta.symbol,
        dimension: meta.dimension,
      }
    }
    // Sonst: kein Bestand → unter Soll (bzw. unter Min).
    const status = minInBase != null && 0 < minInBase ? 'below_min' : 'below_target'
    return { status, targetInBase, currentInBase: 0, minInBase, unit: meta.symbol, dimension: meta.dimension }
  }

  const currentInBase = group.totalInBase
  let status: TargetStatus['status']
  if (minInBase != null && currentInBase < minInBase) status = 'below_min'
  else if (currentInBase < targetInBase) status = 'below_target'
  else status = 'ok'

  return { status, targetInBase, currentInBase, minInBase, unit: meta.symbol, dimension: meta.dimension }
}

// ---------------------------------------------------------------------------
// Inventur / Bestandskorrektur (Inkrement 2c)
// ---------------------------------------------------------------------------

export type AdjustItem = {
  id: string
  quantity: string | number
  unit: string
  status: string
  bestBeforeDate?: string | null
}

// Anzeige-angereicherte Zeile (für die editierbare Vorschau): alt→neu + Kontext.
export type AdjustLine = {
  id: string
  oldQuantity: number
  newQuantity: number
  unit: string
  bestBeforeDate: string | null
}

export type AdjustmentPlan = {
  // Zeilen, deren quantity neu gesetzt werden soll (absolute Werte in der jeweiligen Zeilen-Einheit).
  // Angereichert um oldQuantity/unit/bestBeforeDate für die Vorschau.
  updates: AdjustLine[]
  // Alle passenden available-Zeilen dieser Gruppe (FIFO-sortiert) — Grundlage für die
  // „bestehende aufstocken"-Wahl beim Korrigieren nach oben. Reine Anzeige-Info.
  relevantRows: AdjustLine[]
  // Rest, der nicht durch Reduktion abgebildet werden konnte (newTotal > Ist): > 0 = Aufstockung nötig.
  shortfallInBase: number
  // true, wenn newTotal den Ist übersteigt (Aufstocken: bestehende erhöhen ODER neue Zeile).
  needsIncrease: boolean
  // Fehlmenge in der ZIEL-Einheit (für einen Vorschlag „neue Zeile mit N"). Nur bei needsIncrease > 0.
  suggestedNewQuantity: number
}

/**
 * Plant die Anpassung der Bestände einer Dimension/Einheit-Gruppe auf einen neuen
 * Gesamt-Ist (in Basiseinheit). FIFO: älteste MHD (bzw. ohne MHD zuletzt) zuerst reduzieren.
 *
 * - Reduktion wird auf die passenden available-Zeilen verteilt (älteste zuerst).
 * - Ist der neue Wert größer als der aktuelle Ist, wird needsIncrease=true gesetzt
 *   (Aufstocken erfolgt bewusst NICHT automatisch — dafür einen Bestand anlegen).
 *
 * `groupKey`: bei count das Symbol, bei mass/volume die Dimension.
 */
export function planInventoryAdjustment(
  items: AdjustItem[],
  newTotalInBase: number,
  match: { dimension: Dimension; symbol?: string },
  metaMap: Map<string, UnitMeta>,
  packSize?: PackSize
): AdjustmentPlan {
  // Passende available-Zeilen dieser Gruppe.
  const relevant = items.filter((i) => {
    if (i.status !== 'available') return false
    const meta = resolveUnitMeta(i.unit, metaMap, packSize)
    if (match.dimension === 'count') return meta.dimension === 'count' && meta.symbol === match.symbol
    return meta.dimension === match.dimension
  })

  // FIFO-Sortierung: älteste MHD zuerst; ohne MHD ans Ende.
  const sorted = [...relevant].sort((a, b) => {
    const da = a.bestBeforeDate ?? '9999-12-31'
    const db = b.bestBeforeDate ?? '9999-12-31'
    return da < db ? -1 : da > db ? 1 : 0
  })

  const currentInBase = sorted.reduce((sum, i) => {
    const f = resolveUnitMeta(i.unit, metaMap, packSize).toBaseFactor
    return sum + (parseFloat(String(i.quantity)) || 0) * f
  }, 0)

  // Faktor der ZIEL-Einheit (für die Rückrechnung der Fehlmenge in eine „neue Zeile").
  const targetFactor = resolveUnitMeta(match.symbol ?? '', metaMap, packSize).toBaseFactor || 1

  // Alle passenden Zeilen als Anzeige-Info (FIFO-sortiert), oldQuantity = aktuelle Menge.
  const relevantRows: AdjustLine[] = sorted.map((i) => {
    const q = parseFloat(String(i.quantity)) || 0
    return { id: i.id, oldQuantity: q, newQuantity: q, unit: i.unit, bestBeforeDate: i.bestBeforeDate ?? null }
  })

  const updates: AdjustLine[] = []

  if (newTotalInBase >= currentInBase) {
    // Aufstocken: keine automatische Reduktion. Die UI bietet die Wahl
    // „bestehende Zeilen erhöhen" (relevantRows) ODER „neue Zeile" (suggestedNewQuantity).
    const shortfallInBase = newTotalInBase - currentInBase
    return {
      updates: [],
      relevantRows,
      shortfallInBase,
      needsIncrease: shortfallInBase > 0,
      suggestedNewQuantity: shortfallInBase / targetFactor,
    }
  }

  // Reduzieren: von den ältesten Zeilen abziehen, bis newTotalInBase erreicht ist.
  let toRemoveInBase = currentInBase - newTotalInBase
  for (const item of sorted) {
    if (toRemoveInBase <= 0) break
    const f = resolveUnitMeta(item.unit, metaMap, packSize).toBaseFactor
    const qty = parseFloat(String(item.quantity)) || 0
    const itemInBase = qty * f
    if (itemInBase <= toRemoveInBase) {
      // Zeile komplett leeren.
      updates.push({ id: item.id, oldQuantity: qty, newQuantity: 0, unit: item.unit, bestBeforeDate: item.bestBeforeDate ?? null })
      toRemoveInBase -= itemInBase
    } else {
      // Zeile teilweise reduzieren.
      const remainingInBase = itemInBase - toRemoveInBase
      updates.push({ id: item.id, oldQuantity: qty, newQuantity: remainingInBase / f, unit: item.unit, bestBeforeDate: item.bestBeforeDate ?? null })
      toRemoveInBase = 0
    }
  }

  return { updates, relevantRows, shortfallInBase: 0, needsIncrease: false, suggestedNewQuantity: 0 }
}

// ---------------------------------------------------------------------------
// Gebinde-Anzeige (G7): den in ml/g gespeicherten Gebinde-Wert nutzerfreundlich
// darstellen. mass >=1000 g -> kg, volume >=1000 ml -> l, sonst g/ml. Rein auf
// Basis der 1000er-Skala (Basiseinheit ist g bzw. ml).
// ---------------------------------------------------------------------------

export type PackDisplay = { value: number; unitSymbol: string; unitName: string }

/**
 * Waehlt die passende Anzeige-Einheit fuer einen Gebinde-Basiswert (ml bzw. g).
 * dimension 'mass' -> g/kg, 'volume' -> ml/l. Liefert null bei nicht-positivem
 * Wert oder count/unbekannter Dimension (= kein Gebinde).
 */
export function pickPackDisplayUnit(
  baseValue: number,
  dimension: Dimension,
  metaMap: Map<string, UnitMeta>
): PackDisplay | null {
  if (!Number.isFinite(baseValue) || baseValue <= 0) return null
  if (dimension === 'mass') {
    const sym = baseValue >= 1000 ? 'kg' : 'g'
    const value = baseValue >= 1000 ? baseValue / 1000 : baseValue
    return { value, unitSymbol: sym, unitName: nameFor(sym, metaMap, sym) }
  }
  if (dimension === 'volume') {
    const sym = baseValue >= 1000 ? 'l' : 'ml'
    const value = baseValue >= 1000 ? baseValue / 1000 : baseValue
    return { value, unitSymbol: sym, unitName: nameFor(sym, metaMap, sym) }
  }
  return null
}

/**
 * Formatiert einen Gebinde-Basiswert als „40 g" / „1,5 l" (de-DE). Leerer String
 * bei kein Gebinde. Reine Anzeige — der gespeicherte ml/g-Wert bleibt unberuehrt.
 */
export function packToDisplay(
  baseValue: number,
  dimension: Dimension,
  metaMap: Map<string, UnitMeta>
): string {
  const d = pickPackDisplayUnit(baseValue, dimension, metaMap)
  if (!d) return ''
  const num = d.value.toLocaleString('de-DE', { maximumFractionDigits: 3 })
  return `${num} ${d.unitSymbol}`
}
