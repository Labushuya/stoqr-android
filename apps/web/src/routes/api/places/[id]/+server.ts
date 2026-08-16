import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { getDb } from '$lib/server/db'
import { places, storages, locations } from '@stoqr/db'
import { eq } from 'drizzle-orm'
import { requireHouseholdId } from '$lib/server/queries/households'
import { writeAudit } from '$lib/server/queries/audit'

async function getPlaceForHousehold(placeId: string, householdId: string) {
  const db = getDb()
  const [row] = await db
    .select({ place: places, locationHouseholdId: locations.householdId })
    .from(places)
    .innerJoin(storages, eq(places.storageId, storages.id))
    .innerJoin(locations, eq(storages.locationId, locations.id))
    .where(eq(places.id, placeId))

  if (!row || row.locationHouseholdId !== householdId) return null
  return row.place
}

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
  const db = getDb()
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 })
  }

  const householdId = await requireHouseholdId(locals.user.id)

  const existing = await getPlaceForHousehold(params.id, householdId)
  if (!existing) {
    return json({ error: 'Not found' }, { status: 404 })
  }

  const body = await request.json()
  const { name, icon, sortOrder } = body

  const updates: Record<string, unknown> = {}
  if (name !== undefined) updates.name = name
  if (icon !== undefined) updates.icon = icon
  if (sortOrder !== undefined) updates.sortOrder = sortOrder

  if (Object.keys(updates).length === 0) {
    return json({ error: 'No fields to update' }, { status: 400 })
  }

  const [updated] = await db
    .update(places)
    .set(updates)
    .where(eq(places.id, params.id))
    .returning()

  await writeAudit({
    householdId,
    userId: locals.user.id,
    action: 'UPDATE',
    tableName: 'places',
    recordId: params.id,
    oldValues: { name: existing.name },
    newValues: { name: updated.name },
  })

  return json(updated)
}

export const DELETE: RequestHandler = async ({ locals, params }) => {
  const db = getDb()
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 })
  }

  const householdId = await requireHouseholdId(locals.user.id)

  const existing = await getPlaceForHousehold(params.id, householdId)
  if (!existing) {
    return json({ error: 'Not found' }, { status: 404 })
  }

  await db.delete(places).where(eq(places.id, params.id))

  await writeAudit({
    householdId,
    userId: locals.user.id,
    action: 'DELETE',
    tableName: 'places',
    recordId: params.id,
    oldValues: { name: existing.name },
  })

  return new Response(null, { status: 204 })
}
