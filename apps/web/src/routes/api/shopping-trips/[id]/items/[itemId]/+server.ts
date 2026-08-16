import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { requireHouseholdId } from '$lib/server/queries/households'
import { moveTripItem, updateTripItem, releaseTripItem } from '$lib/server/queries/shopping-trips'
import { writeAudit } from '$lib/server/queries/audit'

/**
 * PATCH /api/shopping-trips/:id/items/:itemId
 *  - { toTripId }                       → in anderen Run verschieben
 *  - { realStatus, quantity?, notes? }  → Position aktualisieren
 */
export const PATCH: RequestHandler = async ({ locals, params, request }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 })
  const householdId = await requireHouseholdId(locals.user.id)

  const body = await request.json().catch(() => ({}))
  const { toTripId, realStatus, quantity, notes } = body as {
    toTripId?: string
    realStatus?: 'offen' | 'gekauft' | 'ausverkauft'
    quantity?: number | string
    notes?: string | null
  }

  if (toTripId) {
    const row = await moveTripItem(params.itemId, toTripId, householdId)
    if (!row) return json({ error: 'Position oder Ziel-Einkauf nicht gefunden' }, { status: 404 })
    await writeAudit({
      householdId,
      userId: locals.user.id,
      action: 'UPDATE',
      tableName: 'shopping_trip_items',
      recordId: params.itemId,
      newValues: { tripId: toTripId },
      changedFields: ['tripId'],
    })
    return json(row)
  }

  const patch: { realStatus?: 'offen' | 'gekauft' | 'ausverkauft'; quantity?: number | string; notes?: string | null } = {}
  if (realStatus !== undefined) patch.realStatus = realStatus
  if (quantity !== undefined) patch.quantity = quantity
  if (notes !== undefined) patch.notes = notes
  if (Object.keys(patch).length === 0) {
    return json({ error: 'Keine Felder zum Aktualisieren' }, { status: 400 })
  }

  const row = await updateTripItem(params.itemId, householdId, patch)
  if (!row) return json({ error: 'Not found' }, { status: 404 })
  await writeAudit({
    householdId,
    userId: locals.user.id,
    action: 'UPDATE',
    tableName: 'shopping_trip_items',
    recordId: params.itemId,
    newValues: patch as Record<string, unknown>,
  })
  return json(row)
}

/** DELETE — Reservierung lösen (Bedarf bleibt im Backlog). */
export const DELETE: RequestHandler = async ({ locals, params }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 })
  const householdId = await requireHouseholdId(locals.user.id)

  const { deleted } = await releaseTripItem(params.itemId, householdId)
  if (!deleted) return json({ error: 'Not found' }, { status: 404 })
  await writeAudit({
    householdId,
    userId: locals.user.id,
    action: 'DELETE',
    tableName: 'shopping_trip_items',
    recordId: params.itemId,
  })
  return new Response(null, { status: 204 })
}
