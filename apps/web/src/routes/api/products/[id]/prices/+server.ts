import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { requireHouseholdId } from '$lib/server/queries/households'
import {
  getCurrentPricesForProductAllStores,
  listPriceHistory,
  recordPrice,
} from '$lib/server/queries/prices'
import { writeAudit } from '$lib/server/queries/audit'
import { getDb } from '$lib/server/db'

/**
 * GET /api/products/:id/prices        → aktuelle Preise je Markt
 * GET /api/products/:id/prices?history=1 → volle Preis-Historie
 */
export const GET: RequestHandler = async ({ locals, params, url }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const householdId = await requireHouseholdId(locals.user.id)
    if (url.searchParams.get('history') === '1') {
      return json(await listPriceHistory(params.id, householdId))
    }
    return json(await getCurrentPricesForProductAllStores(params.id, householdId))
  } catch (err) {
    console.error('[GET /api/products/[id]/prices]', err)
    return json({ error: 'Fehler beim Laden der Preise' }, { status: 500 })
  }
}

/**
 * POST /api/products/:id/prices
 * { storeId, priceCt, unit, isReduced?, makePermanent? } — manuelle Preis-Erfassung.
 */
export const POST: RequestHandler = async ({ locals, params, request }) => {
  const db = getDb()
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const householdId = await requireHouseholdId(locals.user.id)
    const body = await request.json()
    const { storeId, priceCt, unit, isReduced, makePermanent, priceIncludesDeposit } = body as {
      storeId?: string
      priceCt?: number
      unit?: string
      isReduced?: boolean
      makePermanent?: boolean
      priceIncludesDeposit?: boolean
    }

    if (!storeId) return json({ error: 'storeId erforderlich' }, { status: 400 })
    if (typeof priceCt !== 'number' || !Number.isFinite(priceCt) || priceCt < 0) {
      return json({ error: 'priceCt muss eine Zahl >= 0 sein' }, { status: 400 })
    }
    if (!unit) return json({ error: 'unit erforderlich' }, { status: 400 })

    // Store-Ownership prüfen (Markt muss dem Haushalt gehören).
    const store = await db.query.stores.findFirst({
      where: (s: any, { and, eq }: any) => and(eq(s.id, storeId), eq(s.householdId, householdId)),
      columns: { id: true },
    })
    if (!store) return json({ error: 'Markt nicht gefunden' }, { status: 404 })

    const row = await recordPrice({
      householdId,
      productId: params.id,
      storeId,
      priceCt: Math.round(priceCt),
      unit,
      isReduced: isReduced ?? false,
      makePermanent: makePermanent ?? false,
      priceIncludesDeposit: priceIncludesDeposit ?? false,
      source: 'manual',
      createdBy: locals.user.id,
    })

    await writeAudit({
      householdId,
      userId: locals.user.id,
      action: 'INSERT',
      tableName: 'product_prices',
      recordId: row.id,
      newValues: {
        productId: params.id,
        storeId,
        priceCt: Math.round(priceCt),
        unit,
        isReduced: isReduced ?? false,
        isCurrent: row.isCurrent,
        source: 'manual',
      },
    })

    return json(row, { status: 201 })
  } catch (err) {
    console.error('[POST /api/products/[id]/prices]', err)
    return json({ error: 'Fehler beim Speichern des Preises' }, { status: 500 })
  }
}
