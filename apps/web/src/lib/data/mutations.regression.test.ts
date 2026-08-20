import { describe, it, expect, beforeEach } from 'vitest'
import { sqliteSchema, seedLocal, LOCAL_HOUSEHOLD_ID, LOCAL_USER_ID } from '@stoqr/db/sqlite'
import { makeSqliteDb, sawPostgresSql, type MadeDb } from '../test-support/make-sqlite-db'
import { setDb } from '$data/db'
import { setSchema } from '$data/schema'
import { createCategory } from '$data/queries/categories'
import { createCategoryMapping } from '$data/queries/category-mapping'
import { createProduct, createInventoryItem, setFieldSources } from '$data/queries/products'
import { upsertStockTarget } from '$data/queries/stock-targets'
import { recordPrice } from '$data/queries/prices'
import { setStoresForProduct } from '$data/queries/product-stores'
import { createLocation, createStorage, createPlace } from '$data/queries/locations'
import { deleteProductWithInventory } from '$data/queries/products'
import { resetHousehold } from '$data/queries/reset'

// Ganzheitliche Regression fuer ROOT A: die geteilten $data/queries-Fns muessen
// auf der On-Device-SQLite laufen (Schema-Provider auf sqliteSchema), ohne
// Postgres-SQL (gen_random_uuid()/now()) und mit generierten non-null ids.
// Exakt die vom Nutzer gemeldeten Schreib-Pfade.

const HH = LOCAL_HOUSEHOLD_ID
let made: MadeDb

async function seedStore(made: MadeDb, id = 'store-1') {
  // ein Markt fuer Preis/Markt-Zuordnung (inline, da store-create woanders getestet)
  made.sqlite
    .prepare(
      `INSERT INTO stores (id,name,household_id,created_at) VALUES ('${id}','Globus','${HH}',1700000000000)`,
    )
    .run()
  return id
}

beforeEach(async () => {
  made = makeSqliteDb()
  setSchema(sqliteSchema as never)
  setDb(made.db as never)
  await seedLocal(made.db as never) // Haushalt + System-Units + Seed-Kategorien/Naehrwerte
})

function assertClean() {
  expect(sawPostgresSql(made.seenSql), 'kein Postgres-SQL an SQLite').toBe(false)
}

