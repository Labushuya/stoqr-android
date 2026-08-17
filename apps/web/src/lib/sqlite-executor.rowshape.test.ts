// ---------------------------------------------------------------------------
// sqlite-executor.rowshape.test.ts — Row-Shape-Kontrakt des App-Executors
// ---------------------------------------------------------------------------
// Regression fuer den 404-Bug nach Import (#324): sqlite-proxy erwartet je nach
// method unterschiedliche Row-Formen. Fuer 'get' MUSS der Executor die EINE
// Zeile FLACH liefern (Werte-Array bzw. undefined), NICHT Array-of-Arrays -
// sonst kommen relationale findFirst(with:{...})-Relationen doppelt verschachtelt
// an und die Relation (z.B. item.product) ist undefined -> Detailseite 404.
//
// Der Test baut denselben Executor-Vertrag wie boot.app.ts (nur die native
// Capacitor-Connection ist hier durch node:sqlite ersetzt) und prueft:
//   1) findFirst mit verschachteltem with:{product:{...}} liefert item.product.
//   2) findFirst ohne Treffer liefert undefined (legitimer 404 bleibt erhalten).

import { describe, it, expect } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/sqlite-proxy'
import { eq, and, asc } from 'drizzle-orm'
import { sqliteSchema, getSqliteDdl } from '@stoqr/db/sqlite'

// Spiegelt die Row-Shape-Logik aus boot.app.ts makeExecutor EXAKT wider.
function makeDb() {
  const sqlite = new DatabaseSync(':memory:')
  const executor = async (sql: string, params: unknown[], method: string) => {
    if (method === 'run') {
      sqlite.prepare(sql).run(...((params ?? []) as never[]))
      return { rows: [] as unknown[] }
    }
    const objRows = sqlite.prepare(sql).all(...((params ?? []) as never[])) as Array<
      Record<string, unknown>
    >
    const mapped = objRows.map((row) => Object.values(row))
    // Der Vertrag unter Test: 'get' flach (mapped[0]), sonst Array-of-Arrays.
    const rows = method === 'get' ? mapped[0] : mapped
    return { rows }
  }
  const db = drizzle(executor as never, { schema: sqliteSchema as never })
  for (const stmt of getSqliteDdl()) sqlite.prepare(stmt).run()
  return { sqlite, db }
}

function seed(sqlite: DatabaseSync) {
  const now = 1_700_000_000_000
  sqlite.prepare(`INSERT INTO households (id,name,created_at) VALUES ('hh','Die Merbotts',${now})`).run()
  sqlite.prepare(`INSERT INTO users (id,display_name,created_at,updated_at) VALUES ('u1','X',${now},${now})`).run()
  sqlite
    .prepare(
      `INSERT INTO products (id,name,created_by,has_deposit,created_at,updated_at) VALUES ('p1','Milch','u1',0,${now},${now})`
    )
    .run()
  sqlite
    .prepare(
      `INSERT INTO inventory_items (id,product_id,household_id,quantity,status,created_at,updated_at) VALUES ('i1','p1','hh',2,'available',${now},${now})`
    )
    .run()
}

describe('App-SQLite Executor Row-Shape (sqlite-proxy get vs all)', () => {
  it('findFirst mit verschachteltem with liefert die Relation (item.product)', async () => {
    const { sqlite, db } = makeDb()
    seed(sqlite)
    const s = sqliteSchema as never as {
      inventoryItems: { id: never; householdId: never }
      productNutrients: { nutrientTypeId: never }
    }
    // @ts-expect-error dynamischer Relations-Query
    const item = await db.query.inventoryItems.findFirst({
      where: and(eq(s.inventoryItems.id, 'i1'), eq(s.inventoryItems.householdId, 'hh')),
      with: {
        product: {
          with: {
            nutrients: { with: { nutrientType: true }, orderBy: asc(s.productNutrients.nutrientTypeId) },
            category: true,
          },
        },
      },
    })
    expect(item).toBeTruthy()
    expect(item?.product).toBeTruthy()
    expect(item?.product?.name).toBe('Milch')
    expect(item?.product?.nutrients).toEqual([])
  })

  it('findFirst ohne Treffer liefert undefined (legitimer 404 bleibt)', async () => {
    const { db } = makeDb()
    const s = sqliteSchema as never as { inventoryItems: { id: never } }
    // @ts-expect-error dynamischer Relations-Query
    const item = await db.query.inventoryItems.findFirst({
      where: eq(s.inventoryItems.id, 'DOES-NOT-EXIST'),
      with: { product: true },
    })
    expect(item).toBeUndefined()
  })
})
