import { error } from '@sveltejs/kit'
import type { PageLoad } from './$types'
import type { LineEstimate } from '$lib/utils/prices'

// ---------------------------------------------------------------------------
// Einkauf-Detail (Block E / M2) — universeller Load fuer das App-Target (SPA).
//
// Pi/SSR: leeres Objekt -> +page.server.ts bleibt die Datenquelle.
// App-Target: dieselbe Komposition wie +page.server.ts, aber gegen die
// On-Device-SQLite (getDb() liefert die injizierte SQLite-Instanz) und mit
// LOCAL_HOUSEHOLD_ID statt requireHouseholdId(). Alle App-spezifischen
// Query/DB-Importe sind lazy (await import), damit im Pi-Bundle kein
// $data/sqlite-Code landet.
// ---------------------------------------------------------------------------

export const load: PageLoad = async (event) => {
  if (__STOQR_TARGET__ === 'app') {
    const { LOCAL_HOUSEHOLD_ID, sqliteSchema } = await import('@stoqr/db/sqlite')
    const { getDb } = await import('$data/db')
    const { getTrip } = await import('$data/queries/shopping-trips')
    const { getUnits } = await import('$data/queries/households')
    const { getCurrentPricesForProducts } = await import('$data/queries/prices')
    const { buildUnitMetaMap, buildPackSize } = await import('$lib/utils/stock')
    const { estimateLineCost, summarizeCosts } = await import('$lib/utils/prices')
    const { inArray } = await import('drizzle-orm')

    const householdId = LOCAL_HOUSEHOLD_ID
    const db = getDb() as unknown as import('@stoqr/db/sqlite').SqliteDatabase

    const [trip, units] = await Promise.all([getTrip(event.params.id, householdId), getUnits(householdId)])
    if (!trip) error(404, 'Einkauf nicht gefunden')

    // Kosten-Schätzung: nur wenn der Run einem Markt zugeordnet ist.
    const estimates: Record<string, LineEstimate> = {}
    let costSummary: ReturnType<typeof summarizeCosts> | null = null
    if (trip.storeId) {
      const productIds = trip.items.map((i) => i.productId).filter((p): p is string => !!p)
      const priceMap = await getCurrentPricesForProducts(productIds, trip.storeId, householdId)
      // Gebinde-Größen der beteiligten Produkte (Batch) → packSize je Position.
      const packRows = productIds.length
        ? await db.query.products.findMany({
            where: inArray(sqliteSchema.products.id, productIds),
            columns: { id: true, defaultUnit: true, defaultVolumeMl: true, defaultWeightG: true, hasDeposit: true, depositCt: true },
          })
        : []
      const packByProduct = new Map(packRows.map((p) => [p.id, buildPackSize(p)]))
      const depositByProduct = new Map(packRows.map((p) => [p.id, p.hasDeposit ? p.depositCt : null]))
      const metaMap = buildUnitMetaMap(units)
      const lines: LineEstimate[] = []
      for (const it of trip.items) {
        const price = it.productId ? priceMap.get(it.productId) : undefined
        const packSize = it.productId ? packByProduct.get(it.productId) : undefined
        const est = estimateLineCost(
          Number(it.quantity),
          it.unit,
          price
            ? {
                priceCt: price.priceCt,
                unit: price.unit,
                depositCt: it.productId ? depositByProduct.get(it.productId) ?? null : null,
                priceIncludesDeposit: price.priceIncludesDeposit,
              }
            : null,
          metaMap,
          packSize,
        )
        estimates[it.id] = est
        lines.push(est)
      }
      costSummary = summarizeCosts(lines)
    }

    return { trip, units, estimates, costSummary }
  }

  return {}
}
