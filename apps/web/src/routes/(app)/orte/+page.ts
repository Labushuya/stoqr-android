import type { PageLoad } from './$types'

export const load: PageLoad = async () => {
  if (__STOQR_TARGET__ === 'app') {
    // App-Target: dieselbe Komposition wie +page.server.ts, aber gegen die
    // On-Device-SQLite (LOCAL_HOUSEHOLD_ID statt requireHouseholdId, kein Login).
    const { LOCAL_HOUSEHOLD_ID } = await import('@stoqr/db/sqlite')
    const { getLocations } = await import('$data/queries/locations')

    const householdId = LOCAL_HOUSEHOLD_ID
    const locations = await getLocations(householdId)
    return { locations }
  }

  // Pi: Server-Load (+page.server.ts) bleibt Quelle. Leeres Objekt merged,
  // laesst die Server-Daten intakt.
  return {}
}
