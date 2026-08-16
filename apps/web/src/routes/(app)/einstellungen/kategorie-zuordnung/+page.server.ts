import { redirect } from '@sveltejs/kit'
import { requireHouseholdId } from '$lib/server/queries/households'
import { listCategoryMappings } from '$lib/server/queries/category-mapping'
import { listGlobusCategorySegments } from '$lib/server/queries/globus-snapshots'
import { listCategories } from '$lib/server/queries/categories'
import type { PageServerLoad } from './$types'

// Kuratierte OFF-Tags als Token-Vorschlaege (OFF-Tags liegen nicht lokal vor —
// sie kommen live beim Scan; daher eine kuratierte Liste haeufiger en:-Tags, G30).
const OFF_TAG_SUGGESTIONS = [
  'en:beverages', 'en:sodas', 'en:waters', 'en:sparkling-waters', 'en:juices',
  'en:dairies', 'en:milks', 'en:yogurts', 'en:cheeses',
  'en:meats', 'en:poultry', 'en:fishes', 'en:seafood',
  'en:breads', 'en:pastries', 'en:cereals',
  'en:fruits', 'en:vegetables', 'en:frozen-foods', 'en:canned-foods',
  'en:condiments', 'en:sauces', 'en:snacks', 'en:chocolates', 'en:biscuits', 'en:desserts',
]

// ---------------------------------------------------------------------------
// Kategorie-Zuordnung (G29/G30): Regeln OFF-Tag / Globus-Segment → stoqr-Kategorie.
// Mutationen laufen ueber /api/category-mappings. globusSegments = real vorkommende
// Pfad-Segmente aus den Snapshots des Haushalts (Token-Auswahl statt Freitext-Raten).
// ---------------------------------------------------------------------------

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) redirect(302, '/login')
  const householdId = await requireHouseholdId(locals.user.id)

  try {
    const [mappings, categories, globusSegments] = await Promise.all([
      listCategoryMappings(householdId),
      listCategories(),
      listGlobusCategorySegments(householdId),
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
