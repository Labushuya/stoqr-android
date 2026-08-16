import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { requireHouseholdId } from '$lib/server/queries/households'
import { reserveNeed, reserveAllForStore } from '$lib/server/queries/shopping-trips'
import { writeAudit } from '$lib/server/queries/audit'
import { isUniqueViolation } from '$lib/server/db-errors'

/**
 * POST /api/shopping-trips/:id/items
 * Reserviert Bedarf(e) für diesen Run:
 *  - { shoppingListItemId }            → einzelne Reservierung
 *  - { reserveAllForStore: <id|null> } → alle offenen (markt-passenden) Bedarfe
 */
export const POST: RequestHandler = async ({ locals, params, request }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 })
  const householdId = await requireHouseholdId(locals.user.id)

  const body = await request.json().catch(() => ({}))
  const { shoppingListItemId, reserveAllForStore: storeId } = body as {
    shoppingListItemId?: string
    reserveAllForStore?: string | null
  }

  try {
    if (shoppingListItemId) {
      const row = await reserveNeed(shoppingListItemId, params.id, householdId)
      if (!row) return json({ error: 'Bedarf oder Einkauf nicht gefunden' }, { status: 404 })
      await writeAudit({
        householdId,
        userId: locals.user.id,
        action: 'INSERT',
        tableName: 'shopping_trip_items',
        recordId: row.id,
        newValues: { tripId: row.tripId, productId: row.productId, quantity: row.quantity, unit: row.unit },
      })
      return json(row, { status: 201 })
    }

    if (storeId !== undefined) {
      const { reserved } = await reserveAllForStore(params.id, storeId, householdId)
      return json({ reserved })
    }

    return json({ error: 'shoppingListItemId oder reserveAllForStore erforderlich' }, { status: 400 })
  } catch (err) {
    if (isUniqueViolation(err)) {
      return json({ error: 'Dieser Bedarf ist bereits einem Einkauf zugewiesen.' }, { status: 409 })
    }
    console.error('[POST /api/shopping-trips/[id]/items]', err)
    return json({ error: 'Fehler beim Reservieren' }, { status: 500 })
  }
}
