import { redirect, fail } from '@sveltejs/kit'
import { getDb } from '$lib/server/db'
import {
  expiryConfig,
  categories,
  inventoryItems,
  stockTargets,
  productPrices,
  productStores,
  globusSnapshots,
  products,
  shoppingTripItems,
  shoppingTrips,
  shoppingListItems,
  bringSync,
  categoryMappings,
  auditLog,
  invites,
  locations,
  stores,
  units,
  nutrientTypes,
  categorySeeds,
  nutrientTypeSeeds,
} from '@stoqr/db'
import { eq, asc, and, isNotNull, isNull } from 'drizzle-orm'
import { requireHouseholdId, getUnits } from '$lib/server/queries/households'
import { listCatalogMirror } from '$lib/server/queries/globus-snapshots'
import { writeAudit } from '$lib/server/queries/audit'
import type { PageServerLoad, Actions } from './$types'

// ---------------------------------------------------------------------------
// Danger Zone: dreistufiger Werksreset (G53).
//
// Feste Bestaetigungsphrasen je Stufe (GitHub-Style type-to-confirm). ASCII,
// damit sie ohne Sonderzeichen zuverlaessig tippbar sind. Der Client zeigt die
// erwartete Phrase im Modal; der Server verifiziert sie erneut (Trust-Boundary).
// ---------------------------------------------------------------------------

const RESET_PHRASES: Record<string, string> = {
  A: 'Bestand loeschen',
  B: 'Artikel und Bestand loeschen',
  C: 'stoqr zuruecksetzen',
}

