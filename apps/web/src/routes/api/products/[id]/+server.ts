import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { deleteProduct, updateProduct, getProductById, setFieldSources, type ProductField } from '$lib/server/queries/products'
import { requireHouseholdId, getUnits } from '$lib/server/queries/households'
import { writeAudit } from '$lib/server/queries/audit'
import { isUniqueViolation } from '$lib/server/db-errors'
import { buildUnitMetaMap, isCountUnit, type UnitRow } from '$lib/utils/stock'
import { getDb } from '$lib/server/db'

/**
 * PATCH /api/products/:id
 *
 * Updates an article's master data (name, description, category, default unit,
 * notes). Products are global/shared across households, so no household scoping
 * on the row itself — auth is still required.
 */
export const PATCH: RequestHandler = async ({ locals, params, request }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    // Enforce the caller belongs to a household (consistent with other routes)
    const householdId = await requireHouseholdId(locals.user.id)

    const body = await request.json()
    const { name, brand, description, notes, categoryId, defaultUnit, gtin, imageUrl, packDimension, packSize, hasDeposit, depositCt } = body as {
      name?: string
      brand?: string | null
      description?: string | null
      notes?: string | null
      categoryId?: string | null
      defaultUnit?: string
      gtin?: string | null
      imageUrl?: string | null
      // Gebinde-Größe (Einheiten v2): packDimension 'volume'|'mass'|'none', packSize = Wert (ml bzw. g).
      packDimension?: 'volume' | 'mass' | 'none'
      packSize?: number | string | null
      // Pfand (G47)
      hasDeposit?: boolean
      depositCt?: number | null
    }

    const patch: Parameters<typeof updateProduct>[1] = {}
    if (name !== undefined) patch.name = name
    if (brand !== undefined) patch.brand = brand ? String(brand).trim() : null
    if (description !== undefined) patch.description = description
    if (notes !== undefined) patch.notes = notes
    if (categoryId !== undefined) patch.categoryId = categoryId || null
    if (defaultUnit !== undefined) {
      // defaultUnit MUSS eine im Haushalt bekannte Einheit sein (System oder
      // Custom). Sonst faellt die Detailseite auf einen verwaisten Wert zurueck,
      // der sich nicht mehr korrekt anzeigen/aendern laesst (G20-1). Strikte
      // Validierung — analog api/inventory/normalize-unit.
      const units = await getUnits(householdId)
      if (!units.some((u) => u.symbol === defaultUnit)) {
        return json({ error: `Unbekannte Einheit: ${defaultUnit}` }, { status: 400 })
      }
      patch.defaultUnit = defaultUnit
    }
    // EAN/GTIN: leerer String → null (Feld leeren)
    if (gtin !== undefined) patch.gtin = gtin ? String(gtin).trim() : null
    // Bild-URL: leerer String → null
    if (imageUrl !== undefined) patch.imageUrl = imageUrl ? String(imageUrl).trim() : null
    // Pfand (G49): NUR bei count-Einheiten (Flasche/Dose/Stück). Bei mass/volume
    // (kg/l/g/ml) wird Pfand hart auf false/null erzwungen — robuste Invariante
    // unabhängig vom UI (Nicht-Form-Pfade, Altdaten). Effektive Einheit = neue
    // defaultUnit (falls im Patch) sonst die bestehende.
    if (hasDeposit !== undefined || depositCt !== undefined) {
      const units = await getUnits(householdId)
      const metaMap = buildUnitMetaMap(units as UnitRow[])
      const existing = await getProductById(params.id)
      const effectiveUnit = (patch.defaultUnit as string | undefined) ?? existing?.defaultUnit ?? 'piece'
      const countOk = isCountUnit(effectiveUnit, metaMap)
      if (hasDeposit !== undefined) {
        patch.hasDeposit = countOk ? hasDeposit : false
        patch.depositCt = countOk && hasDeposit ? (depositCt ?? null) : null
      } else if (depositCt !== undefined) {
        // depositCt allein (ohne hasDeposit) nur akzeptieren, wenn count.
        patch.depositCt = countOk ? depositCt : null
      }
    }

    // Gebinde-Größe: genau EINE Dimension. 'none' oder ungültig → beide null (kein Gebinde).
    if (packDimension !== undefined) {
      const val = packSize != null && packSize !== '' ? Number(packSize) : NaN
      const valid = Number.isFinite(val) && val > 0
      if (packDimension === 'volume' && valid) {
        patch.defaultVolumeMl = val
        patch.defaultWeightG = null
      } else if (packDimension === 'mass' && valid) {
        patch.defaultWeightG = val
        patch.defaultVolumeMl = null
      } else {
        // 'none' oder kein gültiger Wert → Gebinde entfernen.
        patch.defaultVolumeMl = null
        patch.defaultWeightG = null
      }
    }

    if (Object.keys(patch).length === 0) {
      return json({ error: 'Keine Felder zum Aktualisieren' }, { status: 400 })
    }

    // Vorher-Zustand fuer Audit-Diff (nur die potenziell geaenderten Felder)
    const before = await getProductById(params.id)

    const updated = await updateProduct(params.id, patch)
    if (!updated) return json({ error: 'Not found' }, { status: 404 })

    // Return the full product (with category) for optimistic UI updates
    const product = await getProductById(params.id)

    const auditKeys = Object.keys(patch)
    const beforeRow = before as Record<string, unknown> | null
    await writeAudit({
      householdId,
      userId: locals.user.id,
      action: 'UPDATE',
      tableName: 'products',
      recordId: params.id,
      oldValues: beforeRow ? Object.fromEntries(auditKeys.map((k) => [k, beforeRow[k]])) : null,
      newValues: patch as Record<string, unknown>,
    })

    // Feld-Herkunft: NUR tatsaechlich geaenderte Stammdaten-Felder → 'manual'
    // (Vergleich patch vs. before). Unveraenderte Felder behalten OFF/Globus (G15).
    const b = (before ?? {}) as Record<string, unknown>
    const changed = (col: string) => col in patch && (patch as Record<string, unknown>)[col] !== b[col]
    const srcs: Partial<Record<ProductField, 'manual'>> = {}
    if (changed('name')) srcs.name = 'manual'
    if (changed('brand')) srcs.brand = 'manual'
    if (changed('imageUrl')) srcs.image = 'manual'
    if (changed('categoryId')) srcs.category = 'manual'
    if (changed('defaultUnit')) srcs.unit = 'manual'
    if (changed('hasDeposit') || changed('depositCt')) srcs.deposit = 'manual'
    await setFieldSources(params.id, srcs)

    return json(product ?? updated)
  } catch (err) {
    // Unique-Konflikt auf gtin → verstaendliche Meldung
    if (isUniqueViolation(err)) {
      return json({ error: 'Diese EAN ist bereits einem anderen Artikel zugeordnet.' }, { status: 409 })
    }
    console.error('[PATCH /api/products/[id]]', err)
    return json({ error: 'Fehler beim Speichern des Artikels' }, { status: 500 })
  }
}

