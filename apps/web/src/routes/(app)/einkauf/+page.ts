import type { PageLoad } from './$types'

// ---------------------------------------------------------------------------
// Einkauf (Block E / M2): Übersicht der Einkauf-Runs — universeller Load.
// ---------------------------------------------------------------------------
// App-Target (SPA, kein Server): dieselbe Komposition wie +page.server.ts, aber
// gegen die On-Device-SQLite. Pi/SSR: leeres Objekt, +page.server.ts bleibt Quelle.

export const load: PageLoad = async () => {
  if (__STOQR_TARGET__ === 'app') {
    // App-Target: 1:1 Komposition wie +page.server.ts, lazy imports der App-Module.
    const { LOCAL_HOUSEHOLD_ID, sqliteSchema } = await import('@stoqr/db/sqlite')
    const { listTrips } = await import('$data/queries/shopping-trips')
    const { getDb } = await import('$data/db')
    const { asc } = await import('drizzle-orm')

    const householdId = LOCAL_HOUSEHOLD_ID
    const db = getDb() as unknown as import('@stoqr/db/sqlite').SqliteDatabase

    try {
      const [trips, storeRows] = await Promise.all([
        listTrips(householdId),
        db.query.stores.findMany({
          where: (s: any, { eq }: any) => eq(s.householdId, householdId),
          orderBy: [asc(sqliteSchema.stores.name)],
          columns: { id: true, name: true, chain: true },
        }),
      ])
      return { trips, stores: storeRows, loadError: null }
    } catch (err) {
      console.error('[einkauf] load error:', err)
      return { trips: [], stores: [], loadError: 'Einkäufe konnten nicht geladen werden.' }
    }
  }

  // Pi: Server-Load (+page.server.ts) bleibt Quelle. Leeres Objekt merged,
  // laesst die Server-Daten intakt.
  return {}
}
