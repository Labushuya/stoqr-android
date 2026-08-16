import type { PageLoad } from './$types'

export const load: PageLoad = async (event) => {
  if (__STOQR_TARGET__ === 'app') {
    // App-Target (SPA, offline): dieselbe Komposition wie +page.server.ts, aber
    // gegen die On-Device-SQLite via $data/queries/* + getDb(); lokale Identitaet
    // ueber LOCAL_HOUSEHOLD_ID statt requireHouseholdId; kein Login/redirect.
    const { LOCAL_HOUSEHOLD_ID, sqliteSchema } = await import('@stoqr/db/sqlite')
    const p = await import('$data/queries/products')
    const l = await import('$data/queries/locations')
    const h = await import('$data/queries/households')
    const { getDb } = await import('$data/db')
    const { asc } = await import('drizzle-orm')

    const householdId = LOCAL_HOUSEHOLD_ID
    const db = getDb() as unknown as import('@stoqr/db/sqlite').SqliteDatabase

    const [categories, locations, units, storeRows] = await Promise.all([
      p.getCategories(),
      l.getLocations(householdId),
      h.getUnits(householdId),
      db.query.stores.findMany({
        where: (s: any, { eq }: any) => eq(s.householdId, householdId),
        orderBy: [asc(sqliteSchema.stores.name)],
        columns: { id: true, name: true, chain: true },
      }),
    ])

    const productId = event.url.searchParams.get('productId')
    let preselectedProduct = null
    if (productId) {
      preselectedProduct = await p.getProductById(productId)
    }

    // Einbuchen aus der Einkaufsliste (2c-3): Vorbelegung + Referenz zum Listeneintrag.
    const fromShoppingItem = event.url.searchParams.get('fromShoppingItem')
    // Einbuchen aus einem Einkauf-Run (Block E): Referenz zur Trip-Position + Run.
    const fromTripItem = event.url.searchParams.get('fromTripItem')
    const tripId = event.url.searchParams.get('tripId')
    const prefillQty = event.url.searchParams.get('qty')
    const prefillUnit = event.url.searchParams.get('unit')
    const prefillStore = event.url.searchParams.get('storeId')

    return {
      categories,
      locations,
      units,
      stores: storeRows,
      preselectedProduct,
      fromShoppingItem,
      fromTripItem,
      tripId,
      prefillQty,
      prefillUnit,
      prefillStore,
    }
  }

  // Pi: Server-Load (+page.server.ts) bleibt Quelle. Leeres Objekt merged,
  // laesst die Server-Daten intakt.
  return {}
}
