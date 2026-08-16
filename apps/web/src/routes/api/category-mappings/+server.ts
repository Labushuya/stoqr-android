import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { requireHouseholdId } from '$lib/server/queries/households'
import { writeAudit } from '$lib/server/queries/audit'
import { listCategoryMappings, createCategoryMapping } from '$lib/server/queries/category-mapping'

// ---------------------------------------------------------------------------
// GET /api/category-mappings   — Regeln des Haushalts (+ Ziel-Kategorie-Name)
// POST /api/category-mappings  — Regel anlegen { source, token, categoryId }
// ---------------------------------------------------------------------------

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 })
  const householdId = await requireHouseholdId(locals.user.id)
  return json(await listCategoryMappings(householdId))
}

export const POST: RequestHandler = async ({ locals, request }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 })
  const householdId = await requireHouseholdId(locals.user.id)

  const body = (await request.json().catch(() => ({}))) as {
    source?: string
    token?: string
    categoryId?: string
  }

  const res = await createCategoryMapping(householdId, {
    source: body.source ?? '',
    token: body.token ?? '',
    categoryId: body.categoryId ?? '',
  })
  if (!res.ok) {
    const status = res.reason === 'duplicate' ? 409 : 400
    return json({ error: res.detail ?? 'Regel konnte nicht angelegt werden.' }, { status })
  }

  await writeAudit({
    householdId,
    userId: locals.user.id,
    action: 'INSERT',
    tableName: 'category_mappings',
    recordId: res.row.id,
    newValues: { source: res.row.source, token: res.row.token, categoryId: res.row.categoryId },
  })

  return json(res.row, { status: 201 })
}
