// ---------------------------------------------------------------------------
// api-router.app — App-Target-Router (Capacitor SPA, offline)
// ---------------------------------------------------------------------------
// Ersetzt die Pi-HTTP-Endpoints (/api/*). Statt eines Netz-Requests ruft dieser
// Router dieselben entkoppelten Query-Funktionen ($data/queries/*) direkt gegen
// die On-Device-SQLite auf. Die App-Shell setzt setDb(sqlite) BEIM Boot, bevor
// je ein routeApp() laeuft — hier wird die DB also NICHT gesetzt, nur genutzt.
//
// Der Response-Vertrag ist identisch zu dem, was die Pi-Handler (+server.ts)
// zurueckgaben: res.ok / res.json() / res.text() verhalten sich unveraendert,
// damit die aufrufenden Komponenten (apiFetch) nichts merken.
//
// Lokale Identitaet: statt requireHouseholdId(locals.user.id) gilt ueberall
// LOCAL_HOUSEHOLD_ID (Single-Household, kein Auth im App-Target).
//
// ONLINE-ONLY-Endpoints (Globus-Scraping, OFF, OSM, Preis-Abruf, OCR) koennen
// offline nicht bedient werden → sie degradieren gnaedig (neutrale Payload bzw.
// 503/404), damit die UI nicht bricht. Siehe die einzelnen Kommentare unten.
//
// Audit: die Pi-Handler schreiben nebenbei writeAudit(...). Das ist best-effort
// und beeinflusst den Response-Vertrag NICHT — im App-Router bewusst weggelassen,
// um den Router schlank zu halten (die UI liest kein Audit-Log offline).

import { LOCAL_HOUSEHOLD_ID, LOCAL_USER_ID, sqliteSchema } from '@stoqr/db/sqlite'
import type { SqliteDatabase } from '@stoqr/db/sqlite'
import { collectExport, applyImport, serializeEnvelope, type ExportTier, type TransferSchema } from '@stoqr/db/sqlite'
import { getDb } from '$data/db'
import { and, eq, count, inArray } from 'drizzle-orm'

import * as locationsQ from '$data/queries/locations'
import * as categoriesQ from '$data/queries/categories'
import * as mappingQ from '$data/queries/category-mapping'
import * as productsQ from '$data/queries/products'
import * as nutrientsQ from '$data/queries/nutrients'
import * as pricesQ from '$data/queries/prices'
import * as productStoresQ from '$data/queries/product-stores'
import * as shoppingListQ from '$data/queries/shopping-list'
import * as tripsQ from '$data/queries/shopping-trips'
import * as targetsQ from '$data/queries/stock-targets'
import * as resetQ from '$data/queries/reset'
import { getUnits } from '$data/queries/households'
import {
  buildUnitMetaMap,
  isCountUnit,
  resolveUnitMeta,
  buildPackSize,
  planInventoryAdjustment,
  type UnitRow,
} from '$lib/utils/stock'

// ---------------------------------------------------------------------------
// Response-Helfer (spiegeln den json()-Helfer / new Response(...) der Pi-Handler)
// ---------------------------------------------------------------------------

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/** 204 ohne Body (viele DELETE-Handler auf dem Pi liefern genau das). */
function noContent(): Response {
  return new Response(null, { status: 204 })
}

function errRes(message: string, status: number): Response {
  return jsonRes({ error: message }, status)
}

/** Body eines Requests als JSON parsen (Pi: request.json()). Leerer Body → {}. */
function parseBody(init?: RequestInit): unknown {
  if (init?.body == null) return {}
  try {
    return JSON.parse(init.body as string)
  } catch {
    return {}
  }
}

// ---------------------------------------------------------------------------
// Kleine lokale Helfer, die auf dem Pi aus server-only Modulen kamen
// (nicht importierbar im App-Bundle, daher hier nachgebaut).
// ---------------------------------------------------------------------------

// Koordinate defensiv fuer die text-Spalte aufbereiten (aus stores/+server.ts).
function coordToDb(v: string | number | null | undefined): string | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? String(n) : null
}

