import { describe, it, expect } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/sqlite-proxy'
import { eq } from 'drizzle-orm'
import { sqliteSchema, getSqliteDdl, seedLocal, LOCAL_HOUSEHOLD_ID } from '@stoqr/db/sqlite'

// Prueft die App-seitige Persistenz des Preis-Abruf-Flags direkt gegen die
// On-Device-SQLite — dieselbe Upsert-Logik wie der neue routeApp-Zweig
// /api/settings/price-scrape (der Router selbst importiert $data/$app und
// laesst sich im rohen Vitest nicht laden; die DB-Operation ist der Kern).

function makeDb() {
  const sqlite = new DatabaseSync(':memory:')
  const exec = async (sql: string, params: unknown[], method: string) => {
    const p = ((params ?? []) as unknown[]).map((v) =>
      typeof v === 'boolean' ? (v ? 1 : 0) : v === undefined ? null : v
    ) as never[]
    if (method === 'run') {
      sqlite.prepare(sql).run(...p)
      return { rows: [] as unknown[] }
    }
    const objRows = sqlite.prepare(sql).all(...p) as Array<Record<string, unknown>>
    const mapped = objRows.map((r) => Object.values(r))
    return { rows: method === 'get' ? mapped[0] : mapped }
  }
  const db = drizzle(exec as never, { schema: sqliteSchema })
  for (const stmt of getSqliteDdl()) sqlite.prepare(stmt).run()
  return db
}

async function upsertPriceScrape(db: ReturnType<typeof makeDb>, enabled: boolean) {
  await db
    .insert(sqliteSchema.expiryConfig)
    .values({ id: 'ec-' + LOCAL_HOUSEHOLD_ID, householdId: LOCAL_HOUSEHOLD_ID, priceScrapeEnabled: enabled })
    .onConflictDoUpdate({
      target: sqliteSchema.expiryConfig.householdId,
      set: { priceScrapeEnabled: enabled },
    })
}

async function readFlag(db: ReturnType<typeof makeDb>) {
  const cfg = await db.query.expiryConfig.findFirst({
    where: eq(sqliteSchema.expiryConfig.householdId, LOCAL_HOUSEHOLD_ID),
  })
  return cfg?.priceScrapeEnabled ?? null
}

describe('App price-scrape flag persistence (routeApp /api/settings/price-scrape)', () => {
  it('aktiviert, persistiert als boolean true und ist idempotent', async () => {
    const db = makeDb()
    await seedLocal(db as never)
    // seedLocal legt evtl. keine expiry_config-Zeile an -> Flag ist null/absent.
    // Der Upsert muss die Zeile anlegen bzw. aktualisieren.
    await upsertPriceScrape(db, true)
    expect(await readFlag(db)).toBe(true)

    // idempotent: zweites Aktivieren bleibt true
    await upsertPriceScrape(db, true)
    expect(await readFlag(db)).toBe(true)

    // wieder deaktivieren
    await upsertPriceScrape(db, false)
    expect(await readFlag(db)).toBe(false)
  })
})
