import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { requireHouseholdId } from '$lib/server/queries/households'
import { bookInTripItem } from '$lib/server/queries/shopping-trips'

/**
 * POST /api/shopping-trips/:id/items/:itemId/book-in
 *
 * Markiert eine Position als eingebucht: loescht den zugehoerigen Bedarf
 * (shopping_list_item) → die Trip-Position geht via cascade mit. Wird von easy-add
 * nach erfolgreichem Anlegen des echten Bestands aufgerufen.
 */
export const POST: RequestHandler = async ({ locals, params }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 })
  const householdId = await requireHouseholdId(locals.user.id)

  const { booked } = await bookInTripItem(params.itemId, householdId)
  if (!booked) return json({ error: 'Position nicht gefunden' }, { status: 404 })
  return json({ ok: true })
}
