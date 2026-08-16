import type { PageLoad } from './$types'

// ---------------------------------------------------------------------------
// Universelles Load fuer die Artikelverwaltung.
// App-Target (SPA, kein Server): dieselbe Komposition wie +page.server.ts,
// aber gegen die On-Device-SQLite ($data/queries/*) und mit lokaler Identitaet
// (LOCAL_HOUSEHOLD_ID statt requireHouseholdId). Kein Login/redirect.
// Pi-Target: leeres Objekt -> +page.server.ts bleibt die Quelle.
// ---------------------------------------------------------------------------

export const load: PageLoad = async () => {
  if (__STOQR_TARGET__ === 'app') {
    const { LOCAL_HOUSEHOLD_ID } = await import('@stoqr/db/sqlite')
    const p = await import('$data/queries/products')
    const h = await import('$data/queries/households')

    const householdId = LOCAL_HOUSEHOLD_ID

    try {
      const [products, categories, units] = await Promise.all([
        p.listProducts(),
        p.getCategories(),
        h.getUnits(householdId),
      ])
      return { products, categories, units, loadError: null }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[artikel] load error:', msg)
      return {
        products: [],
        categories: [],
        units: [],
        loadError: 'Artikel konnten nicht geladen werden. Bitte Seite neu laden.',
      }
    }
  }

  return {}
}
