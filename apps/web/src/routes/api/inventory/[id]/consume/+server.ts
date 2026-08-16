import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { consumeInventoryItem } from '$lib/server/queries/products'
import { requireHouseholdId } from '$lib/server/queries/households'
import { writeAudit } from '$lib/server/queries/audit'

export const POST: RequestHandler = async ({ locals, params, request }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 })
  }

  const householdId = await requireHouseholdId(locals.user.id)
  const body = await request.json()
  const { amount } = body

  if (typeof amount !== 'number' || amount <= 0) {
    return json({ error: 'amount must be a positive number' }, { status: 400 })
  }

  const updated = await consumeInventoryItem(params.id, householdId, amount)
  if (!updated) {
    return json({ error: 'Not found' }, { status: 404 })
  }

  // Audit-Log: Verbrauch eines Bestandsartikels.
  await writeAudit({
    householdId,
    userId: locals.user.id,
    action: 'UPDATE',
    tableName: 'inventory_items',
    recordId: params.id,
    newValues: { consumedAmount: amount },
  })

  return json(updated)
}
