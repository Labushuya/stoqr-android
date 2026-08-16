import type { PageLoad } from './$types'

// ---------------------------------------------------------------------------
// Universeller Load fuer die Einheiten-Verwaltung.
// Pi (STOQR_TARGET=node): leeres Objekt -> +page.server.ts bleibt die Quelle.
// App (STOQR_TARGET=app, SPA/offline): dieselbe Komposition wie +page.server.ts,
// aber gegen die On-Device-SQLite (Query-Fns aus $data/queries/*, die getDb()
// intern nutzen) und mit LOCAL_HOUSEHOLD_ID statt requireHouseholdId/Login.
// Return-Shape IDENTISCH zum Server-Load: { units, loadError }.
// ---------------------------------------------------------------------------

export const load: PageLoad = async () => {
  if (__STOQR_TARGET__ === 'app') {
    const { LOCAL_HOUSEHOLD_ID } = await import('@stoqr/db/sqlite')
    const { getUnits } = await import('$data/queries/households')

    const householdId = LOCAL_HOUSEHOLD_ID

    try {
      const units = await getUnits(householdId)
      return { units, loadError: null }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[einheiten] load error:', msg)
      return { units: [], loadError: 'Einheiten konnten nicht geladen werden. Bitte Seite neu laden.' }
    }
  }

  // Pi: Server-Load (+page.server.ts) bleibt Quelle. Leeres Objekt merged,
  // laesst die Server-Daten intakt.
  return {}
}
