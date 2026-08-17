import { describe, it, expect } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/sqlite-proxy'
import { eq, and, inArray } from 'drizzle-orm'
import { sqliteSchema, getSqliteDdl, seedLocal, LOCAL_HOUSEHOLD_ID, LOCAL_USER_ID } from '@stoqr/db/sqlite'
import { buildEnvelope, serializeEnvelope, applyImport, type TransferSchema } from '@stoqr/db'

// Regression fuer #327: der zweite Import schlug mit
// "UNIQUE constraint failed: product_nutrients" fehl. wipeUserContent loeschte
// nur products und verliess sich fuer product_nutrients/product_field_sources
// auf ON DELETE CASCADE — das feuert auf der App aber NICHT (PRAGMA foreign_keys
// ist aus). Die Alt-Kinder ueberlebten den Wipe und kollidierten beim Re-Import
// auf dem UNIQUE-Index (product_id, nutrient_type_id). Fix: Kinder explizit
// wipen. Dieser Test importiert ZWEIMAL denselben Envelope.

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

// Envelope mit einem Produkt + zwei Naehrwerten (nutrient_type per Slug aufgeloest).
function envelope() {
  return buildEnvelope({
    sourceSystem: 'pi',
    scope: 'alles',
    exportedAt: '2026-08-17T10:00:00.000Z',
    tables: {
      products: [
        { id: 'pi-prod-A', name: 'Milch', gtin: 'GTIN-A', createdBy: 'pi-user', hasDeposit: false },
      ],
      productNutrients: [
        {
          id: 'pi-pn-1',
          productId: 'pi-prod-A',
          nutrientTypeId: 'pi-nt-kcal',
          valuePer100: '42.0',
          source: 'off',
          updatedAt: new Date('2026-08-17T09:00:00.000Z'),
        },
      ],
    },
    refs: {
      categories: {},
      nutrientTypes: { 'pi-nt-kcal': 'energy_kcal' }, // Slug existiert im Seed
      units: {},
    },
  })
}

describe('Re-Import (Wipe cascade-Kinder) — #327', () => {
  it('zweimaliger Import desselben .stoqr wirft keinen UNIQUE-Fehler', async () => {
    const db = makeDb()
    await seedLocal(db as never)
    const fileText = serializeEnvelope(envelope())
    const opts = {
      db: db as never,
      schema: sqliteSchema as unknown as TransferSchema,
      ops: { eq, and, inArray } as never,
      fileText,
      targetHouseholdId: LOCAL_HOUSEHOLD_ID,
      targetUserId: LOCAL_USER_ID,
      newId: () => 'local-' + Math.random().toString(36).slice(2),
    }

    const first = await applyImport(opts)
    expect(first.inserted.productNutrients).toBe(1)

    // Zweiter Import — vor dem Fix: "UNIQUE constraint failed: product_nutrients".
    const second = await applyImport(opts)
    expect(second.inserted.productNutrients).toBe(1)

    // Genau EIN Naehrwert (kein Duplikat, keine Waise vom ersten Import).
    const nutrients = await db.query.productNutrients.findMany({})
    expect(nutrients).toHaveLength(1)
    // und genau EIN Produkt.
    const products = await db.query.products.findMany({})
    expect(products).toHaveLength(1)
  })
})