/**
 * DELETE /api/products/:id
 *
 * Hard-deletes a product from the catalog.
 * Guards: product must have no active inventory items for the current household.
 * Products that are referenced by other households' inventory are not blocked —
 * those foreign-key rows will be handled by the DB cascade (inventoryItems
 * has no FK to products by design; they hold a productId but products are
 * shared across households).
 *
 * The caller (UI) is responsible for showing a confirmation dialog.
 */
export const DELETE: RequestHandler = async ({ locals, params }) => {
  const db = getDb()
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const householdId = await requireHouseholdId(locals.user.id)

    const activeItem = await db.query.inventoryItems.findFirst({
      where: (item: any, { and, eq }: any) =>
        and(eq(item.productId, params.id), eq(item.householdId, householdId)),
      columns: { id: true },
    })

    if (activeItem) {
      return json(
        { error: 'Produkt hat noch Bestandseinträge. Bitte zuerst alle Einträge entfernen.' },
        { status: 409 }
      )
    }

    const before = await getProductById(params.id)

    const deleted = await deleteProduct(params.id)
    if (!deleted) return json({ error: 'Not found' }, { status: 404 })

    const beforeRow = before as Record<string, unknown> | null
    await writeAudit({
      householdId,
      userId: locals.user.id,
      action: 'DELETE',
      tableName: 'products',
      recordId: params.id,
      oldValues: beforeRow ? { name: beforeRow.name, gtin: beforeRow.gtin } : null,
    })

    return new Response(null, { status: 204 })
  } catch (err) {
    console.error('[DELETE /api/products/[id]]', err)
    return json({ error: 'Fehler beim Löschen des Produkts' }, { status: 500 })
  }
}
