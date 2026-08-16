import { getDb } from '$lib/server/db'
import {
  inventoryItems,
  productNutrients,
  places,
  storages,
  locations,
  expiryConfig,
  stores,
  products,
} from '@stoqr/db'
import { eq, and, asc } from 'drizzle-orm'
import { error, fail, redirect } from '@sveltejs/kit'
import type { PageServerLoad, Actions } from './$types'
import { requireHouseholdId, getUnits } from '$lib/server/queries/households'
import { deleteProduct, listInventoryForProduct, getCategories, getFieldSources } from '$lib/server/queries/products'
import { getNutrientTypes } from '$lib/server/queries/nutrients'
import { getStockTargetForProduct } from '$lib/server/queries/stock-targets'
import { listStoresForProduct } from '$lib/server/queries/product-stores'
import { getCurrentPricesForProductAllStores, listProposedForProduct } from '$lib/server/queries/prices'
import { buildUnitMetaMap, aggregateStock, compareToTarget, buildPackSize } from '$lib/utils/stock'
import { isPriceScrapeEnabled } from '$lib/server/scrape/globus'

// ---------------------------------------------------------------------------
// Location-Breadcrumb aus einem (geladenen) place-Objekt bauen
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
// Load — aggregierte Artikel-Ansicht: ein Artikel + ALLE seine Bestände
// ---------------------------------------------------------------------------

