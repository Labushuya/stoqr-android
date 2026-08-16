import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { requireHouseholdId } from '$lib/server/queries/households'
import { listTrips, createTrip } from '$lib/server/queries/shopping-trips'
import { writeAudit } from '$lib/server/queries/audit'

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 })
  const householdId = await requireHouseholdId(locals.user.id)
  const rows = await listTrips(householdId)
  return json(rows)
}

export const POST: RequestHandler = async ({ locals, request }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 })
  const householdId = await requireHouseholdId(locals.user.id)

  const body = await request.json().catch(() => ({}))
  const { name, storeId } = body as { name?: string | null; storeId?: string | null }

  const trip = await createTrip({ householdId, name: name ?? null, storeId: storeId ?? null })

  await writeAudit({
    householdId,
    userId: locals.user.id,
    action: 'INSERT',
    tableName: 'shopping_trips',
    recordId: trip.id,
    newValues: { name: trip.name, storeId: trip.storeId, status: trip.status },
  })

  return json(trip, { status: 201 })
}
