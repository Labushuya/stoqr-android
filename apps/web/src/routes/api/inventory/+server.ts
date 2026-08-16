import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import {
  getInventoryItems,
  getInventoryItem,
  createInventoryItem,
  createProduct,
  setFieldSources,
  type ProductField,
  getOrCreateProductByGtin,
} from '$lib/server/queries/products'
import { requireHouseholdId } from '$lib/server/queries/households'
import { writeAudit } from '$lib/server/queries/audit'
import { recordPrice } from '$lib/server/queries/prices'
import { addStoreForProduct } from '$lib/server/queries/product-stores'
import { getDb } from '$lib/server/db'
import { places, storages, locations, nutrientTypes, productNutrients, products } from '@stoqr/db'
import { eq, inArray } from 'drizzle-orm'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NutrientInput {
  slug: string
  value: number
  unit: string
}

// ---------------------------------------------------------------------------
// GET /api/inventory
// ---------------------------------------------------------------------------

export const GET: RequestHandler = async ({ locals, url }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 })
  }

  const householdId = await requireHouseholdId(locals.user.id)
  const placeId = url.searchParams.get('placeId') ?? undefined
  const status = url.searchParams.get('status') ?? undefined

  const items = await getInventoryItems(householdId, { placeId, status })
  return json(items)
}

// ---------------------------------------------------------------------------
// POST /api/inventory
// ---------------------------------------------------------------------------

