import type { PageLoad } from './$types'

export const load: PageLoad = async () => {
  if (__STOQR_TARGET__ === 'app') {
    // App-Target (SPA/offline): dieselbe Komposition wie +page.server.ts, aber
    // gegen die On-Device-SQLite und mit lokaler Identitaet statt Auth.
    const { LOCAL_HOUSEHOLD_ID } = await import('@stoqr/db/sqlite')
    const dash = await import('$data/queries/dashboard')

    const householdId = LOCAL_HOUSEHOLD_ID
    const [stats, expiringSoon, expired] = await Promise.all([
      dash.getDashboardStats(householdId),
      dash.getExpiringItems(householdId, 14),
      dash.getExpiredItems(householdId),
    ])
    return { stats, expiringSoon, expired }
  }

  // Pi: Server-Load (+page.server.ts) bleibt Quelle. Leeres Objekt merged,
  // laesst die Server-Daten intakt.
  return {}
}
