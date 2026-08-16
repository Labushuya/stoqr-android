import { redirect, error } from '@sveltejs/kit'
import { requireHouseholdId, getUnits } from '$lib/server/queries/households'
import { getTrip } from '$lib/server/queries/shopping-trips'
import { getCurrentPricesForProducts } from '$lib/server/queries/prices'
import { buildUnitMetaMap, buildPackSize } from '$lib/utils/stock'
import { estimateLineCost, summarizeCosts, type LineEstimate } from '$lib/utils/prices'
import { getDb } from '$lib/server/db'
import { products } from '@stoqr/db'
import { inArray } from 'drizzle-orm'
import type { PageServerLoad } from './$types'

// ---------------------------------------------------------------------------
// Einkauf-Detail (Block E / M2): Positionen eines Runs, Status-Aktionen, Einbuchen.
// Block F: Kosten-Schätzung je Position + Summe (wenn der Run einem Markt zugeordnet ist).
// Einheiten v2: Gebinde-Größe je Position-Produkt fließt in die Schätzung ein.
// ---------------------------------------------------------------------------

export const load: PageServerLoad = async ({ locals, params }) => {
  const db = getDb()
  if (!locals.user) redirect(302, '/login')
  const householdId = await requireHouseholdId(locals.user.id)

  const [trip, units] = await Promise.all([getTrip(params.id, householdId), getUnits(householdId)])
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
          where: inArray(products.id, productIds),
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
