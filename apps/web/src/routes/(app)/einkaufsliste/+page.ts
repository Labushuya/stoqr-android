import type { PageLoad } from './$types'

export const load: PageLoad = async () => {
  if (__STOQR_TARGET__ === 'app') {
    // App-Target (SPA, offline): dieselbe Komposition wie +page.server.ts, aber
    // gegen die On-Device-SQLite ($data/queries/*) und mit lokaler Identitaet.
    const { LOCAL_HOUSEHOLD_ID, sqliteSchema } = await import('@stoqr/db/sqlite')
    const { getShoppingList } = await import('$data/queries/shopping-list')
    const { getUnits } = await import('$data/queries/households')
    const { listTrips } = await import('$data/queries/shopping-trips')
    const { getCurrentPricesForListProducts } = await import('$data/queries/prices')
    const { getDb } = await import('$data/db')
    const { asc, inArray } = await import('drizzle-orm')

    const householdId = LOCAL_HOUSEHOLD_ID
    const db = getDb() as unknown as import('@stoqr/db/sqlite').SqliteDatabase

    try {
      const [items, units, storeRows, trips] = await Promise.all([
        getShoppingList(householdId),
        getUnits(householdId),
        db.query.stores.findMany({
          where: (s, { eq }) => eq(s.householdId, householdId),
          orderBy: [asc(sqliteSchema.stores.name)],
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
            where: inArray(sqliteSchema.products.id, productIds),
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

  // Pi: Server-Load (+page.server.ts) bleibt Quelle. Leeres Objekt merged,
  // laesst die Server-Daten intakt.
  return {}
}
