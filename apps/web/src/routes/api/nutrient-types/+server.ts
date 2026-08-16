import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { getNutrientTypes, createNutrientType } from '$lib/server/queries/nutrients'
import { requireHouseholdId } from '$lib/server/queries/households'

// ---------------------------------------------------------------------------
// GET /api/nutrient-types — alle Nährstofftypen (global/geteilt)
// ---------------------------------------------------------------------------

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 })
  try {
    await requireHouseholdId(locals.user.id)
    const rows = await getNutrientTypes()
    return json(rows)
  } catch (err) {
    console.error('[GET /api/nutrient-types]', err)
    return json({ error: 'Fehler beim Laden der Nährstofftypen' }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// POST /api/nutrient-types — Custom-Nährstofftyp anlegen (idempotent)
// ---------------------------------------------------------------------------

export const POST: RequestHandler = async ({ locals, request }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 })
  try {
    await requireHouseholdId(locals.user.id)
    const body = await request.json()
    const name = typeof body?.name === 'string' ? body.name.trim() : ''
    const unit = typeof body?.unit === 'string' ? body.unit.trim() : ''

    if (!name || !unit) {
      return json({ error: 'Name und Einheit sind erforderlich' }, { status: 400 })
    }

    const type = await createNutrientType({ name, unit })
    return json(type, { status: 201 })
  } catch (err) {
    console.error('[POST /api/nutrient-types]', err)
    return json({ error: 'Fehler beim Anlegen des Nährstofftyps' }, { status: 500 })
  }
}
