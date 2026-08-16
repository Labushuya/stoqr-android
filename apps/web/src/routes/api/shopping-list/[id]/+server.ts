import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { updateShoppingItem, deleteShoppingItem } from '$lib/server/queries/shopping-list'
import { requireHouseholdId } from '$lib/server/queries/households'

// PATCH — abhaken / Menge / Notiz ändern
export const PATCH: RequestHandler = async ({ locals, params, request }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const householdId = await requireHouseholdId(locals.user.id)
    const body = await request.json()

    const patch: Parameters<typeof updateShoppingItem>[2] = {}
    if (typeof body?.isChecked === 'boolean') patch.isChecked = body.isChecked
    if (body?.quantity !== undefined) {
      const q = Number(body.quantity)
      if (!Number.isFinite(q) || q <= 0) return json({ error: 'Menge muss > 0 sein' }, { status: 400 })
      patch.quantity = q
    }
    if (typeof body?.unit === 'string') patch.unit = body.unit
    if (body?.notes !== undefined) patch.notes = body.notes

    if (Object.keys(patch).length === 0) {
      return json({ error: 'Keine Felder zum Aktualisieren' }, { status: 400 })
    }

    const row = await updateShoppingItem(params.id, householdId, patch)
    if (!row) return json({ error: 'Not found' }, { status: 404 })
    return json(row)
  } catch (err) {
    console.error('[PATCH /api/shopping-list/[id]]', err)
    return json({ error: 'Fehler beim Speichern' }, { status: 500 })
  }
}

export const DELETE: RequestHandler = async ({ locals, params }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const householdId = await requireHouseholdId(locals.user.id)
    const { deleted, reserved } = await deleteShoppingItem(params.id, householdId)
    if (reserved) {
      return json(
        { error: 'Dieser Bedarf ist einem Einkauf zugewiesen. Erst dort freigeben.' },
        { status: 409 },
      )
    }
    if (!deleted) return json({ error: 'Not found' }, { status: 404 })
    return new Response(null, { status: 204 })
  } catch (err) {
    console.error('[DELETE /api/shopping-list/[id]]', err)
    return json({ error: 'Fehler beim Löschen' }, { status: 500 })
  }
}
