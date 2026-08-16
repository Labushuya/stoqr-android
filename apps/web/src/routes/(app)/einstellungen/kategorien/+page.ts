import type { PageLoad } from './$types'

// ---------------------------------------------------------------------------
// Universeller Load fuer Kategorie-Verwaltung.
// - Pi/SSR (__STOQR_TARGET__ !== 'app'): leeres Objekt -> +page.server.ts bleibt Quelle.
// - App-Target (SPA, offline): dieselbe Komposition wie +page.server.ts, aber gegen
//   die On-Device-SQLite via $data/queries/*. Kein Login/requireHouseholdId noetig.
// ---------------------------------------------------------------------------

export const load: PageLoad = async () => {
  if (__STOQR_TARGET__ === 'app') {
    // App-Target: dieselbe Shape wie +page.server.ts, Daten direkt aus SQLite.
    const { listCategories } = await import('$data/queries/categories')
    try {
      const categories = await listCategories()
      return { categories, loadError: null }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[kategorien] load error:', msg)
      return { categories: [], loadError: 'Kategorien konnten nicht geladen werden. Bitte Seite neu laden.' }
    }
  }

  // Pi: Server-Load (+page.server.ts) bleibt Quelle. Leeres Objekt merged,
  // laesst die Server-Daten intakt.
  return {}
}
