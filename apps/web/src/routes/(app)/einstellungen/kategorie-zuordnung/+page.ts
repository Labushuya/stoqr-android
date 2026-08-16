import type { PageLoad } from './$types'

// Kuratierte OFF-Tags als Token-Vorschlaege (OFF-Tags liegen nicht lokal vor —
// sie kommen live beim Scan; daher eine kuratierte Liste haeufiger en:-Tags, G30).
// 1:1 aus +page.server.ts dupliziert (server-Modul nicht im App-Bundle importierbar).
const OFF_TAG_SUGGESTIONS = [
  'en:beverages', 'en:sodas', 'en:waters', 'en:sparkling-waters', 'en:juices',
  'en:dairies', 'en:milks', 'en:yogurts', 'en:cheeses',
  'en:meats', 'en:poultry', 'en:fishes', 'en:seafood',
  'en:breads', 'en:pastries', 'en:cereals',
  'en:fruits', 'en:vegetables', 'en:frozen-foods', 'en:canned-foods',
  'en:condiments', 'en:sauces', 'en:snacks', 'en:chocolates', 'en:biscuits', 'en:desserts',
]

export const load: PageLoad = async () => {
  if (__STOQR_TARGET__ === 'app') {
    // App-Target: dieselbe Komposition wie +page.server.ts, aber gegen On-Device-SQLite.
    const { LOCAL_HOUSEHOLD_ID } = await import('@stoqr/db/sqlite')
    const m = await import('$data/queries/category-mapping')
    const c = await import('$data/queries/categories')
    const g = await import('$data/queries/globus-snapshots')
    const householdId = LOCAL_HOUSEHOLD_ID

    try {
      const [mappings, categories, globusSegments] = await Promise.all([
        m.listCategoryMappings(householdId),
        c.listCategories(),
        g.listGlobusCategorySegments(householdId),
      ])
      return { mappings, categories, globusSegments, offTags: OFF_TAG_SUGGESTIONS, loadError: null }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[kategorie-zuordnung] load error:', msg)
      return {
        mappings: [],
        categories: [],
        globusSegments: [],
        offTags: OFF_TAG_SUGGESTIONS,
        loadError: 'Regeln konnten nicht geladen werden. Bitte Seite neu laden.',
      }
    }
  }

  // Pi: Server-Load (+page.server.ts) bleibt Quelle. Leeres Objekt merged,
  // laesst die Server-Daten intakt.
  return {}
}
