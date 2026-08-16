import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { searchProducts, createProduct, getProductById, setFieldSources, type ProductField } from '$lib/server/queries/products'
import { requireHouseholdId, getUnits } from '$lib/server/queries/households'
import { writeAudit } from '$lib/server/queries/audit'
import { isUniqueViolation } from '$lib/server/db-errors'
import { buildUnitMetaMap, isCountUnit, type UnitRow } from '$lib/utils/stock'

export const GET: RequestHandler = async ({ locals, url }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 })
  }

  const q = url.searchParams.get('q')

  if (!q || q.trim().length === 0) {
    return json({ error: 'q query parameter is required' }, { status: 400 })
  }

  const results = await searchProducts(q.trim())
  return json(results)
}

export const POST: RequestHandler = async ({ locals, request }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const {
    name,
    brand,
    gtin,
    categoryId,
    description,
    notes,
    imageUrl,
    defaultUnit,
    defaultQuantity,
    defaultWeightG,
    defaultVolumeMl,
    expiryToleranceDays,
    bringItemId,
    hasDeposit,
    depositCt,
    offData,
  } = body

  if (!name) {
    return json({ error: 'name is required' }, { status: 400 })
  }

  try {
    const householdId = await requireHouseholdId(locals.user.id)
    // Pfand (G49): nur bei count-Einheiten; sonst hart auf false/null.
    const effectiveUnit = defaultUnit || 'piece'
    const metaMap = buildUnitMetaMap((await getUnits(householdId)) as UnitRow[])
    const countOk = isCountUnit(effectiveUnit, metaMap)
    const productId = await createProduct({
      name,
      brand: brand ?? undefined,
      gtin: gtin ? String(gtin).trim() : undefined,
      categoryId: categoryId ?? undefined,
      description: description ?? undefined,
      notes: notes ?? undefined,
      imageUrl: imageUrl ?? undefined,
      defaultUnit: defaultUnit ?? undefined,
      defaultQuantity: defaultQuantity ?? undefined,
      defaultWeightG: defaultWeightG ?? undefined,
      defaultVolumeMl: defaultVolumeMl ?? undefined,
      expiryToleranceDays: expiryToleranceDays ?? undefined,
      bringItemId: bringItemId ?? undefined,
      hasDeposit: countOk ? (hasDeposit ?? undefined) : false,
      depositCt: countOk && hasDeposit ? (depositCt ?? null) : null,
      offData: offData ?? undefined,
      createdBy: locals.user.id,
    })

    // Return the full product (with category) so callers can update UI without a reload
    const product = await getProductById(productId)

    // Manuell angelegter Artikel (ProductForm) → gesetzte Stammdaten-Felder 'manual' (G15).
    const srcs: Partial<Record<ProductField, 'manual'>> = { name: 'manual' }
    if (brand) srcs.brand = 'manual'
    if (imageUrl) srcs.image = 'manual'
    if (categoryId) srcs.category = 'manual'
    if (defaultUnit) srcs.unit = 'manual'
    if (countOk && hasDeposit) srcs.deposit = 'manual'
    await setFieldSources(productId, srcs)

    await writeAudit({
      householdId,
      userId: locals.user.id,
      action: 'INSERT',
      tableName: 'products',
      recordId: productId,
      newValues: { name, brand: brand ?? null, gtin: gtin ?? null, categoryId: categoryId ?? null },
    })

    return json(product ?? { id: productId }, { status: 201 })
  } catch (err) {
    if (isUniqueViolation(err)) {
      return json({ error: 'Diese EAN ist bereits einem anderen Artikel zugeordnet.' }, { status: 409 })
    }
    console.error('[POST /api/products]', err)
    return json({ error: 'Fehler beim Anlegen des Artikels' }, { status: 500 })
  }
}
