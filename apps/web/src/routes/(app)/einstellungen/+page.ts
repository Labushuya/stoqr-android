import type { PageLoad } from './$types'

export const load: PageLoad = async () => {
  if (__STOQR_TARGET__ === 'app') {
    // App-Target (SPA, On-Device-SQLite): NUR die load-Shape des +page.server.ts
    // reproduzieren. Die `actions` (Werksreset etc.) bleiben im +page.server.ts.
    const { LOCAL_HOUSEHOLD_ID, sqliteSchema } = await import('@stoqr/db/sqlite')
    const { getDb } = await import('$data/db')
    const { getUnits } = await import('$data/queries/households')
    const { listCatalogMirror } = await import('$data/queries/globus-snapshots')
    const { eq, asc } = await import('drizzle-orm')

    const householdId = LOCAL_HOUSEHOLD_ID
    const db = getDb() as unknown as import('@stoqr/db/sqlite').SqliteDatabase

    const [configRows, categoryRows, unitRows, catalogMirror] = await Promise.all([
      db
        .select()
        .from(sqliteSchema.expiryConfig)
        .where(eq(sqliteSchema.expiryConfig.householdId, householdId))
        .limit(1),

      db.query.categories.findMany({
        orderBy: [asc(sqliteSchema.categories.sortOrder), asc(sqliteSchema.categories.name)],
        columns: {
          id: true,
          name: true,
          slug: true,
          icon: true,
          parentId: true,
          sortOrder: true,
          defaultExpiryToleranceDays: true,
        },
      }),

      getUnits(householdId),
      listCatalogMirror(householdId),
    ])

    const config = configRows[0] ?? {
      yellowDaysBefore: 7,
      redDaysBefore: 2,
      graceDaysAfter: 0,
      priceScrapeEnabled: false,
    }

    return {
      expiryConfig: {
        yellowDaysBefore: config.yellowDaysBefore,
        redDaysBefore: config.redDaysBefore,
        graceDaysAfter: config.graceDaysAfter,
      },
      priceScrapeEnabled: config.priceScrapeEnabled ?? false,
      catalogMirror,
      categories: categoryRows,
      units: unitRows,
    }
  }

  // Pi: Server-Load (+page.server.ts) bleibt Quelle. Leeres Objekt merged,
  // laesst die Server-Daten intakt.
  return {}
}
