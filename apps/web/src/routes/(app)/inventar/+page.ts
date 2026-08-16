import type { PageLoad } from './$types'

export const load: PageLoad = async (event) => {
  if (__STOQR_TARGET__ === 'app') {
    // App-Target: dieselbe Komposition wie +page.server.ts, aber gegen die
    // On-Device-SQLite. Alle App-spezifischen Query/DB-Importe lazy, damit im
    // Pi-Bundle kein $data/sqlite-Code landet.
    const { LOCAL_HOUSEHOLD_ID, sqliteSchema } = await import('@stoqr/db/sqlite')
    const p = await import('$data/queries/products')
    const l = await import('$data/queries/locations')
    const h = await import('$data/queries/households')
    const { getDb } = await import('$data/db')
    const { eq } = await import('drizzle-orm')

    const db = getDb() as unknown as import('@stoqr/db/sqlite').SqliteDatabase
    const householdId = LOCAL_HOUSEHOLD_ID
    const placeId = event.url.searchParams.get('placeId') ?? undefined

    const [items, locations, units, categories, cfg] = await Promise.all([
      // Alle Status laden, damit der „Nur verfuegbare"-Toggle clientseitig wirkt.
      p.getInventoryItems(householdId, { placeId, allStatuses: true }),
      l.getLocations(householdId),
      h.getUnits(householdId),
      p.getCategories(),
      db.query.expiryConfig.findFirst({
        where: eq(sqliteSchema.expiryConfig.householdId, householdId),
      }),
    ])
    const expirySettings = {
      yellowDaysBefore: cfg?.yellowDaysBefore ?? 7,
      redDaysBefore: cfg?.redDaysBefore ?? 2,
      graceDaysAfter: cfg?.graceDaysAfter ?? 0,
    }
    return { items, locations, units, categories, expirySettings }
  }

  // Pi: Server-Load (+page.server.ts) bleibt Quelle. Leeres Objekt merged,
  // laesst die Server-Daten intakt.
  return {}
}
