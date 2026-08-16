import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { listStoresForProduct, setStoresForProduct } from '$lib/server/queries/product-stores'
import { requireHouseholdId } from '$lib/server/queries/households'

// GET — Märkte eines Artikels
export const GET: RequestHandler = async ({ locals, params }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const householdId = await requireHouseholdId(locals.user.id)
    const rows = await listStoresForProduct(params.id, householdId)
    return json(rows)
  } catch (err) {
    console.error('[GET /api/products/[id]/stores]', err)
    return json({ error: 'Fehler beim Laden der Markt-Zuordnung' }, { status: 500 })
  }
}

// PUT — Markt-Zuordnung setzen  { storeIds: string[] }
export const PUT: RequestHandler = async ({ locals, params, request }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const householdId = await requireHouseholdId(locals.user.id)
    const body = await request.json()
    const storeIds = Array.isArray(body?.storeIds)
      ? body.storeIds.filter((s: unknown) => typeof s === 'string')
      : null
    if (!storeIds) return json({ error: 'storeIds (Array) erforderlich' }, { status: 400 })

    const rows = await setStoresForProduct(params.id, householdId, storeIds)
    return json(rows)
  } catch (err) {
    console.error('[PUT /api/products/[id]/stores]', err)
    return json({ error: 'Fehler beim Speichern der Markt-Zuordnung' }, { status: 500 })
  }
}
