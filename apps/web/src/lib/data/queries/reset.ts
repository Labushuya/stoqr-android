// ---------------------------------------------------------------------------
// Werksreset (Danger-Zone A/B/C) — App-Ersatz fuer die Server-Action
// ---------------------------------------------------------------------------
// Portiert die children-first-Transaktion aus einstellungen/+page.server.ts
// (resetHousehold) gegen den Schema-Provider ($data/schema). WICHTIG fuer die
// App: PRAGMA foreign_keys ist AUS -> ON DELETE CASCADE feuert nicht. Deshalb
// werden die nur-per-Cascade abhaengigen Kinder (product_nutrients,
// product_field_sources) EXPLIZIT geloescht (analog wipeUserContent). Stufe C
// re-seedet categories + nutrient_types in derselben Transaktion.
//
// NUR fuer das App-Target gedacht (via routeApp settings/reset). Der Pi behaelt
// seine eigene, unveraenderte Server-Action (mit writeAudit).

import { getDb } from '$data/db'
import {
  inventoryItems,
  stockTargets,
  productPrices,
  productStores,
  productNutrients,
  productFieldSources,
  products,
  globusSnapshots,
  shoppingTripItems,
  shoppingTrips,
  shoppingListItems,
  bringSync,
  categoryMappings,
  expiryConfig,
  auditLog,
  invites,
  locations,
  storages,
  places,
  stores,
  units,
  nutrientTypes,
  categories,
} from '$data/schema'
import { and, eq, isNull, isNotNull } from 'drizzle-orm'
import { categorySeeds } from '@stoqr/db'
import { nutrientTypeSeeds } from '@stoqr/db'

export const RESET_PHRASES: Record<string, string> = {
  A: 'Bestand loeschen',
  B: 'Artikel und Bestand loeschen',
  C: 'stoqr zuruecksetzen',
}

export type ResetStage = 'A' | 'B' | 'C'

/**
 * Fuehrt den Werksreset der angegebenen Stufe fuer den Haushalt aus. Transaktional,
 * children-first, mit expliziter Loeschung der Cascade-Kinder (App: FKs aus).
 * Stufe C re-seedet die Referenzdaten. Kein Audit (routeApp laesst es bewusst weg).
 */
export async function resetHousehold(householdId: string, stage: ResetStage): Promise<void> {
  const db = getDb()
  const hid = householdId

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await db.transaction(async (tx: any) => {
    // Cascade-Kinder von products explizit (App: FKs aus) — bei B und C noetig.
    const wipeProductChildren = async () => {
      await tx.delete(productNutrients)
      await tx.delete(productFieldSources)
    }

    // ── Stufe A: nur Bestaende ──────────────────────────────────────────────
    await tx.delete(inventoryItems).where(eq(inventoryItems.householdId, hid))
    if (stage === 'A') return

    // ── Stufe B: + Artikel & Preise ─────────────────────────────────────────
    await tx.delete(stockTargets).where(eq(stockTargets.householdId, hid))
    await tx.delete(productPrices).where(eq(productPrices.householdId, hid))
    await tx.delete(productStores).where(eq(productStores.householdId, hid))
    await tx.delete(globusSnapshots).where(eq(globusSnapshots.householdId, hid))

    if (stage === 'B') {
      await wipeProductChildren()
      await tx.delete(products)
      return
    }

    // ── Stufe C: kompletter Werksreset ──────────────────────────────────────
    await tx.delete(shoppingTripItems).where(eq(shoppingTripItems.householdId, hid))
    await tx.delete(shoppingTrips).where(eq(shoppingTrips.householdId, hid))
    await tx.delete(shoppingListItems).where(eq(shoppingListItems.householdId, hid))
    await tx.delete(bringSync).where(eq(bringSync.householdId, hid))
    await tx.delete(categoryMappings).where(eq(categoryMappings.householdId, hid))
    await tx.delete(expiryConfig).where(eq(expiryConfig.householdId, hid))
    await tx.delete(auditLog).where(eq(auditLog.householdId, hid))
    await tx.delete(invites).where(eq(invites.householdId, hid))
    // Lager-Hierarchie: places -> storages -> locations explizit (App: FKs aus).
    await tx.delete(places)
    await tx.delete(storages)
    await tx.delete(locations).where(eq(locations.householdId, hid))
    await tx.delete(stores).where(eq(stores.householdId, hid))
    await tx.delete(units).where(and(eq(units.householdId, hid), eq(units.isSystem, false)))
    await wipeProductChildren()
    await tx.delete(products)
    // Referenzdaten (self-ref) children-first.
    await tx.delete(nutrientTypes).where(isNotNull(nutrientTypes.parentId))
    await tx.delete(nutrientTypes).where(isNull(nutrientTypes.parentId))
    await tx.delete(categories).where(isNotNull(categories.parentId))
    await tx.delete(categories).where(isNull(categories.parentId))

    // ── Auto-Re-Seed (gleiche Daten wie seedLocal-Seeds) ────────────────────
    await tx.insert(categories).values(
      categorySeeds.map((s) => ({
        slug: s.slug,
        name: s.name,
        icon: s.icon,
        defaultExpiryToleranceDays: s.defaultExpiryToleranceDays ?? 0,
        sortOrder: s.sortOrder,
        parentId: null,
      })),
    )
    const seedRoots = nutrientTypeSeeds.filter((s) => s.parentSlug === null)
    await tx.insert(nutrientTypes).values(
      seedRoots.map((s) => ({
        slug: s.slug,
        name: s.name,
        unit: s.unit,
        parentId: null,
        sortOrder: s.sortOrder,
        offKey: s.offKey,
      })),
    )
    const seedChildren = nutrientTypeSeeds.filter((s) => s.parentSlug !== null)
    if (seedChildren.length > 0) {
      const insertedRoots = await tx.query.nutrientTypes.findMany()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const slugToId = new Map(insertedRoots.map((r: any) => [r.slug, r.id]))
      await tx.insert(nutrientTypes).values(
        seedChildren.map((s) => {
          const parentId = slugToId.get(s.parentSlug!)
          if (!parentId) {
            throw new Error(`Re-Seed: parentSlug "${s.parentSlug}" fuer "${s.slug}" nicht aufloesbar`)
          }
          return {
            slug: s.slug,
            name: s.name,
            unit: s.unit,
            parentId: parentId as string,
            sortOrder: s.sortOrder,
            offKey: s.offKey,
          }
        }),
      )
    }
  })
}
