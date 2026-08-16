import { redirect } from '@sveltejs/kit'
import { requireHouseholdId, getUnits } from '$lib/server/queries/households'
import { listProducts, getCategories } from '$lib/server/queries/products'
import type { PageServerLoad } from './$types'

// ---------------------------------------------------------------------------
// Artikelverwaltung (Stammdaten). Produkte sind global/geteilt — kein
// household-Scoping auf der Zeile, aber der Zugriff erfordert einen Haushalt.
// Vollstaendige Stammdaten-Bearbeitung ueber die gemeinsame ProductForm (G11).
// Mutationen laufen ueber /api/products (POST/PATCH/DELETE), daher hier nur load.
// ---------------------------------------------------------------------------

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) redirect(302, '/login')

  const householdId = await requireHouseholdId(locals.user.id)

  try {
    const [products, categories, units] = await Promise.all([
      listProducts(),
      getCategories(),
      getUnits(householdId),
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
