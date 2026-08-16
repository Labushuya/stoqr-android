import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { requireHouseholdId } from '$lib/server/queries/households'
import {
  getTrip,
  pauseTrip,
  resumeTrip,
  endTrip,
  updateTrip,
  deleteTrip,
  TripEndBlockedError,
} from '$lib/server/queries/shopping-trips'
import { writeAudit } from '$lib/server/queries/audit'

export const GET: RequestHandler = async ({ locals, params }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 })
  const householdId = await requireHouseholdId(locals.user.id)
  const trip = await getTrip(params.id, householdId)
  if (!trip) return json({ error: 'Not found' }, { status: 404 })
  return json(trip)
}

/**
 * PATCH /api/shopping-trips/:id
 * Entweder ein Status-Übergang via { action: 'pause'|'resume'|'end' }
 * ODER Stammdaten-Update via { name?, storeId? }.
 */
export const PATCH: RequestHandler = async ({ locals, params, request }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 })
  const householdId = await requireHouseholdId(locals.user.id)

  const body = await request.json().catch(() => ({}))
  const { action, name, storeId } = body as {
    action?: 'pause' | 'resume' | 'end'
    name?: string | null
    storeId?: string | null
  }

  try {
    if (action) {
      let row
      if (action === 'pause') row = await pauseTrip(params.id, householdId)
      else if (action === 'resume') row = await resumeTrip(params.id, householdId)
      else if (action === 'end') row = await endTrip(params.id, householdId)
      else return json({ error: 'Unbekannte Aktion' }, { status: 400 })

      if (!row) return json({ error: 'Übergang nicht möglich (Status/Not found)' }, { status: 409 })

      await writeAudit({
        householdId,
        userId: locals.user.id,
        action: 'UPDATE',
        tableName: 'shopping_trips',
        recordId: params.id,
        newValues: { status: row.status },
        changedFields: ['status'],
      })
      return json(row)
    }

    // Stammdaten-Update
    const patch: { name?: string | null; storeId?: string | null } = {}
    if (name !== undefined) patch.name = name
    if (storeId !== undefined) patch.storeId = storeId
    if (Object.keys(patch).length === 0) {
      return json({ error: 'Keine Felder zum Aktualisieren' }, { status: 400 })
    }
    const row = await updateTrip(params.id, householdId, patch)
    if (!row) return json({ error: 'Not found' }, { status: 404 })

    await writeAudit({
      householdId,
      userId: locals.user.id,
      action: 'UPDATE',
      tableName: 'shopping_trips',
      recordId: params.id,
      newValues: patch as Record<string, unknown>,
    })
    return json(row)
  } catch (err) {
    if (err instanceof TripEndBlockedError) {
      return json({ error: err.message }, { status: 409 })
    }
    console.error('[PATCH /api/shopping-trips/[id]]', err)
    return json({ error: 'Fehler beim Aktualisieren des Einkaufs' }, { status: 500 })
  }
}

export const DELETE: RequestHandler = async ({ locals, params }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 })
  const householdId = await requireHouseholdId(locals.user.id)

  const { deleted } = await deleteTrip(params.id, householdId)
  if (!deleted) return json({ error: 'Not found' }, { status: 404 })

  await writeAudit({
    householdId,
    userId: locals.user.id,
    action: 'DELETE',
    tableName: 'shopping_trips',
    recordId: params.id,
  })
  return new Response(null, { status: 204 })
}