describe('App-Mutationen gegen On-Device-SQLite (ROOT A)', () => {
  it('createCategory (Haupt + Unter)', async () => {
    const main = await createCategory({ name: 'Getraenke', icon: '🥤', parentId: null })
    expect(main.id).toBeTruthy()
    const sub = await createCategory({ name: 'Limo', icon: '🥤', parentId: main.id })
    expect(sub.id).toBeTruthy()
    expect(sub.parentId).toBe(main.id)
    assertClean()
  })

  it('createCategoryMapping', async () => {
    const cat = await createCategory({ name: 'Getraenke', parentId: null })
    const res = await createCategoryMapping(HH, { source: 'globus', token: 'Getränke', categoryId: cat.id })
    expect(res.ok).toBe(true)
    assertClean()
  })

  it('createProduct + setFieldSources (Pfand)', async () => {
    const pid = await createProduct({ name: 'Bier', hasDeposit: true, depositCt: 8, createdBy: LOCAL_USER_ID })
    expect(typeof pid).toBe('string')
    await setFieldSources(pid, { name: 'manual', deposit: 'manual' })
    // has_deposit landete korrekt
    const [row] = made.sqlite.prepare(`SELECT has_deposit, deposit_ct FROM products WHERE id = ?`).all(pid) as Array<{ has_deposit: number; deposit_ct: number }>
    expect(row.has_deposit).toBe(1)
    expect(row.deposit_ct).toBe(8)
    assertClean()
  })

  it('createInventoryItem (neue Bestandszeile)', async () => {
    const pid = await createProduct({ name: 'Bier', createdBy: LOCAL_USER_ID })
    const inv = await createInventoryItem({
      productId: pid,
      householdId: HH,
      quantity: 1,
      unit: 'Flasche',
      bestBeforeDate: '2026-08-20',
    })
    expect(inv.id).toBeTruthy()
    expect(inv.productId).toBe(pid)
    assertClean()
  })

  it('upsertStockTarget (Soll-/Mindestbestand)', async () => {
    const pid = await createProduct({ name: 'Bier', createdBy: LOCAL_USER_ID })
    const t = await upsertStockTarget({ productId: pid, householdId: HH, targetQuantity: 2, unit: 'Flasche', minQuantity: 1 })
    expect(t?.id).toBeTruthy()
    // idempotenter zweiter Upsert (on conflict update)
    const t2 = await upsertStockTarget({ productId: pid, householdId: HH, targetQuantity: 3, unit: 'Flasche', minQuantity: null })
    expect(String(t2?.targetQuantity)).toBe('3')
    assertClean()
  })

  it('recordPrice (Preis-Aenderung, transaktional)', async () => {
    const pid = await createProduct({ name: 'Bier', createdBy: LOCAL_USER_ID })
    const store = await seedStore(made)
    const row = await recordPrice({
      householdId: HH,
      productId: pid,
      storeId: store,
      priceCt: 89,
      unit: 'Flasche',
      isReduced: false,
      priceIncludesDeposit: false,
      source: 'manual',
    })
    expect(row.id).toBeTruthy()
    expect(row.isCurrent).toBe(true)
    assertClean()
  })

  it('setStoresForProduct (Markt-Zuordnung)', async () => {
    const pid = await createProduct({ name: 'Bier', createdBy: LOCAL_USER_ID })
    const store = await seedStore(made)
    await setStoresForProduct(pid, HH, [store])
    // Junction-Zeile vorhanden
    const rows = made.sqlite.prepare(`SELECT product_id, store_id FROM product_stores WHERE product_id = ?`).all(pid)
    expect(rows).toHaveLength(1)
    assertClean()
  })

  it('createLocation/Storage/Place (Raeume)', async () => {
    const loc = await createLocation({ householdId: HH, name: 'Kueche', icon: '🍳' })
    expect(loc.id).toBeTruthy()
    const sto = await createStorage({ locationId: loc.id, name: 'Kuehlschrank' })
    expect(sto.id).toBeTruthy()
    const place = await createPlace({ storageId: sto.id, name: 'Fach 1' })
    expect(place.id).toBeTruthy()
    assertClean()
  })

  it('deleteProductWithInventory ("Alles loeschen", inkl. Kinder)', async () => {
    const pid = await createProduct({ name: 'Bier', createdBy: LOCAL_USER_ID })
    await createInventoryItem({ productId: pid, householdId: HH, quantity: 2, unit: 'Flasche' })
    await setFieldSources(pid, { name: 'manual' })
    await deleteProductWithInventory(pid, HH)
    // Produkt + Bestand + Feldquellen weg (keine Waisen).
    const prod = made.sqlite.prepare(`SELECT id FROM products WHERE id = ?`).all(pid)
    const inv = made.sqlite.prepare(`SELECT id FROM inventory_items WHERE product_id = ?`).all(pid)
    const fs = made.sqlite.prepare(`SELECT id FROM product_field_sources WHERE product_id = ?`).all(pid)
    expect(prod).toHaveLength(0)
    expect(inv).toHaveLength(0)
    expect(fs).toHaveLength(0)
    assertClean()
  })

  it('resetHousehold Stufe C (Werksreset + Re-Seed)', async () => {
    // etwas Content anlegen
    const pid = await createProduct({ name: 'Bier', createdBy: LOCAL_USER_ID })
    await createInventoryItem({ productId: pid, householdId: HH, quantity: 2, unit: 'Flasche' })
    await createLocation({ householdId: HH, name: 'Kueche' })
    await resetHousehold(HH, 'C')
    // Content weg, Referenzdaten re-seeded (Kategorien + Naehrwerte wieder da).
    expect(made.sqlite.prepare(`SELECT id FROM products`).all()).toHaveLength(0)
    expect(made.sqlite.prepare(`SELECT id FROM inventory_items`).all()).toHaveLength(0)
    expect(made.sqlite.prepare(`SELECT id FROM locations`).all()).toHaveLength(0)
    const cats = made.sqlite.prepare(`SELECT id FROM categories`).all()
    const nts = made.sqlite.prepare(`SELECT id FROM nutrient_types`).all()
    expect(cats.length).toBeGreaterThan(0)
    expect(nts.length).toBeGreaterThan(0)
    assertClean()
  })
})
