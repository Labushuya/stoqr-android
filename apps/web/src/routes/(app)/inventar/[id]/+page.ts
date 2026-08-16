import { error } from '@sveltejs/kit'
import type { PageLoad } from './$types'

// ---------------------------------------------------------------------------
// Location-Breadcrumb aus einem (geladenen) place-Objekt bauen.
// 1:1 aus +page.server.ts kopiert — pure Funktion, kein Server-Code.
// ---------------------------------------------------------------------------

type PlaceTree = {
  id: string
  name: string
  storage?: { id: string; name: string; location?: { id: string; name: string } | null } | null
} | null

function buildLocationPath(
  place: PlaceTree
): Array<{ id: string; name: string; kind: 'location' | 'storage' | 'place' }> {
  const path: Array<{ id: string; name: string; kind: 'location' | 'storage' | 'place' }> = []
  if (!place) return path
  if (place.storage?.location) {
    path.push({ id: place.storage.location.id, name: place.storage.location.name, kind: 'location' })
  }
  if (place.storage) {
    path.push({ id: place.storage.id, name: place.storage.name, kind: 'storage' })
  }
  path.push({ id: place.id, name: place.name, kind: 'place' })
  return path
}

// ---------------------------------------------------------------------------
// Universeller Load.
//   Pi (node): leeres Objekt → +page.server.ts bleibt die Quelle.
//   App (SPA): dieselbe Komposition wie +page.server.ts, aber gegen die
//              On-Device-SQLite via $data/queries/* + getDb().
// ---------------------------------------------------------------------------

export const load: PageLoad = async (event) => {
  if (__STOQR_TARGET__ === 'app') {
    const { LOCAL_HOUSEHOLD_ID, sqliteSchema } = await import('@stoqr/db/sqlite')
    const { getDb } = await import('$data/db')
    const { eq, and, asc } = await import('drizzle-orm')

    const { getUnits } = await import('$data/queries/households')
    const { listInventoryForProduct, getCategories, getFieldSources } = await import(
      '$data/queries/products'
    )
    const { getNutrientTypes } = await import('$data/queries/nutrients')
    const { getStockTargetForProduct } = await import('$data/queries/stock-targets')
    const { listStoresForProduct } = await import('$data/queries/product-stores')
    const { getCurrentPricesForProductAllStores, listProposedForProduct } = await import(
      '$data/queries/prices'
    )
    const { buildUnitMetaMap, aggregateStock, compareToTarget, buildPackSize } = await import(
      '$lib/utils/stock'
    )

    const householdId = LOCAL_HOUSEHOLD_ID
    const db = getDb() as unknown as import('@stoqr/db/sqlite').SqliteDatabase

    // Aufgerufener Bestand (für Zugriff/404 + Produkt-Ermittlung + Hervorhebung)
    const item = await db.query.inventoryItems.findFirst({
      where: and(
        eq(sqliteSchema.inventoryItems.id, event.params.id),
        eq(sqliteSchema.inventoryItems.householdId, householdId)
      ),
      with: {
        product: {
          with: {
            nutrients: {
              with: { nutrientType: true },
              orderBy: asc(sqliteSchema.productNutrients.nutrientTypeId),
            },
            category: true,
          },
        },
      },
    })

    if (!item) {
      error(404, 'Artikel nicht gefunden')
    }

    // Defensive: bei einem verwaisten Bestand (product-Referenz zeigt ins Leere)
    // lieber 404 als ein 500 weiter unten (item.product.id) — z.B. nach einem
    // fehlerhaften Import, der ein Produkt geloescht statt wiederverwendet hat.
    if (!item.product) {
      error(404, 'Artikel nicht gefunden')
    }

    // Alle Bestände desselben Produkts (aggregierte Ansicht)
    const siblingRows = await listInventoryForProduct(item.productId, householdId)
    const siblings = siblingRows.map((s) => ({
      ...s,
      locationPath: buildLocationPath(s.place as PlaceTree),
    }))

    // Nährstofftypen (für den Editor) + Einheiten + Märkte + Kategorien (ProductForm)
    const [nutrientTypes, units, availableStores, categories] = await Promise.all([
      getNutrientTypes(),
      getUnits(householdId),
      db.query.stores.findMany({
        where: eq(sqliteSchema.stores.householdId, householdId),
        orderBy: asc(sqliteSchema.stores.name),
        columns: { id: true, name: true, chain: true, scrapeUrl: true },
      }),
      getCategories(),
    ])

    // Feld-Herkunft (OFF/Globus/manuell) je Stammdaten-Feld des Artikels (G15).
    const fieldSources = await getFieldSources(item.product.id)

    // Haushalts-Ablaufkonfiguration (für Badge-Berechnung)
    const cfg = await db.query.expiryConfig.findFirst({
      where: eq(sqliteSchema.expiryConfig.householdId, householdId),
    })

    const expirySettings = {
      yellowDaysBefore: cfg?.yellowDaysBefore ?? 7,
      redDaysBefore: cfg?.redDaysBefore ?? 2,
      graceDaysAfter: cfg?.graceDaysAfter ?? 0,
    }

    // Alle Orte für den Location-Picker-Dialog
    const allLocations = await db.query.locations.findMany({
      where: eq(sqliteSchema.locations.householdId, householdId),
      orderBy: asc(sqliteSchema.locations.sortOrder),
      with: {
        storages: {
          orderBy: asc(sqliteSchema.storages.sortOrder),
          with: {
            places: { orderBy: asc(sqliteSchema.places.sortOrder) },
          },
        },
      },
    })

    // Gesamtbestand über alle Bestände dieses Artikels (Umrechnungsschicht).
    const unitMetaMap = buildUnitMetaMap(units)
    const packSize = buildPackSize(item.product)
    const stockTotals = aggregateStock(siblings, unitMetaMap, packSize)

    // Soll-/Mindestbestand + Soll-Ist-Vergleich (Inkrement 2b).
    const stockTarget = await getStockTargetForProduct(item.productId, householdId)
    const targetStatus = stockTarget
      ? compareToTarget(
          stockTotals,
          {
            targetQuantity: stockTarget.targetQuantity,
            unit: stockTarget.unit,
            minQuantity: stockTarget.minQuantity,
          },
          unitMetaMap,
          packSize
        )
      : null

    // Markt-Zuordnung des Artikels (M:N, Planung).
    const productStoreRows = await listStoresForProduct(item.productId, householdId)
    const productStoreIds = productStoreRows.map((r) => r.storeId)

    // Aktuelle Preise je Markt (Block F).
    const currentPrices = await getCurrentPricesForProductAllStores(item.productId, householdId)

    // Offene Online-Preis-Vorschläge je Markt (Block F2, Staging).
    const proposedPrices = await listProposedForProduct(item.productId, householdId)

    // priceScrapeEnabled: offline defensiv aus expiryConfig lesen (default false).
    const priceScrapeEnabled = cfg?.priceScrapeEnabled ?? false

    return {
      item,
      product: item.product,
      fieldSources,
      siblings,
      nutrientTypes,
      units,
      categories,
      availableStores,
      productStoreIds,
      currentPrices,
      proposedPrices,
      priceScrapeEnabled,
      allLocations,
      expirySettings,
      stockTotals,
      stockTarget,
      targetStatus,
    }
  }

  return {}
}
