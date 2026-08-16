import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { getDb } from '$lib/server/db'
import { storages, locations } from '@stoqr/db'
import { eq } from 'drizzle-orm'
import { requireHouseholdId } from '$lib/server/queries/households'
import { writeAudit } from '$lib/server/queries/audit'

async function getStorageForHousehold(storageId: string, householdId: string) {
  const db = getDb()
  const [row] = await db
    .select({ storage: storages, locationHouseholdId: locations.householdId })
    .from(storages)
    .innerJoin(locations, eq(storages.locationId, locations.id))
    .where(eq(storages.id, storageId))

  if (!row || row.locationHouseholdId !== householdId) return null
  return row.storage
}

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
  const db = getDb()
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 })
  }

  const householdId = await requireHouseholdId(locals.user.id)

  const existing = await getStorageForHousehold(params.id, householdId)
  if (!existing) {
    return json({ error: 'Not found' }, { status: 404 })
  }

  const body = await request.json()
  const { name, storageType, temperatureZone, icon, sortOrder } = body

  const updates: Record<string, unknown> = {}
  if (name !== undefined) updates.name = name
  if (storageType !== undefined) updates.storageType = storageType
  if (temperatureZone !== undefined) updates.temperatureZone = temperatureZone
  if (icon !== undefined) updates.icon = icon
  if (sortOrder !== undefined) updates.sortOrder = sortOrder

  if (Object.keys(updates).length === 0) {
    return json({ error: 'No fields to update' }, { status: 400 })
  }

  const [updated] = await db
    .update(storages)
    .set(updates)
    .where(eq(storages.id, params.id))
    .returning()

  await writeAudit({
    householdId,
    userId: locals.user.id,
    action: 'UPDATE',
    tableName: 'storages',
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

  const existing = await getStorageForHousehold(params.id, householdId)
  if (!existing) {
    return json({ error: 'Not found' }, { status: 404 })
  }

  await db.delete(storages).where(eq(storages.id, params.id))

  await writeAudit({
    householdId,
    userId: locals.user.id,
    action: 'DELETE',
    tableName: 'storages',
    recordId: params.id,
    oldValues: { name: existing.name },
  })

  return new Response(null, { status: 204 })
}
