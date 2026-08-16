import type { PageLoad } from './$types'

export const load: PageLoad = async () => {
  if (__STOQR_TARGET__ === 'app') {
    // App-Target: dieselbe Komposition wie +page.server.ts (nur LOAD), aber gegen
    // On-Device-SQLite. Alle App/DB-Importe lazy, damit im Pi-Bundle kein
    // $data/sqlite-Code landet.
    const { LOCAL_HOUSEHOLD_ID, sqliteSchema } = await import('@stoqr/db/sqlite')
    const { getDb } = await import('$data/db')
    const { eq, asc } = await import('drizzle-orm')

    const householdId = LOCAL_HOUSEHOLD_ID
    const db = getDb() as unknown as import('@stoqr/db/sqlite').SqliteDatabase

    // priceScrapeEnabled: isPriceScrapeEnabled ist server-only ($lib/server/scrape/globus).
    // Offline defensiv aus expiryConfig.priceScrapeEnabled lesen (default false).
    let priceScrapeEnabled = false
    try {
      const [cfg] = await db
        .select({ priceScrapeEnabled: sqliteSchema.expiryConfig.priceScrapeEnabled })
        .from(sqliteSchema.expiryConfig)
        .where(eq(sqliteSchema.expiryConfig.householdId, householdId))
        .limit(1)
      priceScrapeEnabled = cfg?.priceScrapeEnabled ?? false
    } catch {
      priceScrapeEnabled = false
    }

    try {
      const storeRows = await db.query.stores.findMany({
        where: (s: any, { eq }: any) => eq(s.householdId, householdId),
        orderBy: [asc(sqliteSchema.stores.name)],
        columns: {
          id: true,
          name: true,
          chain: true,
          address: true,
          city: true,
          latitude: true,
          longitude: true,
          scrapeUrl: true,
        },
      })

      return { stores: storeRows, priceScrapeEnabled, loadError: null }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[maerkte] load error:', msg)
      return {
        stores: [],
        priceScrapeEnabled,
        loadError: 'Märkte konnten nicht geladen werden. Bitte Seite neu laden.',
      }
    }
  }

  // Pi: Server-Load (+page.server.ts) bleibt Quelle. Leeres Objekt merged,
  // laesst die Server-Daten intakt.
  return {}
}
