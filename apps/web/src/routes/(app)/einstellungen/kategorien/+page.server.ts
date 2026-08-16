import { redirect } from '@sveltejs/kit'
import { requireHouseholdId } from '$lib/server/queries/households'
import { listCategories } from '$lib/server/queries/categories'
import type { PageServerLoad } from './$types'

// ---------------------------------------------------------------------------
// Kategorie-Verwaltung (Stufe 1: CRUD). categories ist global — Anlegen/Umbenennen/
// Loeschen wirkt haushaltsuebergreifend. Mutationen laufen ueber /api/categories.
// ---------------------------------------------------------------------------

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) redirect(302, '/login')
  await requireHouseholdId(locals.user.id)

  try {
    const categories = await listCategories()
    return { categories, loadError: null }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[kategorien] load error:', msg)
    return { categories: [], loadError: 'Kategorien konnten nicht geladen werden. Bitte Seite neu laden.' }
  }
}