// Nachbau von normalizeScrapeUrl aus $lib/server/scrape/globus (server-only).
// Leer → null; ungueltiges Protokoll → INVALID; ohne {EAN} → MISSING.
const EAN_PLACEHOLDER = '{EAN}'
const INVALID_URL = Symbol('invalid-url')
const MISSING_EAN_PLACEHOLDER = Symbol('missing-ean-placeholder')
function normalizeScrapeUrl(
  raw: string | null | undefined,
): string | null | typeof INVALID_URL | typeof MISSING_EAN_PLACEHOLDER {
  if (raw == null) return null
  const trimmed = raw.trim()
  if (trimmed === '') return null
  try {
    const u = new URL(trimmed)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return INVALID_URL
    if (!trimmed.includes(EAN_PLACEHOLDER)) return MISSING_EAN_PLACEHOLDER
    return trimmed
  } catch {
    return INVALID_URL
  }
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

// getDb() ist gegen den Postgres-Database-Typ typisiert (Pi). Im App-Target
// liefert der Provider aber die injizierte SQLite-Instanz. Fuer die wenigen
// Inline-Drizzle-Stellen (stores/units/products-Patch) reichen wir sie als
// SqliteDatabase durch, damit die sqlite-schema-Tabellen typkorrekt passen.
// Runtime unveraendert — nur ein Typ-Cast an EINER Stelle.
function getSqliteDb(): SqliteDatabase {
  return getDb() as unknown as SqliteDatabase
}

// Schema-Namespace fuer die dialekt-neutralen Transfer-Runner (collectExport/
// applyImport). sqliteSchema enthaelt alle Tabellen unter denselben Namen wie
// TRANSFER_TABLE_ORDER/FK_DESCRIPTOR erwarten.
const SQLITE_TRANSFER_SCHEMA = sqliteSchema as unknown as TransferSchema
const TRANSFER_OPS = { eq, inArray, and }

function isTier(v: string): v is ExportTier {
  return v === 'stammdaten' || v === 'orte-inventar' || v === 'einkauf' || v === 'alles'
}

export async function routeApp(path: string, init?: RequestInit): Promise<Response> {
  const method = (init?.method ?? 'GET').toUpperCase()
  const url = new URL(path, 'http://local')
  const seg = url.pathname.split('/').filter(Boolean) // ['api', 'products', id, 'prices']
  const q = url.searchParams
  const hh = LOCAL_HOUSEHOLD_ID

  try {
    // seg[0] ist immer 'api'
    const r = seg[1]

    // -----------------------------------------------------------------------
    // /api/locations
    // -----------------------------------------------------------------------
    if (r === 'locations') {
      const id = seg[2]
      if (!id) {
        if (method === 'GET') return jsonRes(await locationsQ.getLocations(hh))
        if (method === 'POST') {
          const b = parseBody(init) as { name?: string; icon?: string; sortOrder?: number }
          if (!b.name) return errRes('name is required', 400)
          // Pi nutzt hier inline-drizzle; die Query-Fn createLocation erledigt
          // dasselbe (inkl. sortOrder-Default via Schema).
          const location = await locationsQ.createLocation({ householdId: hh, name: b.name, icon: b.icon })
          return jsonRes(location, 201)
        }
      } else {
        if (method === 'GET') {
          const location = await locationsQ.getLocation(id, hh)
          if (!location) return errRes('Not found', 404)
          return jsonRes(location)
        }
        if (method === 'PATCH') {
          const b = parseBody(init) as { name?: string; icon?: string; sortOrder?: number }
          const updates: { name?: string; icon?: string; sortOrder?: number } = {}
          if (b.name !== undefined) updates.name = b.name
          if (b.icon !== undefined) updates.icon = b.icon
          if (b.sortOrder !== undefined) updates.sortOrder = b.sortOrder
          if (Object.keys(updates).length === 0) return errRes('No fields to update', 400)
          const updated = await locationsQ.updateLocation(id, hh, updates)
          if (!updated) return errRes('Not found', 404)
          return jsonRes(updated)
        }
        if (method === 'DELETE') {
          const deleted = await locationsQ.deleteLocation(id, hh)
          if (!deleted) return errRes('Not found', 404)
          return noContent()
        }
      }
    }

    // -----------------------------------------------------------------------
    // /api/storages  (Pi: inline-drizzle + Ownership-Join. Offline: Single-
    // Household → Ownership stets erfuellt, daher direkt die Query-Fns.)
    // -----------------------------------------------------------------------
    if (r === 'storages') {
      const id = seg[2]
      if (!id) {
        if (method === 'POST') {
          const b = parseBody(init) as {
            locationId?: string
            name?: string
            storageType?: string
            temperatureZone?: string
            icon?: string
            sortOrder?: number
          }
          if (!b.locationId || !b.name) return errRes('locationId and name are required', 400)
          const storage = await locationsQ.createStorage({
            locationId: b.locationId,
            name: b.name,
            storageType: b.storageType,
            temperatureZone: b.temperatureZone,
            icon: b.icon,
          })
          return jsonRes(storage, 201)
        }
      } else {
        if (method === 'PATCH') {
          const b = parseBody(init) as {
            name?: string
            storageType?: string
            temperatureZone?: string
            icon?: string
            sortOrder?: number
          }
          const updates: Record<string, unknown> = {}
          for (const k of ['name', 'storageType', 'temperatureZone', 'icon', 'sortOrder'] as const) {
            if (b[k] !== undefined) updates[k] = b[k]
          }
          if (Object.keys(updates).length === 0) return errRes('No fields to update', 400)
          const updated = await locationsQ.updateStorage(id, updates)
          if (!updated) return errRes('Not found', 404)
          return jsonRes(updated)
        }
        if (method === 'DELETE') {
          const deleted = await locationsQ.deleteStorage(id)
          if (!deleted) return errRes('Not found', 404)
          return noContent()
        }
      }
    }

    // -----------------------------------------------------------------------
    // /api/places  (wie storages: Ownership offline trivial erfuellt)
    // -----------------------------------------------------------------------
    if (r === 'places') {
      const id = seg[2]
      if (!id) {
        if (method === 'POST') {
          const b = parseBody(init) as { storageId?: string; name?: string; icon?: string; sortOrder?: number }
          if (!b.storageId || !b.name) return errRes('storageId and name are required', 400)
          const place = await locationsQ.createPlace({ storageId: b.storageId, name: b.name, icon: b.icon })
          return jsonRes(place, 201)
        }
      } else {
        if (method === 'PATCH') {
          const b = parseBody(init) as { name?: string; icon?: string; sortOrder?: number }
          const updates: Record<string, unknown> = {}
          for (const k of ['name', 'icon', 'sortOrder'] as const) {
            if (b[k] !== undefined) updates[k] = b[k]
          }
          if (Object.keys(updates).length === 0) return errRes('No fields to update', 400)
          const updated = await locationsQ.updatePlace(id, updates)
          if (!updated) return errRes('Not found', 404)
          return jsonRes(updated)
        }
        if (method === 'DELETE') {
          const deleted = await locationsQ.deletePlace(id)
          if (!deleted) return errRes('Not found', 404)
          return noContent()
        }
      }
    }

    // -----------------------------------------------------------------------
    // /api/categories  (global, kein Household-Scope)
    // -----------------------------------------------------------------------
    if (r === 'categories') {
      const id = seg[2]
      if (!id) {
        if (method === 'GET') return jsonRes(await categoriesQ.listCategories())
        if (method === 'POST') {
          const b = parseBody(init) as { name?: string; icon?: string; parentId?: string }
          const name = (b.name ?? '').trim()
          if (!name) return errRes('Name erforderlich', 400)
          const row = await categoriesQ.createCategory({ name, icon: b.icon ?? null, parentId: b.parentId ?? null })
          return jsonRes(row, 201)
        }
      } else {
        if (method === 'PATCH') {
          const b = parseBody(init) as { name?: string; icon?: string; parentId?: string; defaultExpiryToleranceDays?: number }
          if (b.name !== undefined && b.name.trim() === '') return errRes('Name darf nicht leer sein', 400)
          const before = await categoriesQ.getCategoryById(id)
          if (!before) return errRes('Not found', 404)
          const res = await categoriesQ.updateCategory(id, {
            name: b.name,
            icon: b.icon,
            parentId: b.parentId,
            defaultExpiryToleranceDays: b.defaultExpiryToleranceDays,
          })
          if (!res.ok) {
            if (res.reason === 'cycle') return errRes(res.detail ?? 'Ungueltige Verschachtelung.', 409)
            return errRes('Not found', 404)
          }
          return jsonRes(res.row)
        }
        if (method === 'DELETE') {
          const res = await categoriesQ.deleteCategory(id)
          if (!res.ok) {
            if (res.reason === 'not-found') return errRes('Not found', 404)
            return errRes(res.detail ?? 'Kategorie kann nicht geloescht werden.', 409)
          }
          return noContent()
        }
      }
    }

    // -----------------------------------------------------------------------
    // /api/category-mappings
    // -----------------------------------------------------------------------
    if (r === 'category-mappings') {
      const id = seg[2]
      if (!id) {
        if (method === 'GET') return jsonRes(await mappingQ.listCategoryMappings(hh))
        if (method === 'POST') {
          const b = parseBody(init) as { source?: string; token?: string; categoryId?: string }
          const res = await mappingQ.createCategoryMapping(hh, {
            source: b.source ?? '',
            token: b.token ?? '',
            categoryId: b.categoryId ?? '',
          })
          if (!res.ok) {
            const status = res.reason === 'duplicate' ? 409 : 400
            return errRes(res.detail ?? 'Regel konnte nicht angelegt werden.', status)
          }
          return jsonRes(res.row, 201)
        }
      } else {
        if (method === 'DELETE') {
          const deleted = await mappingQ.deleteCategoryMapping(id, hh)
          if (!deleted) return errRes('Not found', 404)
          return noContent()
        }
      }
    }

    // -----------------------------------------------------------------------
    // /api/inventory
    // -----------------------------------------------------------------------
    if (r === 'inventory') {
      const id = seg[2]
      const sub = seg[3]
      if (!id) {
        if (method === 'GET') {
          const items = await productsQ.getInventoryItems(hh, {
            placeId: q.get('placeId') ?? undefined,
            status: q.get('status') ?? undefined,
          })
          return jsonRes(items)
        }
        if (method === 'POST') {
          const b = parseBody(init) as Record<string, any>
          const qty = Number(b.quantity)
          if (isNaN(qty) || qty < 0 || !b.unit) {
            return errRes('Menge muss eine gueltige Zahl >= 0 sein und Einheit ist erforderlich', 400)
          }
          if (!b.productId && !b.productName) return errRes('productId or productName is required', 400)

          // Produkt aufloesen: vorhandenes productId, sonst per GTIN, sonst neu.
          let resolvedProductId: string | undefined = b.productId
          if (!resolvedProductId && b.gtin) {
            const existing = await productsQ.getOrCreateProductByGtin(String(b.gtin))
            resolvedProductId = existing?.id
          }
          if (!resolvedProductId) {
            resolvedProductId = await productsQ.createProduct({
              name: b.productName,
              gtin: b.gtin,
              brand: b.brand,
              imageUrl: b.imageUrl,
              categoryId: b.categoryId,
              defaultUnit: b.defaultUnit ?? b.unit,
              defaultWeightG: b.defaultWeightG,
              defaultVolumeMl: b.defaultVolumeML,
              createdBy: null as unknown as string,
            })
            // Feld-Herkunft (best-effort). Nur Basis: OFF-Herkunft wird auf dem Pi
            // aus dem OFF-Import abgeleitet; hier nur 'name' setzen reicht der UI.
            await productsQ.setFieldSources(resolvedProductId, { name: 'off' })
          }

          const item = await productsQ.createInventoryItem({
            productId: resolvedProductId,
            householdId: hh,
            placeId: b.placeId,
            quantity: qty,
            unit: b.unit,
            bestBeforeDate: b.bestBeforeDate,
            notes: b.notes,
            storeId: b.storeId,
            gtin: b.gtin,
            purchasePriceCt: b.purchasePriceCt,
          })

          if (b.storeId) {
            try {
              await productStoresQ.addStoreForProduct(resolvedProductId, hh, b.storeId)
            } catch {
              // best-effort (Pi ebenso)
            }
          }

          // Preis mitschreiben, wenn angefordert.
          if (b.recordPrice && b.purchasePriceCt != null && b.storeId) {
            await pricesQ.recordPrice({
              householdId: hh,
              productId: resolvedProductId,
              storeId: b.storeId,
              priceCt: b.purchasePriceCt,
              unit: b.priceUnit ?? b.unit,
              isReduced: b.priceIsReduced ?? false,
              makePermanent: b.pricePermanent ?? false,
              source: 'booked',
              createdBy: null as unknown as string,
            })
          }

          const fullItem = await productsQ.getInventoryItem(item.id, hh)
          return jsonRes(fullItem ?? item, 201)
        }
      } else if (!sub) {
        if (method === 'GET') {
          const item = await productsQ.getInventoryItem(id, hh)
          if (!item) return errRes('Not found', 404)
          return jsonRes(item)
        }
        if (method === 'PATCH') {
          const b = parseBody(init) as Record<string, any>
          const patch: Record<string, unknown> = {}
          for (const k of [
            'quantity', 'unit', 'bestBeforeDate', 'purchaseDate', 'placeId', 'storeId', 'gtin',
            'notes', 'status', 'openedExpiryDays', 'purchasePriceCt', 'lotNumber', 'weightG', 'volumeMl',
          ] as const) {
            if (b[k] !== undefined) patch[k] = b[k]
          }
          if (b.openedAt !== undefined) patch.openedAt = b.openedAt ? new Date(b.openedAt) : null
          if (Object.keys(patch).length === 0 && b.categoryId === undefined && !b.productName) {
            return errRes('Keine Felder zum Aktualisieren', 400)
          }
          const updated = await productsQ.updateInventoryItem(id, hh, patch)
          if (!updated) return errRes('Not found', 404)
          // Produkt-Stammdaten (Name/Kategorie) mitpflegen, wenn uebergeben.
          if (b.productName || b.categoryId !== undefined) {
            const itemForProduct = await productsQ.getInventoryItem(id, hh)
            if (itemForProduct?.productId) {
              const productPatch: Record<string, unknown> = {}
              if (b.productName) productPatch.name = b.productName
              if (b.categoryId !== undefined) productPatch.categoryId = b.categoryId || null
              const db = getSqliteDb()
              await db.update(sqliteSchema.products)
                .set(productPatch)
                .where(eq(sqliteSchema.products.id, itemForProduct.productId))
            }
          }
          return jsonRes(updated)
        }
        if (method === 'DELETE') {
          const deleted = await productsQ.deleteInventoryItem(id, hh)
          if (!deleted) return errRes('Not found', 404)
          return noContent()
        }
      } else if (sub === 'consume' && method === 'POST') {
        const b = parseBody(init) as { amount?: number }
        if (typeof b.amount !== 'number' || b.amount <= 0) {
          return errRes('amount must be a positive number', 400)
        }
        const updated = await productsQ.consumeInventoryItem(id, hh, b.amount)
        if (!updated) return errRes('Not found', 404)
        return jsonRes(updated)
      }
    }

    // -----------------------------------------------------------------------
    // /api/products  (inkl. Unterrouten)
    // -----------------------------------------------------------------------
    if (r === 'products') {
      const id = seg[2]
      const sub = seg[3]

      if (!id) {
        if (method === 'GET') {
          const term = (q.get('q') ?? '').trim()
          if (!term) return errRes('q query parameter is required', 400)
          return jsonRes(await productsQ.searchProducts(term))
        }
        if (method === 'POST') {
          const b = parseBody(init) as Record<string, any>
          if (!b.name) return errRes('name is required', 400)
          // Deposit nur bei count-artiger Einheit erlauben.
          const units = (await getUnits(hh)) as unknown as UnitRow[]
          const metaMap = buildUnitMetaMap(units)
          const effectiveUnit = b.defaultUnit || 'piece'
          const countOk = isCountUnit(effectiveUnit, metaMap)
          const productId = await productsQ.createProduct({
            name: b.name,
            brand: b.brand ?? undefined,
            gtin: b.gtin ? String(b.gtin).trim() : undefined,
            categoryId: b.categoryId ?? undefined,
            description: b.description ?? undefined,
            notes: b.notes ?? undefined,
            imageUrl: b.imageUrl ?? undefined,
            defaultUnit: b.defaultUnit ?? undefined,
            defaultQuantity: b.defaultQuantity ?? undefined,
            defaultWeightG: b.defaultWeightG ?? undefined,
            defaultVolumeMl: b.defaultVolumeMl ?? undefined,
            expiryToleranceDays: b.expiryToleranceDays ?? undefined,
            bringItemId: b.bringItemId ?? undefined,
            hasDeposit: countOk ? (b.hasDeposit ?? undefined) : false,
            depositCt: countOk && b.hasDeposit ? (b.depositCt ?? null) : null,
            offData: b.offData ?? undefined,
            createdBy: null as unknown as string,
          })
          const product = await productsQ.getProductById(productId)
          const srcs: Record<string, 'manual'> = { name: 'manual' }
          if (b.brand) srcs.brand = 'manual'
          if (b.imageUrl) srcs.image = 'manual'
          if (b.categoryId) srcs.category = 'manual'
          if (b.defaultUnit) srcs.unit = 'manual'
          if (countOk && b.hasDeposit) srcs.deposit = 'manual'
          await productsQ.setFieldSources(productId, srcs as any)
          return jsonRes(product ?? { id: productId }, 201)
        }
      }

      // /api/products/[id]
      if (id && !sub) {
        if (method === 'PATCH') {
          const b = parseBody(init) as Record<string, any>
          const patch: Record<string, unknown> = {}
          if (b.name !== undefined) patch.name = b.name
          if (b.brand !== undefined) patch.brand = b.brand?.trim() || null
          if (b.description !== undefined) patch.description = b.description
          if (b.notes !== undefined) patch.notes = b.notes
          if (b.categoryId !== undefined) patch.categoryId = b.categoryId || null
          if (b.gtin !== undefined) patch.gtin = b.gtin?.trim() || null
          if (b.imageUrl !== undefined) patch.imageUrl = b.imageUrl?.trim() || null

          if (b.defaultUnit !== undefined) {
            const units = (await getUnits(hh)) as unknown as UnitRow[]
            if (!units.some((u) => u.symbol === b.defaultUnit)) {
              return errRes(`Unbekannte Einheit: ${b.defaultUnit}`, 400)
            }
            patch.defaultUnit = b.defaultUnit
          }

          if (b.hasDeposit !== undefined || b.depositCt !== undefined) {
            const units = (await getUnits(hh)) as unknown as UnitRow[]
            const metaMap = buildUnitMetaMap(units)
            const existing = await productsQ.getProductById(id)
            const effectiveUnit = (patch.defaultUnit as string) || existing?.defaultUnit || 'piece'
            const countOk = isCountUnit(effectiveUnit, metaMap)
            if (b.hasDeposit !== undefined) patch.hasDeposit = countOk ? b.hasDeposit : false
            if (b.depositCt !== undefined) patch.depositCt = countOk && b.hasDeposit ? b.depositCt : null
          }

          // packDimension/packSize → defaultVolumeMl / defaultWeightG
          if (b.packDimension !== undefined && b.packSize !== undefined) {
            const sizeN = Number(b.packSize)
            if (Number.isFinite(sizeN)) {
              if (b.packDimension === 'volume') patch.defaultVolumeMl = String(sizeN)
              else if (b.packDimension === 'mass') patch.defaultWeightG = String(sizeN)
            }
          }

          if (Object.keys(patch).length === 0) return errRes('Keine Felder zum Aktualisieren', 400)

          const updated = await productsQ.updateProduct(id, patch)
          if (!updated) return errRes('Not found', 404)
          const product = await productsQ.getProductById(id)

          // Feld-Herkunft 'manual' fuer geaenderte Felder.
          const srcs: Record<string, 'manual'> = {}
          if (patch.name !== undefined) srcs.name = 'manual'
          if (patch.brand !== undefined) srcs.brand = 'manual'
          if (patch.imageUrl !== undefined) srcs.image = 'manual'
          if (patch.categoryId !== undefined) srcs.category = 'manual'
          if (patch.defaultUnit !== undefined) srcs.unit = 'manual'
          if (patch.hasDeposit !== undefined) srcs.deposit = 'manual'
          if (Object.keys(srcs).length > 0) await productsQ.setFieldSources(id, srcs as any)

          return jsonRes(product ?? updated)
        }
        if (method === 'DELETE') {
          // Bestands-Referenz pruefen (Pi: raw db.query.inventoryItems.findFirst).
          const db = getSqliteDb()
          const activeItem = await db.query.inventoryItems.findFirst({
            where: and(
              eq(sqliteSchema.inventoryItems.productId, id),
              eq(sqliteSchema.inventoryItems.householdId, hh),
            ),
            columns: { id: true },
          })
          if (activeItem) {
            return errRes('Produkt hat noch Bestandseintraege. Bitte zuerst alle Eintraege entfernen.', 409)
          }
          const deleted = await productsQ.deleteProduct(id)
          if (!deleted) return errRes('Not found', 404)
          return noContent()
        }
      }

      // /api/products/[id]/<sub>...
      if (id && sub) {
        // ---- delete-all (POST): Produkt inkl. Bestand + Kinder loeschen -------
        // App-Ersatz fuer die Server-Action deleteAll (inventar/[id]).
        if (sub === 'delete-all' && method === 'POST') {
          await productsQ.deleteProductWithInventory(id, hh)
          return noContent()
        }
        // ---- inventory-adjust (POST): Preview + Commit -----------------------
        if (sub === 'inventory-adjust' && method === 'POST') {
          const b = parseBody(init) as Record<string, any>
          const unit = String(b.unit ?? '').trim()
          if (!unit) return errRes('unit ist erforderlich', 400)
          const db = getSqliteDb()

          if (b.preview === true) {
            const newQuantity = Number(b.newQuantity)
            if (!Number.isFinite(newQuantity) || newQuantity < 0) {
              return errRes('newQuantity muss eine Zahl >= 0 sein', 400)
            }
            const [items, units, product] = await Promise.all([
              productsQ.listInventoryForProduct(id, hh),
              getUnits(hh) as unknown as Promise<UnitRow[]>,
              db.query.products.findFirst({
                where: eq(sqliteSchema.products.id, id),
                columns: { defaultUnit: true, defaultVolumeMl: true, defaultWeightG: true },
              }),
            ])
            const metaMap = buildUnitMetaMap(units)
            const packSize = buildPackSize(product ?? {})
            const targetMeta = resolveUnitMeta(unit, metaMap, packSize)
            const newTotalInBase = newQuantity * targetMeta.toBaseFactor
            const plan = planInventoryAdjustment(
              items.map((it: any) => ({ id: it.id, quantity: Number(it.quantity), unit: it.unit, status: it.status })),
              newTotalInBase,
              { dimension: targetMeta.dimension, symbol: targetMeta.symbol },
              metaMap,
              packSize,
            )
            return jsonRes({
              preview: true,
              direction: plan.needsIncrease ? 'increase' : 'decrease',
              updates: plan.updates,
              relevantRows: plan.relevantRows,
              needsIncrease: plan.needsIncrease,
              suggestedNewQuantity: plan.suggestedNewQuantity,
              unit,
            })
          }

          // Commit
          const lines = Array.isArray(b.lines) ? b.lines : []
          const newLine = b.newLine
          if (lines.length === 0 && !newLine) return errRes('Keine Aenderungen uebergeben', 400)
          let touched = 0
          for (const line of lines) {
            if (typeof line?.id !== 'string') continue
            const qn = Number(line.newQuantity)
            if (!Number.isFinite(qn) || qn < 0) continue
            const before = await db.query.inventoryItems.findFirst({
              where: and(
                eq(sqliteSchema.inventoryItems.id, line.id),
                eq(sqliteSchema.inventoryItems.householdId, hh),
              ),
              columns: { quantity: true, status: true },
            })
            if (!before) continue
            const patch: Record<string, unknown> = { quantity: qn }
            if (qn === 0) patch.status = 'consumed'
            else if (before.status === 'consumed') patch.status = 'available'
            await productsQ.updateInventoryItem(line.id, hh, patch)
            touched++
          }
          if (newLine) {
            const qn = Number(newLine.quantity)
            if (Number.isFinite(qn) && qn > 0) {
              await productsQ.createInventoryItem({
                productId: id,
                householdId: hh,
                quantity: qn,
                unit,
                bestBeforeDate: newLine.bestBeforeDate || undefined,
                placeId: newLine.placeId || undefined,
                storeId: newLine.storeId || undefined,
              })
              touched++
              await shoppingListQ.generateAutoNeeds(hh)
            }
          }
          return jsonRes({ ok: true, touched })
        }

        // ---- inventory-hints (GET) ------------------------------------------
        if (sub === 'inventory-hints' && method === 'GET') {
          return jsonRes(await productsQ.suggestStorePlaceForProduct(id, hh))
        }

        // ---- normalize-unit (POST) ------------------------------------------
        if (sub === 'normalize-unit' && method === 'POST') {
          const b = parseBody(init) as { unit?: string; mode?: string }
          const targetUnit = String(b.unit ?? '').trim()
          const mode = b.mode === 'convert' ? 'convert' : 'relabel'
          if (!targetUnit) return errRes('Einheit fehlt', 400)
          const product = await productsQ.getProductById(id)
          if (!product) return errRes('Artikel nicht gefunden', 404)
          const [units, items] = await Promise.all([
            getUnits(hh) as unknown as Promise<UnitRow[]>,
            productsQ.listInventoryForProduct(id, hh),
          ])
          const metaMap = buildUnitMetaMap(units)
          const targetMeta = metaMap.get(targetUnit)
          if (!targetMeta) return errRes('Unbekannte Einheit', 400)
          let converted = 0
          let relabeled = 0
          for (const item of items as any[]) {
            const src = metaMap.get(item.unit)
            const patch: Record<string, unknown> = { unit: targetUnit }
            if (mode === 'convert' && src && src.dimension === targetMeta.dimension && src.dimension !== 'count') {
              const newQty = (Number(item.quantity) * src.toBaseFactor) / targetMeta.toBaseFactor
              patch.quantity = newQty
              converted++
            } else {
              relabeled++
            }
            await productsQ.updateInventoryItem(item.id, hh, patch)
          }
          await productsQ.updateProduct(id, { defaultUnit: targetUnit })
          return jsonRes({ ok: true, unit: targetUnit, mode, items: items.length, converted, relabeled })
        }

        // ---- nutrients (PUT/DELETE) -----------------------------------------
        if (sub === 'nutrients') {
          if (method === 'PUT') {
            const b = parseBody(init) as { nutrientTypeId?: string; valuePer100?: number | string }
            if (!b.nutrientTypeId) return errRes('nutrientTypeId ist erforderlich', 400)
            const value = Number(b.valuePer100)
            if (!Number.isFinite(value) || value < 0) return errRes('Wert muss eine Zahl >= 0 sein', 400)
            const row = await nutrientsQ.upsertProductNutrient({
              productId: id,
              nutrientTypeId: b.nutrientTypeId,
              valuePer100: value,
              source: 'manual',
            })
            return jsonRes(row)
          }
          if (method === 'DELETE') {
            const nutrientTypeId = q.get('nutrientTypeId') ?? ''
            if (!nutrientTypeId) return errRes('nutrientTypeId ist erforderlich', 400)
            const { deleted } = await nutrientsQ.deleteProductNutrient({ productId: id, nutrientTypeId })
            if (!deleted) return errRes('Not found', 404)
            return noContent()
          }
        }

        // ---- prices (GET/POST) + prices/proposals/[proposalId] --------------
        if (sub === 'prices') {
          const sub2 = seg[4]
          if (!sub2) {
            if (method === 'GET') {
              if (q.get('history') === '1') return jsonRes(await pricesQ.listPriceHistory(id, hh))
              return jsonRes(await pricesQ.getCurrentPricesForProductAllStores(id, hh))
            }
            if (method === 'POST') {
              const b = parseBody(init) as Record<string, any>
              if (!b.storeId) return errRes('storeId erforderlich', 400)
              const priceCt = Number(b.priceCt)
              if (!Number.isFinite(priceCt) || priceCt < 0) return errRes('priceCt muss eine Zahl >= 0 sein', 400)
              if (!b.unit) return errRes('unit erforderlich', 400)
              // Store-Ownership pruefen (Pi: raw db.query.stores.findFirst).
              const db = getSqliteDb()
              const store = await db.query.stores.findFirst({
                where: and(eq(sqliteSchema.stores.id, b.storeId), eq(sqliteSchema.stores.householdId, hh)),
                columns: { id: true },
              })
              if (!store) return errRes('Markt nicht gefunden', 404)
              const row = await pricesQ.recordPrice({
                householdId: hh,
                productId: id,
                storeId: b.storeId,
                priceCt: Math.round(priceCt),
                unit: b.unit,
                isReduced: b.isReduced ?? false,
                makePermanent: b.makePermanent ?? false,
                priceIncludesDeposit: b.priceIncludesDeposit ?? false,
                source: 'manual',
                createdBy: null as unknown as string,
              })
              return jsonRes(row, 201)
            }
          }
          // prices/fetch → ONLINE-ONLY (Preis-Scraping). Siehe unten.
          if (sub2 === 'fetch' && method === 'POST') {
            // Offline kein Live-Preis-Abruf → wie „kein Preis gefunden" behandeln,
            // damit die UI nicht bricht (der Aufrufer prueft res.ok + proposed).
            return jsonRes({ proposed: null, reason: 'offline' })
          }
          // prices/proposals/[proposalId] (POST)
          if (sub2 === 'proposals' && method === 'POST') {
            const proposalId = seg[5]
            const b = parseBody(init) as Record<string, any>
            if (b.action === 'reject') {
              const row = await pricesQ.rejectProposedPrice(proposalId, hh)
              if (!row) return errRes('Vorschlag nicht gefunden', 404)
              return jsonRes({ ok: true, price: row })
            }
            if (b.action === 'confirm') {
              if (b.priceCt !== undefined) {
                const pc = Number(b.priceCt)
                if (!Number.isFinite(pc) || pc <= 0) return errRes('Ungueltiger Preis', 400)
              }
              const row = await pricesQ.confirmProposedPrice(proposalId, {
                householdId: hh,
                makePermanent: b.makePermanent,
                priceCt: b.priceCt,
                unit: b.unit,
                isReduced: b.isReduced,
                createdBy: null as unknown as string,
              })
              if (!row) return errRes('Vorschlag nicht gefunden', 404)
              return jsonRes({ ok: true, price: row })
            }
            return errRes('Ungueltige Aktion', 400)
          }
        }

        // ---- sources (GET/DELETE) -------------------------------------------
        if (sub === 'sources') {
          if (method === 'GET') {
            const [sources, product] = await Promise.all([
              productsQ.getFieldSources(id),
              productsQ.getProductById(id),
            ])
            const category = product?.category
              ? { id: product.category.id, name: product.category.name, icon: product.category.icon, slug: product.category.slug }
              : null
            return jsonRes({ sources, category })
          }
          if (method === 'DELETE') {
            const field = q.get('field') ?? ''
            const allowed = ['name', 'brand', 'image', 'category', 'unit']
            if (!field || !allowed.includes(field)) return errRes('Ungueltiges Feld', 400)
            await productsQ.clearFieldSource(id, field as any)
            return noContent()
          }
        }

        // ---- stores (GET/PUT) -----------------------------------------------
        if (sub === 'stores') {
          if (method === 'GET') return jsonRes(await productStoresQ.listStoresForProduct(id, hh))
          if (method === 'PUT') {
            const b = parseBody(init) as { storeIds?: unknown }
            if (!Array.isArray(b.storeIds)) return errRes('storeIds (Array) erforderlich', 400)
            const storeIds = b.storeIds.filter((s): s is string => typeof s === 'string')
            return jsonRes(await productStoresQ.setStoresForProduct(id, hh, storeIds))
          }
        }

        // ---- target (PUT/DELETE) --------------------------------------------
        if (sub === 'target') {
          if (method === 'PUT') {
            const b = parseBody(init) as Record<string, any>
            const unit = String(b.unit ?? '').trim()
            if (!unit) return errRes('unit ist erforderlich', 400)
            const targetQuantity = Number(b.targetQuantity)
            if (!Number.isFinite(targetQuantity) || targetQuantity <= 0) {
              return errRes('targetQuantity muss eine Zahl > 0 sein', 400)
            }
            let minQuantity: number | undefined
            if (b.minQuantity != null) {
              minQuantity = Number(b.minQuantity)
              if (!Number.isFinite(minQuantity) || minQuantity < 0) {
                return errRes('minQuantity muss eine Zahl >= 0 sein', 400)
              }
            }
            const row = await targetsQ.upsertStockTarget({ productId: id, householdId: hh, targetQuantity, unit, minQuantity })
            return jsonRes(row)
          }
          if (method === 'DELETE') {
            const { deleted } = await targetsQ.deleteStockTarget(id, hh)
            if (!deleted) return errRes('Not found', 404)
            return noContent()
          }
        }
      }
    }

    // -----------------------------------------------------------------------
    // /api/nutrient-types
    // -----------------------------------------------------------------------
    if (r === 'nutrient-types') {
      if (method === 'GET') return jsonRes(await nutrientsQ.getNutrientTypes())
      if (method === 'POST') {
        const b = parseBody(init) as { name?: unknown; unit?: unknown }
        const name = typeof b.name === 'string' ? b.name.trim() : ''
        const unit = typeof b.unit === 'string' ? b.unit.trim() : ''
        if (!name || !unit) return errRes('Name und Einheit sind erforderlich', 400)
        const type = await nutrientsQ.createNutrientType({ name, unit })
        return jsonRes(type, 201)
      }
    }

    // -----------------------------------------------------------------------
    // /api/shopping-list
    // -----------------------------------------------------------------------
    if (r === 'shopping-list') {
      const id = seg[2]
      if (!id) {
        if (method === 'GET') return jsonRes(await shoppingListQ.getShoppingList(hh))
        if (method === 'POST') {
          const b = parseBody(init) as Record<string, any>
          const freeTextName = typeof b.freeTextName === 'string' ? b.freeTextName.trim() : ''
          if (!freeTextName) return errRes('Bezeichnung ist erforderlich', 400)
          const qty = b.quantity != null ? Number(b.quantity) : 1
          if (!Number.isFinite(qty) || qty <= 0) return errRes('Menge muss eine Zahl > 0 sein', 400)
          const row = await shoppingListQ.addManualItem({
            householdId: hh,
            freeTextName,
            quantity: qty,
            unit: typeof b.unit === 'string' && b.unit ? b.unit : 'piece',
            notes: b.notes ?? null,
          })
          return jsonRes(row, 201)
        }
      } else if (id === 'generate') {
        if (method === 'POST') return jsonRes(await shoppingListQ.generateAutoNeeds(hh))
      } else {
        if (method === 'PATCH') {
          const b = parseBody(init) as Record<string, any>
          const patch: Record<string, unknown> = {}
          if (typeof b.isChecked === 'boolean') patch.isChecked = b.isChecked
          if (b.quantity !== undefined) {
            const qn = Number(b.quantity)
            if (!Number.isFinite(qn) || qn <= 0) return errRes('Menge muss > 0 sein', 400)
            patch.quantity = qn
          }
          if (typeof b.unit === 'string') patch.unit = b.unit
          if (b.notes !== undefined) patch.notes = b.notes
          if (Object.keys(patch).length === 0) return errRes('Keine Felder zum Aktualisieren', 400)
          const row = await shoppingListQ.updateShoppingItem(id, hh, patch)
          if (!row) return errRes('Not found', 404)
          return jsonRes(row)
        }
        if (method === 'DELETE') {
          const { deleted, reserved } = await shoppingListQ.deleteShoppingItem(id, hh)
          if (reserved) return errRes('Dieser Bedarf ist einem Einkauf zugewiesen. Erst dort freigeben.', 409)
          if (!deleted) return errRes('Not found', 404)
          return noContent()
        }
      }
    }

    // -----------------------------------------------------------------------
    // /api/shopping-trips  (inkl. items-Unterrouten)
    // -----------------------------------------------------------------------
    if (r === 'shopping-trips') {
      const id = seg[2]
      const sub = seg[3] // 'items'
      const itemId = seg[4]
      const sub2 = seg[5] // 'book-in'

      if (!id) {
        if (method === 'GET') return jsonRes(await tripsQ.listTrips(hh))
        if (method === 'POST') {
          const b = parseBody(init) as { name?: string; storeId?: string }
          const trip = await tripsQ.createTrip({ householdId: hh, name: b.name ?? null, storeId: b.storeId ?? null })
          return jsonRes(trip, 201)
        }
      } else if (!sub) {
        if (method === 'GET') {
          const trip = await tripsQ.getTrip(id, hh)
          if (!trip) return errRes('Not found', 404)
          return jsonRes(trip)
        }
        if (method === 'PATCH') {
          const b = parseBody(init) as { action?: string; name?: string; storeId?: string }
          if (b.action) {
            let row
            if (b.action === 'pause') row = await tripsQ.pauseTrip(id, hh)
            else if (b.action === 'resume') row = await tripsQ.resumeTrip(id, hh)
            else if (b.action === 'end') row = await tripsQ.endTrip(id, hh)
            else return errRes('Unbekannte Aktion', 400)
            if (!row) return errRes('Uebergang nicht moeglich (Status/Not found)', 409)
            return jsonRes(row)
          }
          const patch: Record<string, unknown> = {}
          if (b.name !== undefined) patch.name = b.name
          if (b.storeId !== undefined) patch.storeId = b.storeId
          if (Object.keys(patch).length === 0) return errRes('Keine Felder zum Aktualisieren', 400)
          const row = await tripsQ.updateTrip(id, hh, patch)
          if (!row) return errRes('Not found', 404)
          return jsonRes(row)
        }
        if (method === 'DELETE') {
          const { deleted } = await tripsQ.deleteTrip(id, hh)
          if (!deleted) return errRes('Not found', 404)
          return noContent()
        }
      } else if (sub === 'items' && !itemId) {
        if (method === 'POST') {
          const b = parseBody(init) as { shoppingListItemId?: string; reserveAllForStore?: string }
          if (b.shoppingListItemId) {
            const row = await tripsQ.reserveNeed(b.shoppingListItemId, id, hh)
            if (!row) return errRes('Bedarf oder Einkauf nicht gefunden', 404)
            return jsonRes(row, 201)
          }
          if (b.reserveAllForStore !== undefined) {
            const { reserved } = await tripsQ.reserveAllForStore(id, b.reserveAllForStore, hh)
            return jsonRes({ reserved })
          }
          return errRes('shoppingListItemId oder reserveAllForStore erforderlich', 400)
        }
      } else if (sub === 'items' && itemId && !sub2) {
        if (method === 'PATCH') {
          const b = parseBody(init) as { toTripId?: string; realStatus?: string; quantity?: number; notes?: string }
          if (b.toTripId) {
            const row = await tripsQ.moveTripItem(itemId, b.toTripId, hh)
            if (!row) return errRes('Position oder Ziel-Einkauf nicht gefunden', 404)
            return jsonRes(row)
          }
          const patch: Record<string, unknown> = {}
          if (b.realStatus !== undefined) patch.realStatus = b.realStatus
          if (b.quantity !== undefined) patch.quantity = b.quantity
          if (b.notes !== undefined) patch.notes = b.notes
          if (Object.keys(patch).length === 0) return errRes('Keine Felder zum Aktualisieren', 400)
          const row = await tripsQ.updateTripItem(itemId, hh, patch)
          if (!row) return errRes('Not found', 404)
          return jsonRes(row)
        }
        if (method === 'DELETE') {
          const { deleted } = await tripsQ.releaseTripItem(itemId, hh)
          if (!deleted) return errRes('Not found', 404)
          return noContent()
        }
      } else if (sub === 'items' && itemId && sub2 === 'book-in') {
        if (method === 'POST') {
          const { booked } = await tripsQ.bookInTripItem(itemId, hh)
          if (!booked) return errRes('Position nicht gefunden', 404)
          return jsonRes({ ok: true })
        }
      }
    }

    // -----------------------------------------------------------------------
    // /api/stores  (Pi: inline-drizzle. Kein Query-Modul → hier direkt via getDb)
    // -----------------------------------------------------------------------
    if (r === 'stores') {
      const id = seg[2]
      const sub = seg[3]
      const db = getSqliteDb()
      const S = sqliteSchema.stores

      if (!id) {
        if (method === 'GET') {
          const rows = await db.select().from(S).where(eq(S.householdId, hh)).orderBy(S.name)
          return jsonRes(rows)
        }
        if (method === 'POST') {
          const b = parseBody(init) as Record<string, any>
          const nameT = (b.name ?? '').trim()
          const addressT = (b.address ?? '').trim()
          const cityT = (b.city ?? '').trim()
          if (!nameT) return errRes('Name ist erforderlich', 400)
          if (!addressT) return errRes('Adresse ist erforderlich', 400)
          if (!cityT) return errRes('Stadt ist erforderlich', 400)
          const normalizedUrl = normalizeScrapeUrl(b.scrapeUrl)
          if (normalizedUrl === INVALID_URL) return errRes('Ungueltige Abruf-URL (nur http/https)', 400)
          if (normalizedUrl === MISSING_EAN_PLACEHOLDER) return errRes('Abruf-URL muss den Platzhalter {EAN} enthalten', 400)
          const [store] = await db.insert(S).values({
            id: crypto.randomUUID(),
            householdId: hh,
            name: nameT,
            chain: (b.chain ?? '').trim() || null,
            address: addressT,
            city: cityT,
            latitude: coordToDb(b.latitude),
            longitude: coordToDb(b.longitude),
            scrapeUrl: normalizedUrl as string | null,
          }).returning()
          return jsonRes(store, 201)
        }
      } else if (!sub) {
        if (method === 'GET') {
          const [store] = await db.select().from(S).where(and(eq(S.id, id), eq(S.householdId, hh)))
          if (!store) return errRes('Not found', 404)
          return jsonRes(store)
        }
        if (method === 'PATCH') {
          const b = parseBody(init) as Record<string, any>
          const patch: Record<string, unknown> = {}
          if (b.name !== undefined) patch.name = b.name
          if (b.chain !== undefined) patch.chain = b.chain ?? null
          if (b.address !== undefined) patch.address = b.address ?? null
          if (b.city !== undefined) patch.city = b.city ?? null
          if (b.latitude !== undefined) patch.latitude = coordToDb(b.latitude)
          if (b.longitude !== undefined) patch.longitude = coordToDb(b.longitude)
          if (b.scrapeUrl !== undefined) {
            const normalizedUrl = normalizeScrapeUrl(b.scrapeUrl)
            if (normalizedUrl === INVALID_URL) return errRes('Ungueltige Abruf-URL (nur http/https)', 400)
            if (normalizedUrl === MISSING_EAN_PLACEHOLDER) return errRes('Abruf-URL muss den Platzhalter {EAN} enthalten', 400)
            patch.scrapeUrl = normalizedUrl
          }
          if (Object.keys(patch).length === 0) return errRes('No fields to update', 400)
          const [updated] = await db.update(S).set(patch).where(and(eq(S.id, id), eq(S.householdId, hh))).returning()
          if (!updated) return errRes('Not found', 404)
          return jsonRes(updated)
        }
        if (method === 'DELETE') {
          const [store] = await db.select({ id: S.id, name: S.name, chain: S.chain }).from(S).where(and(eq(S.id, id), eq(S.householdId, hh)))
          if (!store) return errRes('Not found', 404)
          const [{ value: refCount }] = await db
            .select({ value: count() })
            .from(sqliteSchema.inventoryItems)
            .where(eq(sqliteSchema.inventoryItems.storeId, id))
          if (refCount > 0) return jsonRes({ error: 'Markt wird noch von Bestaenden verwendet', count: refCount }, 409)
          await db.delete(S).where(eq(S.id, id))
          return jsonRes({ ok: true })
        }
      } else if (sub === 'prices' && seg[4] === 'fetch-all' && method === 'POST') {
        // ONLINE-ONLY (Preis-Scraping ueber Globus). Offline nicht moeglich →
        // neutrale Bilanz zurueck, damit die UI nicht bricht.
        return jsonRes({ requested: 0, proposedCreated: 0, skipped: 0, failed: 0, skippedItems: [], failedItems: [] })
      }
    }

    // -----------------------------------------------------------------------
    // /api/units  (Pi: inline-drizzle. Kein Query-Modul fuer CUD → getDb direkt)
    // -----------------------------------------------------------------------
    if (r === 'units') {
      const id = seg[2]
      const db = getSqliteDb()
      const U = sqliteSchema.units

      if (!id) {
        if (method === 'GET') return jsonRes(await getUnits(hh))
        if (method === 'POST') {
          const b = parseBody(init) as Record<string, any>
          if (!b.name?.trim() || !b.symbol?.trim()) return errRes('name and symbol are required', 400)
          const dim = b.dimension ?? 'count'
          if (!['mass', 'volume', 'count'].includes(dim)) return errRes('dimension muss mass, volume oder count sein', 400)
          const factorNum = b.toBaseFactor != null ? Number(b.toBaseFactor) : 1
          if (!Number.isFinite(factorNum) || factorNum <= 0) return errRes('toBaseFactor muss eine Zahl > 0 sein', 400)
          const [newUnit] = await db.insert(U).values({
            id: crypto.randomUUID(),
            householdId: hh,
            name: b.name.trim(),
            symbol: b.symbol.trim(),
            dimension: dim,
            toBaseFactor: String(factorNum),
            isSystem: false,
            sortOrder: 100,
          }).returning()
          return jsonRes(newUnit, 201)
        }
      } else {
        // Bestehende Einheit laden (fuer DELETE/PATCH-Validierung).
        const [unit] = await db.select().from(U).where(eq(U.id, id))
        if (method === 'DELETE') {
          if (!unit) return errRes('Not found', 404)
          if (unit.isSystem) return errRes('System units cannot be deleted', 403)
          if (unit.householdId !== hh) return errRes('Not found', 404)
          const [{ usedBy }] = await db
            .select({ usedBy: count() })
            .from(sqliteSchema.inventoryItems)
            .where(and(eq(sqliteSchema.inventoryItems.householdId, hh), eq(sqliteSchema.inventoryItems.unit, unit.symbol)))
          if (usedBy > 0) {
            return jsonRes({ error: `Diese Einheit wird von ${usedBy} Artikel(n) verwendet und kann nicht geloescht werden.`, usedBy }, 409)
          }
          await db.delete(U).where(eq(U.id, id))
          return jsonRes({ ok: true })
        }
        if (method === 'PATCH') {
          const b = parseBody(init) as Record<string, any>
          if (b.name !== undefined && typeof b.name !== 'string') return errRes('name muss ein String sein', 400)
          if (b.symbol !== undefined && typeof b.symbol !== 'string') return errRes('symbol muss ein String sein', 400)
          if (b.dimension !== undefined && !['mass', 'volume', 'count'].includes(b.dimension)) return errRes('dimension muss mass, volume oder count sein', 400)
          let factorNum: number | undefined
          if (b.toBaseFactor !== undefined) {
            factorNum = Number(b.toBaseFactor)
            if (!Number.isFinite(factorNum) || factorNum <= 0) return errRes('toBaseFactor muss eine Zahl > 0 sein', 400)
          }
          const trimmedName = b.name?.trim()
          const trimmedSymbol = b.symbol?.trim()
          if (trimmedName !== undefined && trimmedName.length === 0) return errRes('Name darf nicht leer sein', 400)
          if (trimmedSymbol !== undefined && trimmedSymbol.length === 0) return errRes('Kuerzel darf nicht leer sein', 400)
          if (!unit) return errRes('Not found', 404)
          if (unit.isSystem) return errRes('System-Einheiten koennen nicht bearbeitet werden', 403)
          if (unit.householdId !== hh) return errRes('Not found', 404)
          const updates: Record<string, unknown> = {}
          if (trimmedName !== undefined) updates.name = trimmedName
          if (trimmedSymbol !== undefined) updates.symbol = trimmedSymbol
          if (b.dimension !== undefined) updates.dimension = b.dimension
          if (factorNum !== undefined) updates.toBaseFactor = String(factorNum)
          if (Object.keys(updates).length === 0) return jsonRes(unit)
          const oldSymbol = unit.symbol
          const [updated] = await db.update(U).set(updates).where(eq(U.id, id)).returning()
          if (updates.symbol && updates.symbol !== oldSymbol) {
            await db.update(sqliteSchema.inventoryItems)
              .set({ unit: updates.symbol as string })
              .where(and(eq(sqliteSchema.inventoryItems.householdId, hh), eq(sqliteSchema.inventoryItems.unit, oldSymbol)))
          }
          return jsonRes(updated)
        }
      }
    }

    // -----------------------------------------------------------------------
    // /api/version  (Pi liest Build-Konstanten + fragt GitHub. Offline: kein
    // Netz → statischer Fallback, updateAvailable nicht pruefbar.)
    // -----------------------------------------------------------------------
    if (r === 'version' && method === 'GET') {
      const v = `v${__STOQR_VERSION__}`
      return jsonRes({
        current: { gitSha: v, gitShaShort: v, gitRef: 'app', buildTime: 'unknown' },
        version: __STOQR_VERSION__,
        latest: null,
        updateAvailable: null,
        reason: 'offline',
      })
    }

    // -----------------------------------------------------------------------
    // /api/settings/price-scrape  (Einstellungs-Flag, App-Ersatz fuer die
    // gleichnamige SvelteKit-Server-Form-Action, die im SPA nicht laeuft)
    // -----------------------------------------------------------------------
    // expiry_config.price_scrape_enabled ist eine reine gespeicherte Praeferenz
    // (der Online-Preis-Abruf selbst degradiert offline ohnehin gnaedig, s.u.
    // prices/fetch -> reason:'offline'). Upsert wie der Pi-Server (+page.server.ts
    // updatePriceScrape), nur gegen die On-Device-SQLite + lokale Identitaet.
    if (r === 'settings' && seg[2] === 'price-scrape') {
      if (method !== 'PATCH' && method !== 'POST') return errRes('Method not allowed', 405)
      const db = getSqliteDb()
      const b = parseBody(init) as { enabled?: unknown }
      const enabled = b.enabled === true || b.enabled === 'true'
      const EC = sqliteSchema.expiryConfig
      await db
        .insert(EC)
        .values({ id: crypto.randomUUID(), householdId: hh, priceScrapeEnabled: enabled })
        .onConflictDoUpdate({
          target: EC.householdId,
          set: { priceScrapeEnabled: enabled },
        })
      return jsonRes({ action: 'updatePriceScrape', success: true, enabled })
    }

    // -----------------------------------------------------------------------
    // /api/settings/expiry-tolerance  (MHD-Ampel global, on-device)
    // -----------------------------------------------------------------------
    // App-Ersatz fuer die Server-Form-Action updateGlobalTolerance. Upsert der
    // yellow/red/grace-Schwellen in expiry_config; rot<=gelb wie auf dem Pi.
    if (r === 'settings' && seg[2] === 'expiry-tolerance') {
      if (method !== 'PATCH' && method !== 'POST') return errRes('Method not allowed', 405)
      const db = getSqliteDb()
      const b = parseBody(init) as {
        yellowDaysBefore?: unknown
        redDaysBefore?: unknown
        graceDaysAfter?: unknown
      }
      const yellowDaysBefore = Number(b.yellowDaysBefore)
      const redDaysBefore = Number(b.redDaysBefore)
      const graceDaysAfter = Number(b.graceDaysAfter)
      if (
        !Number.isInteger(yellowDaysBefore) ||
        !Number.isInteger(redDaysBefore) ||
        !Number.isInteger(graceDaysAfter) ||
        yellowDaysBefore < 0 ||
        redDaysBefore < 0 ||
        graceDaysAfter < 0 ||
        redDaysBefore > yellowDaysBefore
      ) {
        return errRes('Ungueltige Werte. Rot-Schwelle muss kleiner oder gleich Gelb-Schwelle sein.', 422)
      }
      const EC = sqliteSchema.expiryConfig
      await db
        .insert(EC)
        .values({ id: crypto.randomUUID(), householdId: hh, yellowDaysBefore, redDaysBefore, graceDaysAfter })
        .onConflictDoUpdate({
          target: EC.householdId,
          set: { yellowDaysBefore, redDaysBefore, graceDaysAfter },
        })
      return jsonRes({ action: 'updateGlobalTolerance', success: true })
    }

    // -----------------------------------------------------------------------
    // /api/settings/sync  (App-Sync-Konfiguration, on-device in `meta`)
    // -----------------------------------------------------------------------
    // Der Pi-Endpoint ist ein Phase-1-Stub; im App-Target persistiert die
    // gemeinsame SyncSettings-Komponente hier gegen die meta-Tabelle
    // (key/value). leader ('app'|'pi') + piUrl. Ohne diesen Zweig lief die POST
    // in die 404-Fallthrough ("Not found").
    if (r === 'settings' && seg[2] === 'sync') {
      const db = getSqliteDb()
      const M = sqliteSchema.meta
      if (method === 'GET') {
        const rows = await db
          .select({ key: M.key, value: M.value })
          .from(M)
          .where(inArray(M.key, ['sync.leader', 'sync.piUrl']))
        const map = new Map(rows.map((x) => [x.key, x.value]))
        const leader = map.get('sync.leader') === 'pi' ? 'pi' : 'app'
        return jsonRes({ leader, piUrl: map.get('sync.piUrl') ?? '' })
      }
      if (method === 'POST') {
        const b = parseBody(init) as { leader?: unknown; piUrl?: unknown }
        const leader = b.leader === 'pi' ? 'pi' : 'app'
        const piUrl = typeof b.piUrl === 'string' ? b.piUrl.trim() : ''
        const upsert = async (key: string, value: string) => {
          await db
            .insert(M)
            .values({ key, value })
            .onConflictDoUpdate({ target: M.key, set: { value, updatedAt: new Date() } })
        }
        await upsert('sync.leader', leader)
        await upsert('sync.piUrl', piUrl)
        return jsonRes({ ok: true, leader, piUrl })
      }
      return errRes('Method not allowed', 405)
    }

    // -----------------------------------------------------------------------
    // /api/settings/reset  (Werksreset A/B/C, on-device)
    // -----------------------------------------------------------------------
    // App-Ersatz fuer die Server-Form-Action resetHousehold. Phrase muss exakt
    // zur Stufe passen (Type-to-Confirm, ASCII). Ohne Audit (routeApp-Konvention).
    if (r === 'settings' && seg[2] === 'reset' && method === 'POST') {
      const b = parseBody(init) as { stage?: unknown; confirm?: unknown }
      const stage = String(b.stage ?? '')
      const confirm = String(b.confirm ?? '')
      const expected = resetQ.RESET_PHRASES[stage]
      if (!expected) return errRes('Unbekannte Reset-Stufe.', 422)
      if (confirm !== expected) {
        return errRes('Bestaetigungstext stimmt nicht. Bitte die angezeigte Phrase exakt eintippen.', 422)
      }
      await resetQ.resetHousehold(hh, stage as resetQ.ResetStage)
      return jsonRes({ action: 'resetHousehold', success: true, stage })
    }

    // -----------------------------------------------------------------------
    // /api/transfer/export | /api/transfer/import  (Datei-Erstbefuellung)
    // -----------------------------------------------------------------------
    // Identisch zu den Pi-Endpoints (api/transfer/*), nur gegen die On-Device-
    // SQLite und die lokale Identitaet. Das eigentliche File-IO (speichern/teilen
    // bzw. Datei-Lesen) macht die UI ueber transfer.app.ts — hier fliesst nur der
    // Envelope-Text. REPLACE ist destruktiv → confirm=true erforderlich.
    if (r === 'transfer') {
      const action = seg[2]
      const db = getSqliteDb()

      if (action === 'export' && method === 'GET') {
        const scopeRaw = q.get('scope') ?? 'alles'
        if (!isTier(scopeRaw)) return errRes(`Unbekannter scope: ${scopeRaw}`, 400)
        const envelope = await collectExport({
          db,
          schema: SQLITE_TRANSFER_SCHEMA,
          ops: TRANSFER_OPS,
          sourceSystem: 'app',
          scope: scopeRaw,
          householdId: hh,
          exportedAt: new Date().toISOString(),
        })
        // Envelope-Text im Body (die UI schreibt/teilt die Datei via Capacitor).
        return jsonRes({ scope: scopeRaw, file: serializeEnvelope(envelope), exportedAt: envelope.exportedAt })
      }

      if (action === 'import' && method === 'POST') {
        const b = parseBody(init) as { confirm?: boolean; file?: string }
        if (b.confirm !== true) return errRes('Import nicht bestaetigt (confirm=true erforderlich).', 400)
        if (typeof b.file !== 'string' || !b.file.length) return errRes('Feld file (Datei-Inhalt) fehlt.', 400)
        try {
          const result = await applyImport({
            db,
            schema: SQLITE_TRANSFER_SCHEMA,
            ops: TRANSFER_OPS,
            fileText: b.file,
            targetHouseholdId: hh,
            targetUserId: LOCAL_USER_ID,
            newId: () => crypto.randomUUID(),
          })
          return jsonRes(result)
        } catch (err) {
          return errRes(`Import fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`, 400)
        }
      }
    }

    // =======================================================================
    // ONLINE-ONLY-Endpoints → gnaedige Degradation (KEINE Query-Aufrufe)
    // =======================================================================
    // /api/catalog/search — Globus-Live-Suche. Offline: leere Trefferliste,
    // live:false (die UI zeigt dann nur lokale/keine Katalogtreffer).
    if (r === 'catalog' && seg[2] === 'search' && method === 'GET') {
      return jsonRes({ results: [], live: false })
    }
    // /api/catalog/snapshots/[id] — Snapshot-Aktionen basieren auf Globus-Sync.
    // Offline nicht sinnvoll → 503, die UI behandelt non-ok als „nicht moeglich".
    if (r === 'catalog' && seg[2] === 'snapshots' && method === 'POST') {
      return errRes('Offline: Katalog-Snapshots nicht verfuegbar', 503)
    }
    // /api/catalog/sync — Globus-Scraping. Offline nicht moeglich.
    if (r === 'catalog' && seg[2] === 'sync' && method === 'POST') {
      return errRes('Offline: Katalog-Sync nicht verfuegbar', 503)
    }
    // /api/geo/search — OSM/Nominatim-Geokodierung. Offline: leere Trefferliste.
    if (r === 'geo' && seg[2] === 'search' && method === 'GET') {
      return jsonRes({ results: [] })
    }
    // /api/barcode/[gtin] — Open Food Facts Online-Lookup. Offline: found:false,
    // damit die UI zur manuellen Eingabe wechselt (wie OFF-„nicht gefunden").
    if (r === 'barcode' && method === 'GET') {
      return jsonRes({ found: false })
    }
    // /api/ocr/mhd — SPEZIAL: kein Scraping. Soll spaeter in-browser Tesseract.js
    // laufen. Bis dahin Stub.
    if (r === 'ocr' && seg[2] === 'mhd' && method === 'POST') {
      // TODO(#295): in-browser Tesseract via parseMhdText (wird im Shell-Task verdrahtet)
      return jsonRes({ found: false, date: null, raw: '' })
    }
    // /api/auth/[...auth] und /api/health — im Offline-App-Target ungenutzt.
    if (r === 'auth' || r === 'health') {
      return errRes('Not found', 404)
    }

    // -----------------------------------------------------------------------
    // Kein Treffer: Methode/Pfad nicht implementiert.
    // -----------------------------------------------------------------------
    return errRes(`Not found: ${method} ${url.pathname}`, 404)
  } catch (err) {
    return jsonRes({ error: String(err) }, 500)
  }
}
