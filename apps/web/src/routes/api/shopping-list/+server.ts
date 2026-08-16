import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { getShoppingList, addManualItem } from '$lib/server/queries/shopping-list'
import { requireHouseholdId } from '$lib/server/queries/households'

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const householdId = await requireHouseholdId(locals.user.id)
    const items = await getShoppingList(householdId)
    return json(items)
  } catch (err) {
    console.error('[GET /api/shopping-list]', err)
    return json({ error: 'Fehler beim Laden der Einkaufsliste' }, { status: 500 })
  }
}

// POST — manuellen Freitext-Eintrag anlegen
export const POST: RequestHandler = async ({ locals, request }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const householdId = await requireHouseholdId(locals.user.id)
    const body = await request.json()
    const freeTextName = typeof body?.freeTextName === 'string' ? body.freeTextName.trim() : ''
    if (!freeTextName) return json({ error: 'Bezeichnung ist erforderlich' }, { status: 400 })

    const qty = body?.quantity != null ? Number(body.quantity) : 1
    if (!Number.isFinite(qty) || qty <= 0) {
      return json({ error: 'Menge muss eine Zahl > 0 sein' }, { status: 400 })
    }

    const row = await addManualItem({
      householdId,
      freeTextName,
      quantity: qty,
      unit: typeof body?.unit === 'string' && body.unit ? body.unit : 'piece',
      notes: body?.notes ?? null,
    })
    return json(row, { status: 201 })
  } catch (err) {
    console.error('[POST /api/shopping-list]', err)
    return json({ error: 'Fehler beim Hinzufügen' }, { status: 500 })
  }
}
