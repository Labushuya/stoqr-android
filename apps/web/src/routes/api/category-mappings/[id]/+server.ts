import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { requireHouseholdId } from '$lib/server/queries/households'
import { writeAudit } from '$lib/server/queries/audit'
import { deleteCategoryMapping } from '$lib/server/queries/category-mapping'

// ---------------------------------------------------------------------------
// DELETE /api/category-mappings/[id]  — Regel loeschen (household-scoped)
// ---------------------------------------------------------------------------

export const DELETE: RequestHandler = async ({ locals, params }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 })
  const householdId = await requireHouseholdId(locals.user.id)

  const deleted = await deleteCategoryMapping(params.id, householdId)
  if (!deleted) return json({ error: 'Not found' }, { status: 404 })

  await writeAudit({
    householdId,
    userId: locals.user.id,
    action: 'DELETE',
    tableName: 'category_mappings',
    recordId: params.id,
    oldValues: { source: deleted.source, token: deleted.token, categoryId: deleted.categoryId },
  })

  return new Response(null, { status: 204 })
}