export const load: PageServerLoad = async ({ params, locals }) => {
  const db = getDb()
  if (!locals.user) redirect(302, '/login');
  const householdId = await requireHouseholdId(locals.user.id);

  // Aufgerufener Bestand (für Zugriff/404 + Produkt-Ermittlung + Hervorhebung)
  const item = await db.query.inventoryItems.findFirst({
    where: and(eq(inventoryItems.id, params.id), eq(inventoryItems.householdId, householdId)),
    with: {
      product: {
        with: {
          nutrients: {
            with: { nutrientType: true },
            orderBy: asc(productNutrients.nutrientTypeId),
          },
          category: true,
        },
      },
    },
  });

  if (!item) {
    error(404, 'Artikel nicht gefunden');
  }

  // Defensive: bei einem verwaisten Bestand (product-Referenz zeigt ins Leere)
  // lieber 404 als ein 500 weiter unten (item.product.id) — z.B. nach einem
  // fehlerhaften Import, der ein Produkt geloescht statt wiederverwendet hat.
  if (!item.product) {
    error(404, 'Artikel nicht gefunden');
  }

  // Alle Bestände desselben Produkts (aggregierte Ansicht)
  const siblingRows = await listInventoryForProduct(item.productId, householdId);
  const siblings = siblingRows.map((s) => ({
    ...s,
    locationPath: buildLocationPath(s.place as PlaceTree),
  }));

  // Nährstofftypen (für den Editor) + Einheiten (behebt data.units-Bug) + Märkte + Kategorien (ProductForm)
  const [nutrientTypes, units, availableStores, categories] = await Promise.all([
    getNutrientTypes(),
    getUnits(householdId),
    db.query.stores.findMany({
      where: eq(stores.householdId, householdId),
      orderBy: asc(stores.name),
      columns: { id: true, name: true, chain: true, scrapeUrl: true },
    }),
    getCategories(),
  ]);

  // Feld-Herkunft (OFF/Globus/manuell) je Stammdaten-Feld des Artikels (G15).
  const fieldSources = await getFieldSources(item.product.id);

  // Haushalts-Ablaufkonfiguration (für Badge-Berechnung)
  const cfg = await db.query.expiryConfig.findFirst({
    where: eq(expiryConfig.householdId, householdId),
  });

  const expirySettings = {
    yellowDaysBefore: cfg?.yellowDaysBefore ?? 7,
    redDaysBefore: cfg?.redDaysBefore ?? 2,
    graceDaysAfter: cfg?.graceDaysAfter ?? 0,
  };

  // Alle Orte für den Location-Picker-Dialog
  const allLocations = await db.query.locations.findMany({
    where: eq(locations.householdId, householdId),
    orderBy: asc(locations.sortOrder),
    with: {
      storages: {
        orderBy: asc(storages.sortOrder),
        with: {
          places: { orderBy: asc(places.sortOrder) },
        },
      },
    },
  });

  // Gesamtbestand über alle Bestände dieses Artikels (Umrechnungsschicht).
  // In-Memory aus bereits geladenen siblings + units — kein Extra-DB-Roundtrip.
  const unitMetaMap = buildUnitMetaMap(units);
  // Gebinde-Größe des Artikels (Einheiten v2) → Flasche etc. auf Volumen/Masse umrechnen.
  const packSize = buildPackSize(item.product);
  const stockTotals = aggregateStock(siblings, unitMetaMap, packSize);

  // Soll-/Mindestbestand + Soll-Ist-Vergleich (Inkrement 2b).
  const stockTarget = await getStockTargetForProduct(item.productId, householdId);
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
    : null;

  // Markt-Zuordnung des Artikels (M:N, Planung).
  const productStoreRows = await listStoresForProduct(item.productId, householdId);
  const productStoreIds = productStoreRows.map((r) => r.storeId);

  // Aktuelle Preise je Markt (Block F).
  const currentPrices = await getCurrentPricesForProductAllStores(item.productId, householdId);

  // Offene Online-Preis-Vorschläge je Markt (Block F2, Staging).
  const proposedPrices = await listProposedForProduct(item.productId, householdId);

  const priceScrapeEnabled = await isPriceScrapeEnabled(householdId);

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
  };
};

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export const actions: Actions = {
  // ── Update quantity ──────────────────────────────────────────────────────
  updateQuantity: async ({ params, locals, request }) => {
    const db = getDb()
    if (!locals.user) return fail(401, { error: 'Nicht authentifiziert' });
    const householdId = await requireHouseholdId(locals.user.id);

    const data = await request.formData();
    const quantity = data.get('quantity');
    const parsed = Number(quantity);

    if (!quantity || isNaN(parsed) || parsed < 0) {
      return fail(400, { error: 'Ungültige Menge' });
    }

    const [updated] = await db
      .update(inventoryItems)
      .set({ quantity: String(parsed), updatedAt: new Date() })
      .where(and(eq(inventoryItems.id, params.id), eq(inventoryItems.householdId, householdId)))
      .returning();

    if (!updated) return fail(404, { error: 'Artikel nicht gefunden' });
    return { success: true, quantity: updated.quantity };
  },

  // ── Mark as consumed ─────────────────────────────────────────────────────
  markConsumed: async ({ params, locals }) => {
    const db = getDb()
    if (!locals.user) return fail(401, { error: 'Nicht authentifiziert' });
    const householdId = await requireHouseholdId(locals.user.id);

    const [updated] = await db
      .update(inventoryItems)
      .set({ status: 'consumed', consumedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(inventoryItems.id, params.id), eq(inventoryItems.householdId, householdId)))
      .returning();

    if (!updated) return fail(404, { error: 'Artikel nicht gefunden' });
    redirect(302, '/inventar');
  },

  // ── Update item fields (MHD, notes, lot, location) ────────────────────────
  updateItem: async ({ params, locals, request }) => {
    const db = getDb()
    if (!locals.user) return fail(401, { error: 'Nicht authentifiziert' });
    const householdId = await requireHouseholdId(locals.user.id);

    const data = await request.formData();
    const bestBeforeDate = data.get('bestBeforeDate') as string | null;
    const notes = data.get('notes') as string | null;
    const lotNumber = data.get('lotNumber') as string | null;
    const placeId = data.get('placeId') as string | null;
    const quantity = data.get('quantity') as string | null;
    const unit = data.get('unit') as string | null;
    const storeId = data.get('storeId') as string | null;

    const patch: Partial<typeof inventoryItems.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (bestBeforeDate !== null) {
      patch.bestBeforeDate = bestBeforeDate === '' ? null : bestBeforeDate;
    }
    if (notes !== null) patch.notes = notes === '' ? null : notes;
    if (lotNumber !== null) patch.lotNumber = lotNumber === '' ? null : lotNumber;
    if (placeId !== null) patch.placeId = placeId === '' ? null : placeId;
    if (storeId !== null) patch.storeId = storeId === '' ? null : storeId;
    if (quantity !== null) {
      const q = Number(quantity);
      if (!isNaN(q) && q >= 0) patch.quantity = String(q);
    }
    if (unit !== null && unit !== '') patch.unit = unit;

    const [updated] = await db
      .update(inventoryItems)
      .set(patch)
      .where(and(eq(inventoryItems.id, params.id), eq(inventoryItems.householdId, householdId)))
      .returning();

    if (!updated) return fail(404, { error: 'Artikel nicht gefunden' });
    return { success: true };
  },

  // ── Delete item ───────────────────────────────────────────────────────────
  deleteItem: async ({ params, locals }) => {
    const db = getDb()
    if (!locals.user) return fail(401, { error: 'Nicht authentifiziert' });
    const householdId = await requireHouseholdId(locals.user.id);

    const [deleted] = await db
      .delete(inventoryItems)
      .where(and(eq(inventoryItems.id, params.id), eq(inventoryItems.householdId, householdId)))
      .returning();

    if (!deleted) return fail(404, { error: 'Artikel nicht gefunden' });
    redirect(302, '/inventar');
  },

  // ── Delete product from catalog ───────────────────────────────────────────
  deleteProduct: async ({ params, locals }) => {
    const db = getDb()
    if (!locals.user) return fail(401, { error: 'Nicht authentifiziert' });
    const householdId = await requireHouseholdId(locals.user.id);

    // Load the inventory item to find the productId
    const item = await db.query.inventoryItems.findFirst({
      where: and(eq(inventoryItems.id, params.id), eq(inventoryItems.householdId, householdId)),
      columns: { productId: true },
    });

    if (!item) return fail(404, { error: 'Artikel nicht gefunden' });

    // Guard: no remaining inventory items for this product in this household
    const remaining = await db.query.inventoryItems.findFirst({
      where: and(
        eq(inventoryItems.productId, item.productId),
        eq(inventoryItems.householdId, householdId)
      ),
      columns: { id: true },
    });

    if (remaining) {
      return fail(409, {
        error: 'Das Produkt hat noch weitere Bestandseinträge. Bitte zuerst alle entfernen.',
      });
    }

    const deleted = await deleteProduct(item.productId);
    if (!deleted) return fail(404, { error: 'Produkt nicht gefunden' });

    redirect(302, '/inventar');
  },

  // ── Delete all (product + all inventory items) ───────────────────────────
  deleteAll: async ({ params, locals }) => {
    const db = getDb()
    if (!locals.user) return fail(401, { error: 'Nicht authentifiziert' });
    const householdId = await requireHouseholdId(locals.user.id);

    // Load the inventory item to find the productId
    const item = await db.query.inventoryItems.findFirst({
      where: and(eq(inventoryItems.id, params.id), eq(inventoryItems.householdId, householdId)),
      columns: { productId: true },
    });

    if (!item) return fail(404, { error: 'Artikel nicht gefunden' });

    const productId = item.productId;

    try {
      await db.transaction(async (tx: any) => {
        await tx
          .delete(inventoryItems)
          .where(
            and(
              eq(inventoryItems.productId, productId),
              eq(inventoryItems.householdId, householdId)
            )
          );

        await tx.delete(products).where(eq(products.id, productId));
      });
    } catch (err) {
      console.error('deleteAll failed:', err);
      return fail(500, { error: 'Fehler beim vollständigen Löschen' });
    }

    redirect(302, '/inventar');
  },
};
