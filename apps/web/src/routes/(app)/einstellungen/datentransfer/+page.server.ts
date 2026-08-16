import { redirect } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'

// ---------------------------------------------------------------------------
// Datentransfer (Import/Export) — Pi-Load.
// Nur Auth-Gate; die Seite ist rein aktionsgetrieben (Export/Import laufen ueber
// /api/transfer/*). Kein Datenladen noetig.
// ---------------------------------------------------------------------------

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) redirect(302, '/login')
  return {}
}