export const load: PageServerLoad = async ({ locals }) => {
  const db = getDb()
  if (!locals.user) redirect(302, '/login')

  const householdId = await requireHouseholdId(locals.user.id)

  const [configRows, categoryRows, unitRows, catalogMirror] = await Promise.all([
    db
      .select()
      .from(expiryConfig)
      .where(eq(expiryConfig.householdId, householdId))
      .limit(1),

    db.query.categories.findMany({
      orderBy: [asc(categories.sortOrder), asc(categories.name)],
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

export const actions: Actions = {
  updateGlobalTolerance: async ({ locals, request }) => {
    const db = getDb()
    if (!locals.user) redirect(302, '/login')

    const householdId = await requireHouseholdId(locals.user.id)

    const data = await request.formData()
    const yellowRaw = data.get('yellow_days_before')
    const redRaw = data.get('red_days_before')
    const graceRaw = data.get('grace_days_after')

    const yellowDaysBefore = parseInt(String(yellowRaw), 10)
    const redDaysBefore = parseInt(String(redRaw), 10)
    const graceDaysAfter = parseInt(String(graceRaw), 10)

    if (
      isNaN(yellowDaysBefore) ||
      isNaN(redDaysBefore) ||
      isNaN(graceDaysAfter) ||
      yellowDaysBefore < 0 ||
      redDaysBefore < 0 ||
      graceDaysAfter < 0 ||
      redDaysBefore > yellowDaysBefore
    ) {
      return fail(422, {
        action: 'updateGlobalTolerance',
        error: 'Ungültige Werte. Rot-Schwelle muss kleiner oder gleich Gelb-Schwelle sein.',
      })
    }

    await db
      .insert(expiryConfig)
      .values({ householdId, yellowDaysBefore, redDaysBefore, graceDaysAfter })
      .onConflictDoUpdate({
        target: expiryConfig.householdId,
        set: { yellowDaysBefore, redDaysBefore, graceDaysAfter },
      })

    return { action: 'updateGlobalTolerance', success: true }
  },

  // Household-weiter In-App-Schalter fuer den Online-Preis-Abruf (G4).
  updatePriceScrape: async ({ locals, request }) => {
    const db = getDb()
    if (!locals.user) redirect(302, '/login')

    const householdId = await requireHouseholdId(locals.user.id)
    const data = await request.formData()
    const enabled = data.get('enabled') === 'true'

    await db
      .insert(expiryConfig)
      .values({ householdId, priceScrapeEnabled: enabled })
      .onConflictDoUpdate({
        target: expiryConfig.householdId,
        set: { priceScrapeEnabled: enabled },
      })

    return { action: 'updatePriceScrape', success: true, enabled }
  },

  updateCategoryTolerance: async ({ locals, request }) => {
    const db = getDb()
    if (!locals.user) redirect(302, '/login')

    const data = await request.formData()
    const categoryId = String(data.get('category_id') ?? '')
    const toleranceRaw = data.get('tolerance_days')
    const toleranceDays = parseInt(String(toleranceRaw), 10)

    if (!categoryId || isNaN(toleranceDays)) {
      return fail(422, {
        action: 'updateCategoryTolerance',
        error: 'Ungültige Eingabe.',
      })
    }

    await db
      .update(categories)
      .set({ defaultExpiryToleranceDays: toleranceDays })
      .where(eq(categories.id, categoryId))

    return { action: 'updateCategoryTolerance', success: true, categoryId }
  },

  // ---------------------------------------------------------------------------
  // Werksreset (Danger Zone, G53). Dreistufig:
  //   A = nur Bestaende (inventory_items)
  //   B = + Artikel & Preise (products + product_* + prices + stores-junction)
  //   C = kompletter Werksreset (alle Content-Tabellen; Nutzer/Haushalt bleiben)
  //
  // Alle Loeschungen laufen in EINER Transaktion und children-first, weil die
  // meisten Household-FKs RESTRICT sind (kein cascade). Bricht ein Schritt ab,
  // rollt die ganze Transaktion zurueck — keine halb-gewischte DB.
  //
  // products hat KEINE householdId (global geteilt) → wird bei B/C hart global
  // geloescht (bewusste Entscheidung fuer das Single-Household-Setup). Die
  // product_*-Kinder (product_nutrients, product_field_sources) cascaden mit.
  // Bei C werden zusaetzlich die geseedeten Referenzdaten (categories,
  // nutrient_types) entfernt → danach ist ein Re-Seed noetig.
  // ---------------------------------------------------------------------------
  resetHousehold: async ({ locals, request }) => {
    const db = getDb()
    if (!locals.user) redirect(302, '/login')

    const householdId = await requireHouseholdId(locals.user.id)
    const userId = locals.user.id

    const data = await request.formData()
    const stage = String(data.get('stage') ?? '')
    const confirm = String(data.get('confirm') ?? '')

    const expected = RESET_PHRASES[stage]
    if (!expected) {
      return fail(422, { action: 'resetHousehold', error: 'Unbekannte Reset-Stufe.' })
    }
    if (confirm !== expected) {
      return fail(422, {
        action: 'resetHousehold',
        error: 'Bestätigungstext stimmt nicht. Bitte die angezeigte Phrase exakt eintippen.',
      })
    }

    const hid = householdId

    await db.transaction(async (tx: any) => {
      // ── Stufe A: nur Bestaende ──────────────────────────────────────────────
      await tx.delete(inventoryItems).where(eq(inventoryItems.householdId, hid))

      if (stage === 'A') return

      // ── Stufe B: + Artikel & Preise ─────────────────────────────────────────
      // stock_targets referenzieren products/places/stores (RESTRICT) → vor den
      // products loeschen. product_prices/product_stores sind haushaltsbezogen.
      await tx.delete(stockTargets).where(eq(stockTargets.householdId, hid))
      await tx.delete(productPrices).where(eq(productPrices.householdId, hid))
      await tx.delete(productStores).where(eq(productStores.householdId, hid))
      // globus_snapshots.productId ist SET NULL (blockt nicht), ist aber
      // Household-Content → mitraeumen, damit keine verwaisten Snapshots bleiben.
      await tx.delete(globusSnapshots).where(eq(globusSnapshots.householdId, hid))

      if (stage === 'B') {
        // products global hart loeschen (kein householdId); product_nutrients &
        // product_field_sources cascaden mit. Bei B bleiben Orte/Maerkte/Listen.
        await tx.delete(products)
        return
      }

      // ── Stufe C: kompletter Werksreset ──────────────────────────────────────
      // Einkaufs-Kette children-first.
      await tx.delete(shoppingTripItems).where(eq(shoppingTripItems.householdId, hid))
      await tx.delete(shoppingTrips).where(eq(shoppingTrips.householdId, hid))
      await tx.delete(shoppingListItems).where(eq(shoppingListItems.householdId, hid))
      // bring_sync_log referenziert stores (RESTRICT) → vor stores.
      await tx.delete(bringSync).where(eq(bringSync.householdId, hid))
      // category_mappings + expiry_config + audit_log (Household-Content).
      await tx.delete(categoryMappings).where(eq(categoryMappings.householdId, hid))
      await tx.delete(expiryConfig).where(eq(expiryConfig.householdId, hid))
      await tx.delete(auditLog).where(eq(auditLog.householdId, hid))
      await tx.delete(invites).where(eq(invites.householdId, hid))
      // Lager-Hierarchie: locations ist household-scoped und cascadet auf
      // storages → places (beide haben keine eigene householdId). inventory_items
      // (der einzige RESTRICT-Referenzer auf places) ist oben bereits geloescht.
      await tx.delete(locations).where(eq(locations.householdId, hid))
      // Maerkte (nach allen store-referenzierenden Tabellen).
      await tx.delete(stores).where(eq(stores.householdId, hid))
      // Eigene (nicht-System-)Einheiten des Haushalts.
      await tx.delete(units).where(and(eq(units.householdId, hid), eq(units.isSystem, false)))
      // Artikel global hart (product_* cascaden mit).
      await tx.delete(products)
      // Geseedete Referenzdaten: nutrient_types (self-ref) children-first.
      await tx.delete(nutrientTypes).where(isNotNull(nutrientTypes.parentId))
      await tx.delete(nutrientTypes).where(isNull(nutrientTypes.parentId))
      // categories (self-ref) children-first.
      await tx.delete(categories).where(isNotNull(categories.parentId))
      await tx.delete(categories).where(isNull(categories.parentId))

      // ── Auto-Re-Seed: Referenzdaten auf Werkszustand ────────────────────────
      // Gleiche Daten wie seed.sql, aber in DERSELBEN Transaktion → nach dem
      // Werksreset ist alles sofort wieder da, KEIN manuelles psql -f /seed.sql.
      // Tabellen wurden unmittelbar davor geleert → kein onConflict noetig.
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
      // nutrient_types: erst Wurzeln, dann Kinder (parentSlug → neue UUID aufloesen).
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
              parentId,
              sortOrder: s.sortOrder,
              offKey: s.offKey,
            }
          }),
        )
      }
    })

    // Nach der Transaktion protokollieren. Bei Stufe C wurde audit_log gerade
    // geleert → dieser Eintrag ist der erste im frischen Log (gewollt).
    await writeAudit({
      householdId,
      userId,
      action: 'DELETE',
      tableName: 'household_reset',
      recordId: householdId,
      oldValues: { stage },
    })

    return { action: 'resetHousehold', success: true, stage }
  },
}
