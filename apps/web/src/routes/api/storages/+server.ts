import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { getDb } from '$lib/server/db'
import { storages, locations } from '@stoqr/db'
import { eq } from 'drizzle-orm'
import { requireHouseholdId } from '$lib/server/queries/households'
import { writeAudit } from '$lib/server/queries/audit'

export const POST: RequestHandler = async ({ locals, request }) => {
  const db = getDb()
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 })
  }

  const householdId = await requireHouseholdId(locals.user.id)

  const body = await request.json()
  const { locationId, name, storageType, temperatureZone, icon, sortOrder } = body

  if (!locationId || !name) {
    return json({ error: 'locationId and name are required' }, { status: 400 })
  }

  // Verify that the location belongs to the authenticated household
  const [location] = await db
    .select()
    .from(locations)
    .where(eq(locations.id, locationId))

  if (!location || location.householdId !== householdId) {
    return json({ error: 'Location not found' }, { status: 404 })
  }

  const [storage] = await db
    .insert(storages)
    .values({
      locationId,
      name,
      storageType: storageType ?? null,
      temperatureZone: temperatureZone ?? null,
      icon: icon ?? null,
      sortOrder: sortOrder ?? 0,
    })
    .returning()

  await writeAudit({
    householdId,
    userId: locals.user.id,
    action: 'INSERT',
    tableName: 'storages',
    recordId: storage.id,
    newValues: { name: storage.name, locationId: storage.locationId },
  })

  return json(storage, { status: 201 })
}
