import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { getDb } from '$lib/server/db'
import { places, storages, locations } from '@stoqr/db'
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
  const { storageId, name, icon, sortOrder } = body

  if (!storageId || !name) {
    return json({ error: 'storageId and name are required' }, { status: 400 })
  }

  // Verify that the storage belongs to the authenticated household via location
  const [row] = await db
    .select({ locationHouseholdId: locations.householdId })
    .from(storages)
    .innerJoin(locations, eq(storages.locationId, locations.id))
    .where(eq(storages.id, storageId))

  if (!row || row.locationHouseholdId !== householdId) {
    return json({ error: 'Storage not found' }, { status: 404 })
  }

  const [place] = await db
    .insert(places)
    .values({
      storageId,
      name,
      icon: icon ?? null,
      sortOrder: sortOrder ?? 0,
    })
    .returning()

  await writeAudit({
    householdId,
    userId: locals.user.id,
    action: 'INSERT',
    tableName: 'places',
    recordId: place.id,
    newValues: { name: place.name, storageId: place.storageId },
  })

  return json(place, { status: 201 })
}
