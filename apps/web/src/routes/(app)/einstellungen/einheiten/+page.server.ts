import { redirect } from '@sveltejs/kit'
import { requireHouseholdId, getUnits } from '$lib/server/queries/households'
import type { PageServerLoad } from './$types'

// ---------------------------------------------------------------------------
// Einheiten-Verwaltung. System-Einheiten (householdId null) sind schreibgeschützt,
// Custom-Einheiten pro Haushalt frei pflegbar (Name, Symbol, Dimension, Faktor).
// Mutationen laufen über /api/units (POST/PATCH/DELETE).
// ---------------------------------------------------------------------------

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) redirect(302, '/login')

  const householdId = await requireHouseholdId(locals.user.id)

  try {
    const units = await getUnits(householdId)
    return { units, loadError: null }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[einheiten] load error:', msg)
    return { units: [], loadError: 'Einheiten konnten nicht geladen werden. Bitte Seite neu laden.' }
  }
}
