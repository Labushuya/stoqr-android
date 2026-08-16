import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { generateAutoNeeds } from '$lib/server/queries/shopping-list'
import { requireHouseholdId } from '$lib/server/queries/households'

// POST /api/shopping-list/generate — auto-Bedarf aus Soll-Ist erzeugen/aktualisieren
export const POST: RequestHandler = async ({ locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const householdId = await requireHouseholdId(locals.user.id)
    const result = await generateAutoNeeds(householdId)
    return json(result)
  } catch (err) {
    console.error('[POST /api/shopping-list/generate]', err)
    return json({ error: 'Fehler beim Erzeugen des Bedarfs' }, { status: 500 })
  }
}