export const POST: RequestHandler = async ({ locals, request }) => {
  const db = getDb()
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 })
  }

  const householdId = await requireHouseholdId(locals.user.id)
  const body = await request.json()
  const {
    // Product resolution
    productId,
    productName,
    gtin,
    brand,
    imageUrl,
    categoryId,
    defaultUnit,
    defaultWeightG,
    defaultVolumeML,
    nutrients,
    // Inventory item fields
    placeId,
    quantity,
    unit,
    bestBeforeDate,
    notes,
    storeId,
    // Preis (Block F): Kaufpreis am Bestand + optional Preis-Historieneintrag
    purchasePriceCt,
    priceUnit,
    priceIsReduced,
    pricePermanent,
    recordPrice: doRecordPrice,
  } = body as {
    productId?: string
    productName?: string
    gtin?: string
    brand?: string
    imageUrl?: string
    categoryId?: string
    defaultUnit?: string
    defaultWeightG?: number
    defaultVolumeML?: number
    nutrients?: NutrientInput[]
    placeId?: string
    quantity: number
    unit: string
    bestBeforeDate?: string
    notes?: string
    storeId?: string
    purchasePriceCt?: number | null
    priceUnit?: string
    priceIsReduced?: boolean
    pricePermanent?: boolean
    recordPrice?: boolean
  }

  const qty = Number(quantity)
  if (isNaN(qty) || qty < 0 || !unit) {
    return json({ error: 'Menge muss eine gültige Zahl >= 0 sein und Einheit ist erforderlich' }, { status: 400 })
  }

  // ---------------------------------------------------------------------------
  // Resolve / create product
  // ---------------------------------------------------------------------------

  let resolvedProductId: string | undefined = productId
  let existingProductReused = false

  if (!resolvedProductId) {
    if (!productName) {
      return json({ error: 'productId or productName is required' }, { status: 400 })
    }

    // When a GTIN is supplied, reuse an existing product record to avoid duplicates
    if (gtin) {
      const existing = await getOrCreateProductByGtin(gtin)
      if (existing) {
        resolvedProductId = existing.id
        existingProductReused = true
      }
    }

    if (!resolvedProductId) {
      resolvedProductId = await createProduct({
        name: productName,
        gtin: gtin ?? undefined,
        brand: brand ?? undefined,
        imageUrl: imageUrl ?? undefined,
        categoryId: categoryId ?? undefined,
        defaultUnit: defaultUnit ?? unit,
        defaultWeightG: defaultWeightG ?? undefined,
        defaultVolumeMl: defaultVolumeML ?? undefined,
        createdBy: locals.user.id,
      })
      // Beim Anlegen ueber easy-add stammt der Payload aus einem OFF-/Barcode-Scan
      // → gesetzte Stammdaten-Felder als 'off' kennzeichnen (G15).
      const srcs: Partial<Record<ProductField, 'off'>> = { name: 'off' }
      if (brand) srcs.brand = 'off'
      if (imageUrl) srcs.image = 'off'
      if (categoryId) srcs.category = 'off'
      if (defaultUnit ?? unit) srcs.unit = 'off'
      await setFieldSources(resolvedProductId, srcs)
    }
  } else {
    // productId was supplied directly — treat as reusing an existing product
    existingProductReused = true
  }

  // Only update categoryId on the product if it was newly created (not reused).
  // Reused products keep their existing category to avoid silent overwrites.
  if (categoryId && resolvedProductId && !existingProductReused) {
    await db.update(products)
      .set({ categoryId })
      .where(eq(products.id, resolvedProductId))
  }

  // ---------------------------------------------------------------------------
  // Upsert nutrients when provided
  // ---------------------------------------------------------------------------

  if (nutrients && nutrients.length > 0) {
    const slugs = nutrients.map((n) => n.slug)

    // Fetch all matching nutrient_type rows in one query
    const typeRows = await db
      .select({ id: nutrientTypes.id, slug: nutrientTypes.slug })
      .from(nutrientTypes)
      .where(inArray(nutrientTypes.slug, slugs))

    const typeBySlug = new Map(typeRows.map((r: any) => [r.slug, r.id]))

    const rows = nutrients
      .filter((n) => typeBySlug.has(n.slug))
      .map((n) => ({
        productId: resolvedProductId as string,
        nutrientTypeId: typeBySlug.get(n.slug) as string,
        valuePer100: n.value.toString(),
        source: 'off' as const,
        updatedAt: new Date(),
      }))

    if (rows.length > 0) {
      // Upsert each row — ON CONFLICT (product_id, nutrient_type_id) DO UPDATE
      await Promise.all(
        rows.map((row) =>
          db
            .insert(productNutrients)
            .values(row)
            .onConflictDoUpdate({
              target: [productNutrients.productId, productNutrients.nutrientTypeId],
              set: {
                valuePer100: row.valuePer100,
                source: row.source,
                updatedAt: row.updatedAt,
              },
            })
        )
      )
    }
  }

  // ---------------------------------------------------------------------------
  // Verify place ownership
  // ---------------------------------------------------------------------------

  if (placeId) {
    const [placeRow] = await db
      .select({ locationHouseholdId: locations.householdId })
      .from(places)
      .innerJoin(storages, eq(places.storageId, storages.id))
      .innerJoin(locations, eq(storages.locationId, locations.id))
      .where(eq(places.id, placeId))

    if (!placeRow || placeRow.locationHouseholdId !== householdId) {
      return json({ error: 'Place not found' }, { status: 404 })
    }
  }

  // ---------------------------------------------------------------------------
  // Create inventory item
  // ---------------------------------------------------------------------------

  const item = await createInventoryItem({
    productId: resolvedProductId as string,
    householdId,
    placeId: placeId ?? undefined,
    quantity: qty,
    unit,
    bestBeforeDate: bestBeforeDate ?? undefined,
    notes: notes ?? undefined,
    storeId: storeId ?? undefined,
    gtin: gtin ?? undefined,
    purchasePriceCt: purchasePriceCt ?? undefined,
  })

  // Ist-Herkunftsmarkt ergaenzend als Bezugsquelle am Artikel merken (G8-2),
  // damit die Markt-Zuordnung (product_stores) nach dem Einbuchen stimmt und
  // kuenftige Bestaende diesen Markt vorgeschlagen bekommen. Best-effort.
  if (storeId && resolvedProductId) {
    try {
      await addStoreForProduct(resolvedProductId, householdId, storeId)
    } catch (err) {
      console.error('[inventory POST] addStoreForProduct fehlgeschlagen', err)
    }
  }

  // Audit-Log: neuer Bestandsartikel (nach erfolgreicher Mutation).
  await writeAudit({
    householdId,
    userId: locals.user.id,
    action: 'INSERT',
    tableName: 'inventory_items',
    recordId: item.id,
    newValues: {
      productId: resolvedProductId as string,
      quantity: item.quantity,
      unit: item.unit,
      storeId: storeId ?? null,
      placeId: placeId ?? null,
      bestBeforeDate: bestBeforeDate ?? null,
      purchasePriceCt: purchasePriceCt ?? null,
    },
  })

  // Preis-Historie (Block F): nur wenn ausdrücklich angefordert, Preis + Markt vorhanden.
  // Bei mehreren Chargen sendet nur die erste Zeile recordPrice=true (keine Dubletten).
  if (doRecordPrice && purchasePriceCt != null && storeId) {
    const priceRow = await recordPrice({
      householdId,
      productId: resolvedProductId as string,
      storeId,
      priceCt: purchasePriceCt,
      unit: priceUnit ?? unit,
      isReduced: priceIsReduced ?? false,
      makePermanent: pricePermanent ?? false,
      source: 'booked',
      createdBy: locals.user.id,
    })
    if (priceRow) {
      await writeAudit({
        householdId,
        userId: locals.user.id,
        action: 'INSERT',
        tableName: 'product_prices',
        recordId: priceRow.id,
        newValues: {
          productId: resolvedProductId as string,
          storeId,
          priceCt: purchasePriceCt,
          unit: priceUnit ?? unit,
          isReduced: priceIsReduced ?? false,
          isCurrent: priceRow.isCurrent,
          source: 'booked',
        },
      })
    }
  }

  // Return the full item with product info (mirrors GET /api/inventory/[id])
  const fullItem = await getInventoryItem(item.id, householdId)

  return json(fullItem ?? item, { status: 201 })
}
