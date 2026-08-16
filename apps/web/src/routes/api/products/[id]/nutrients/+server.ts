import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { upsertProductNutrient, deleteProductNutrient } from '$lib/server/queries/nutrients'
import { requireHouseholdId } from '$lib/server/queries/households'

// ---------------------------------------------------------------------------
// Nährwerte eines Produkts. Nährwerte hängen am Produkt (product_nutrients),
// gelten also für alle Bestände des Artikels. Produkte sind global/geteilt —
// kein household-Scoping auf der Zeile, aber Auth + Haushalt erforderlich.
// ---------------------------------------------------------------------------

// PUT /api/products/:id/nutrients  { nutrientTypeId, valuePer100 }
export const PUT: RequestHandler = async ({ locals, params, request }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 })
  try {
    await requireHouseholdId(locals.user.id)
    const body = await request.json()
    const nutrientTypeId = typeof body?.nutrientTypeId === 'string' ? body.nutrientTypeId : ''
    const value = Number(body?.valuePer100)

    if (!nutrientTypeId) {
      return json({ error: 'nutrientTypeId ist erforderlich' }, { status: 400 })
    }
    if (!Number.isFinite(value) || value < 0) {
      return json({ error: 'Wert muss eine Zahl >= 0 sein' }, { status: 400 })
    }

    const row = await upsertProductNutrient({
      productId: params.id,
      nutrientTypeId,
      valuePer100: value,
      source: 'manual',
    })
    return json(row)
  } catch (err) {
    console.error('[PUT /api/products/[id]/nutrients]', err)
    return json({ error: 'Fehler beim Speichern des Nährwerts' }, { status: 500 })
  }
}

// DELETE /api/products/:id/nutrients?nutrientTypeId=...
export const DELETE: RequestHandler = async ({ locals, params, url }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 })
  try {
    await requireHouseholdId(locals.user.id)
    const nutrientTypeId = url.searchParams.get('nutrientTypeId') ?? ''
    if (!nutrientTypeId) {
      return json({ error: 'nutrientTypeId ist erforderlich' }, { status: 400 })
    }

    const { deleted } = await deleteProductNutrient({ productId: params.id, nutrientTypeId })
    if (!deleted) return json({ error: 'Not found' }, { status: 404 })
    return new Response(null, { status: 204 })
  } catch (err) {
    console.error('[DELETE /api/products/[id]/nutrients]', err)
    return json({ error: 'Fehler beim Löschen des Nährwerts' }, { status: 500 })
  }
}
