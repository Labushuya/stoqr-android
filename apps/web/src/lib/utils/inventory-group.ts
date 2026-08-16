// ---------------------------------------------------------------------------
// Inventar-Ansicht „nach Artikel" (G39): fasst einzelne Bestände (inventory_items)
// je Artikel (product.id) zu einer Gruppe zusammen. Reine Funktion (DB-frei) —
// baut auf aggregateStock/buildPackSize (stock.ts) auf und ist damit unit-testbar.
//
// aggregateStock filtert intern auf status==='available' → die aggregierte
// Gesamtmenge zählt nur verfügbare Bestände. availableCount + earliestBestBefore
// nutzen bewusst DIESELBE available-Teilmenge, damit Menge/Badge/Ampel konsistent
// bleiben.
// ---------------------------------------------------------------------------

import { aggregateStock, buildPackSize, type StockTotals, type UnitMeta } from './stock'

// Minimal-Form eines Bestands, die die Gruppierung braucht. Bewusst schmal
// gehalten (strukturelles Subtyping) — die UI reicht ihre reicheren Items durch.
export type GroupableItem = {
  quantity: string | number
  unit: string
  status: string
  bestBeforeDate: string | null
  product: {
    id: string
    name: string
    defaultUnit?: string | null
    defaultVolumeMl?: string | number | null
    defaultWeightG?: string | number | null
    hasDeposit?: boolean
    depositCt?: number | null
  }
}

export type ProductGroup<T extends GroupableItem> = {
  product: T['product']
  items: T[] // alle Bestände dieses Artikels (in Eingabe-Reihenfolge, i.d.R. nach MHD)
  totals: StockTotals // aggregierte Gesamtmenge (nur available)
  availableCount: number // Anzahl Bestände mit status==='available'
  earliestBestBefore: string | null // frühestes MHD der verfügbaren Bestände (null = keins)
}

/**
 * Gruppiert Bestände nach product.id und aggregiert je Gruppe.
 *
 * Sortierung der Gruppen: frühestes MHD zuerst (verfügbare Bestände), Gruppen
 * ohne MHD ans Ende, bei Gleichstand alphabetisch nach Name. Das spiegelt die
 * Bestandssortierung (asc bestBeforeDate) auf Artikel-Ebene.
 */
export function groupInventoryByProduct<T extends GroupableItem>(
  items: T[],
  unitMetaMap: Map<string, UnitMeta>
): ProductGroup<T>[] {
  // Bucketiere nach product.id — Einfügereihenfolge der Buckets erhält die
  // (bereits nach MHD sortierte) Reihenfolge der Items.
  const buckets = new Map<string, T[]>()
  for (const item of items) {
    const id = item.product.id
    const bucket = buckets.get(id)
    if (bucket) bucket.push(item)
    else buckets.set(id, [item])
  }

  const groups: ProductGroup<T>[] = []
  for (const bucket of buckets.values()) {
    const product = bucket[0].product
    const packSize = buildPackSize(product)
    const totals = aggregateStock(bucket, unitMetaMap, packSize)

    const availableItems = bucket.filter((i) => i.status === 'available')
    const availableCount = availableItems.length

    let earliestBestBefore: string | null = null
    for (const i of availableItems) {
      if (i.bestBeforeDate == null) continue
      if (earliestBestBefore == null || i.bestBeforeDate < earliestBestBefore) {
        earliestBestBefore = i.bestBeforeDate
      }
    }

    groups.push({ product, items: bucket, totals, availableCount, earliestBestBefore })
  }

  // Sortierung: frühestes MHD zuerst; ohne MHD ans Ende; dann Name.
  groups.sort((a, b) => {
    const da = a.earliestBestBefore ?? '9999-12-31'
    const db = b.earliestBestBefore ?? '9999-12-31'
    if (da !== db) return da < db ? -1 : 1
    return a.product.name.localeCompare(b.product.name)
  })

  return groups
}
