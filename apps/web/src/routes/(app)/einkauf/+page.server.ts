import { redirect } from '@sveltejs/kit'
import { requireHouseholdId } from '$lib/server/queries/households'
import { listTrips } from '$lib/server/queries/shopping-trips'
import { getDb } from '$lib/server/db'
import { stores } from '@stoqr/db'
import { asc } from 'drizzle-orm'
import type { PageServerLoad } from './$types'

// ---------------------------------------------------------------------------
// Einkauf (Block E / M2): Übersicht der Einkauf-Runs.
// ---------------------------------------------------------------------------

export const load: PageServerLoad = async ({ locals }) => {
  const db = getDb()
  if (!locals.user) redirect(302, '/login')
  const householdId = await requireHouseholdId(locals.user.id)

  try {
    const [trips, storeRows] = await Promise.all([
      listTrips(householdId),
      db.query.stores.findMany({
        where: (s: any, { eq }: any) => eq(s.householdId, householdId),
        orderBy: [asc(stores.name)],
        columns: { id: true, name: true, chain: true },
      }),
    ])
    return { trips, stores: storeRows, loadError: null }
  } catch (err) {
    console.error('[einkauf] load error:', err)
    return { trips: [], stores: [], loadError: 'Einkäufe konnten nicht geladen werden.' }
  }
}
