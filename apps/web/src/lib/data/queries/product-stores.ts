import { getDb } from '$data/db'
import { productStores } from '$data/schema'
import { eq } from 'drizzle-orm'

// ---------------------------------------------------------------------------
// product_stores (M:N Artikel<->Markt) — "hier planbar erhältlich".
// Herkunfts-Markt eines Bestands bleibt an inventory_items.storeId.
// ---------------------------------------------------------------------------

// Alle Märkte, denen ein Artikel zugeordnet ist (im Haushalt).
export async function listStoresForProduct(productId: string, householdId: string) {
  const db = getDb()
  const rows = await db.query.productStores.findMany({
    where: (ps, { and, eq }) => and(eq(ps.productId, productId), eq(ps.householdId, householdId)),
    with: { store: { columns: { id: true, name: true, chain: true } } },
  })
  return rows
}

// Alle Artikel-IDs, die einem Markt zugeordnet sind.
export async function listProductIdsForStore(storeId: string, householdId: string) {
  const db = getDb()
  const rows = await db.query.productStores.findMany({
    where: (ps, { and, eq }) => and(eq(ps.storeId, storeId), eq(ps.householdId, householdId)),
    columns: { productId: true },
  })
  return rows.map((r) => r.productId)
}

/**
 * Setzt die Markt-Zuordnung eines Artikels auf genau die übergebene storeId-Liste
 * (fügt fehlende hinzu, entfernt nicht mehr gewünschte).
 */
export async function setStoresForProduct(productId: string, householdId: string, storeIds: string[]) {
  const db = getDb()
  const desired = new Set(storeIds)
  const current = await db.query.productStores.findMany({
    where: (ps, { and, eq }) => and(eq(ps.productId, productId), eq(ps.householdId, householdId)),
  })
  const currentIds = new Set(current.map((c) => c.storeId))

  // Entfernen, was nicht mehr gewünscht ist.
  for (const c of current) {
    if (!desired.has(c.storeId)) {
      await db.delete(productStores).where(eq(productStores.id, c.id))
    }
  }
  // Hinzufügen, was neu ist.
  for (const storeId of desired) {
    if (!currentIds.has(storeId)) {
      await db
        .insert(productStores)
        .values({ productId, storeId, householdId })
        .onConflictDoNothing({
          target: [productStores.productId, productStores.storeId, productStores.householdId],
        })
    }
  }
  return listStoresForProduct(productId, householdId)
}

/**
 * Fügt EINEN Markt ergänzend zur Artikel-Zuordnung hinzu (ohne bestehende zu
 * entfernen). Idempotent. Genutzt vom Einbuchen (easy-add): der Ist-Herkunftsmarkt
 * eines Bestands wird zusätzlich als Bezugsquelle am Artikel gemerkt.
 */
export async function addStoreForProduct(productId: string, householdId: string, storeId: string) {
  const db = getDb()
  await db
    .insert(productStores)
    .values({ productId, storeId, householdId })
    .onConflictDoNothing({
      target: [productStores.productId, productStores.storeId, productStores.householdId],
    })
}
