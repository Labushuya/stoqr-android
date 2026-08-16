import { redirect } from '@sveltejs/kit'
import { requireHouseholdId, getUnits } from '$lib/server/queries/households'
import { getShoppingList } from '$lib/server/queries/shopping-list'
import { listTrips } from '$lib/server/queries/shopping-trips'
import { getCurrentPricesForListProducts } from '$lib/server/queries/prices'
import { getDb } from '$lib/server/db'
import { stores, products } from '@stoqr/db'
import { asc, inArray } from 'drizzle-orm'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ locals }) => {
  const db = getDb()
  if (!locals.user) redirect(302, '/login')
  const householdId = await requireHouseholdId(locals.user.id)
  try {
    const [items, units, storeRows, trips] = await Promise.all([
      getShoppingList(householdId),
      getUnits(householdId),
      db.query.stores.findMany({
        where: (s, { eq }) => eq(s.householdId, householdId),
        orderBy: [asc(stores.name)],
        columns: { id: true, name: true, chain: true },
      }),
      listTrips(householdId),
    ])
    // Aktuelle Preise (alle Märkte) der Listen-Produkte — Client rechnet reaktiv je Markt.
    const productIds = [...new Set(items.map((i) => i.productId).filter((p): p is string => !!p))]
    const prices = await getCurrentPricesForListProducts(householdId, productIds)
    // Gebinde-Felder der Listen-Produkte (für die client-seitige Estimate-Umrechnung).
    const packs = productIds.length
      ? await db.query.products.findMany({
          where: inArray(products.id, productIds),
          columns: { id: true, defaultUnit: true, defaultVolumeMl: true, defaultWeightG: true, hasDeposit: true, depositCt: true },
        })
      : []
    return { items, units, stores: storeRows, trips, prices, packs, loadError: null }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[einkaufsliste] load error:', msg)
    return { items: [], units: [], stores: [], trips: [], prices: [], packs: [], loadError: 'Einkaufsliste konnte nicht geladen werden.' }
  }
}
