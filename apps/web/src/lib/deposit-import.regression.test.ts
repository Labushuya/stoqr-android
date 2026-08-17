import { describe, it, expect } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/sqlite-proxy'
import { eq, and, inArray } from 'drizzle-orm'
import {
  sqliteSchema,
  getSqliteDdl,
  seedLocal,
  LOCAL_HOUSEHOLD_ID,
  LOCAL_USER_ID,
} from '@stoqr/db/sqlite'
import { buildEnvelope, serializeEnvelope, applyImport, type TransferSchema } from '@stoqr/db'
import { buildUnitMetaMap } from './utils/stock'
import { estimateLineCost, summarizeCosts } from './utils/prices'

const productPrices = sqliteSchema.productPrices

// Baut eine node:sqlite-DB mit dem GEFIXTEN Executor-Row-Shape (get flach).
function makeSqlite() {
  const sqlite = new DatabaseSync(':memory:')
  const exec = async (sql: string, params: unknown[], method: string) => {
    // node:sqlite bindet keine JS-Booleans/undefined -> wie der Capacitor-Plugin
    // auf 0/1 bzw. null normalisieren (reines Test-Harness-Detail).
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
  return { sqlite, db }
}

// Ein Pi-artiges Envelope (Tier "alles") mit EINEM pfandpflichtigen Produkt,
// Preis (Pfand NICHT enthalten, isCurrent, count-Einheit), Bestand + Bedarf.
function piEnvelopeWithDeposit() {
  return buildEnvelope({
    sourceSystem: 'pi',
    scope: 'alles',
    exportedAt: '2026-08-17T10:00:00.000Z',
    tables: {
      stores: [{ id: 'pi-store-1', name: 'Globus', householdId: 'pi-hh', chain: 'Globus Holding' }],
      products: [
        {
          id: 'pi-prod-A',
          name: 'Mineralwasser Classic',
          gtin: 'GTIN-DEP',
          createdBy: 'pi-user',
          hasDeposit: true,
          depositCt: 25,
          defaultUnit: 'Flasche',
        },
      ],
      productPrices: [
        {
          id: 'pi-price-1',
          productId: 'pi-prod-A',
          storeId: 'pi-store-1',
          householdId: 'pi-hh',
          priceCt: 87,
          unit: 'Flasche',
          isReduced: false,
          isCurrent: true,
          priceIncludesDeposit: false,
          status: 'confirmed',
          source: 'manual',
          recordedAt: new Date('2026-08-17T09:00:00.000Z'),
        },
      ],
      shoppingListItems: [
        {
          id: 'pi-sli-1',
          householdId: 'pi-hh',
          productId: 'pi-prod-A',
          quantity: 6,
          unit: 'Flasche',
          isChecked: false,
          source: 'manual',
        },
      ],
    },
    refs: { categories: {}, nutrientTypes: {}, units: {} },
  })
}

describe('Pfand end-to-end (Import -> App-SQLite -> Einkaufslisten-Estimate)', () => {
  it('nach Import ist Pfand in der Kostenschaetzung sichtbar', async () => {
    const { db } = makeSqlite()
    // DDL (oben in makeSqlite) hat bereits alle Spalten inkl. Pfand angelegt,
    // daher ist selfHeal hier ein No-Op — der reale App-Boot fuehrt es dennoch
    // aus (Alt-Installationen). Fuer die Reproduktion des Import-Datenpfads
    // genuegt DDL + seed + import. seedLocal nimmt die db explizit entgegen.
    await seedLocal(db as never)

    // Import ausfuehren (wie der App-Router).
    const fileText = serializeEnvelope(piEnvelopeWithDeposit())
    const res = await applyImport({
      db: db as never,
      schema: sqliteSchema as unknown as TransferSchema,
      ops: { eq, and, inArray } as never,
      fileText,
      targetHouseholdId: LOCAL_HOUSEHOLD_ID,
      targetUserId: LOCAL_USER_ID,
      newId: () => 'local-' + Math.random().toString(36).slice(2),
    })
    expect(res.inserted.products).toBe(1)
    expect(res.inserted.productPrices).toBe(1)

    // Lesen wie der App-Loader (einkaufsliste/+page.ts).
    const items = await db.query.shoppingListItems.findMany({
      where: (i, { eq }) => eq(i.householdId, LOCAL_HOUSEHOLD_ID),
      with: { product: { columns: { id: true, name: true } } },
    })
    const productIds = [...new Set(items.map((i) => i.productId).filter((p): p is string => !!p))]
    // getCurrentPricesForListProducts inline (das Query-Modul importiert $data,
    // das im rohen Vitest nicht aufloest) — identische Where-Klausel UND die
    // Boolean-Normalisierung, die der Fix im Query-Modul vornimmt (rohe .select()
    // liefert auf SQLite integer 0/1 statt boolean).
    const rawPrices = productIds.length
      ? await db
          .select({
            productId: productPrices.productId,
            storeId: productPrices.storeId,
            priceCt: productPrices.priceCt,
            unit: productPrices.unit,
            priceIncludesDeposit: productPrices.priceIncludesDeposit,
          })
          .from(productPrices)
          .where(
            and(
              eq(productPrices.householdId, LOCAL_HOUSEHOLD_ID),
              eq(productPrices.isCurrent, true),
              inArray(productPrices.productId, productIds)
            )
          )
      : []
    const prices = rawPrices.map((r) => ({ ...r, priceIncludesDeposit: Boolean(r.priceIncludesDeposit) }))
    const packs = await db.query.products.findMany({
      where: inArray(sqliteSchema.products.id, productIds),
      columns: { id: true, defaultUnit: true, defaultVolumeMl: true, defaultWeightG: true, hasDeposit: true, depositCt: true },
    })
    const units = await db.query.units.findMany({})

    // Estimate rechnen (wie die Svelte-Seite, Markt = Globus).
    const metaMap = buildUnitMetaMap(units as never)
    const pack = packs[0]
    const price = prices.find((p) => p.productId === pack?.id)
    const priceInfo = price
      ? {
          priceCt: price.priceCt,
          unit: price.unit,
          depositCt: pack?.hasDeposit ? pack.depositCt : null,
          priceIncludesDeposit: price.priceIncludesDeposit,
        }
      : null
    const est = estimateLineCost(6, 'Flasche', priceInfo, metaMap)
    const summary = summarizeCosts([est])

    expect(pack?.hasDeposit).toBe(true)
    expect(pack?.depositCt).toBe(25)
    expect(price?.priceIncludesDeposit).toBe(false)
    expect(est.depositCents).toBeGreaterThan(0)
    expect(summary.totalDepositCents).toBeGreaterThan(0)
  })
})
