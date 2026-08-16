import type { PageLoad } from './$types'

// ---------------------------------------------------------------------------
// Aktivität (Block D): universelles Load für das App-Target (Capacitor SPA).
// Im Pi/SSR-Target bleibt +page.server.ts die Quelle (leeres Objekt merged,
// laesst die Server-Daten intakt). Im App-Target komponieren wir dieselbe
// Return-Shape direkt gegen die On-Device-SQLite (kein Server, kein __data.json).
// ---------------------------------------------------------------------------

export const load: PageLoad = async () => {
  if (__STOQR_TARGET__ === 'app') {
    // App-Target: dieselbe Komposition wie +page.server.ts, aber gegen SQLite und
    // ohne Auth/Redirect (lokale Identitaet gilt immer).
    const { LOCAL_HOUSEHOLD_ID } = await import('@stoqr/db/sqlite')
    const { listAuditLog } = await import('$data/queries/audit')
    const householdId = LOCAL_HOUSEHOLD_ID

    try {
      const entries = await listAuditLog(householdId, { limit: 200 })
      return { entries, loadError: null }
    } catch (err) {
      console.error('[aktivitaet] load error:', err)
      return { entries: [], loadError: 'Aktivität konnte nicht geladen werden.' }
    }
  }

  // Pi: Server-Load (+page.server.ts) bleibt Quelle.
  return {}
}
