import { redirect } from '@sveltejs/kit'
import { requireHouseholdId } from '$lib/server/queries/households'
import { listAuditLog } from '$lib/server/queries/audit'
import type { PageServerLoad } from './$types'

// ---------------------------------------------------------------------------
// Aktivität (Block D): chronologisches Änderungsprotokoll des Haushalts.
// Zeigt alle Mutationen (Vorher→Nachher, Datum, User) der letzten Einträge.
// ---------------------------------------------------------------------------

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) redirect(302, '/login')
  const householdId = await requireHouseholdId(locals.user.id)

  try {
    const entries = await listAuditLog(householdId, { limit: 200 })
    return { entries, loadError: null }
  } catch (err) {
    console.error('[aktivitaet] load error:', err)
    return { entries: [], loadError: 'Aktivität konnte nicht geladen werden.' }
  }
}
