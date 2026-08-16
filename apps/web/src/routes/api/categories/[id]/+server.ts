import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { requireHouseholdId } from '$lib/server/queries/households'
import { writeAudit } from '$lib/server/queries/audit'
import {
  getCategoryById,
  updateCategory,
  deleteCategory,
} from '$lib/server/queries/categories'

// ---------------------------------------------------------------------------
// PATCH /api/categories/[id]  — umbenennen / Icon aendern { name?, icon? }
// DELETE /api/categories/[id] — loeschen (204); 409 bei Verwendung/Seed-Schutz
// ---------------------------------------------------------------------------

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 })
  const householdId = await requireHouseholdId(locals.user.id)

  const body = (await request.json().catch(() => ({}))) as {
    name?: string
    icon?: string | null
    parentId?: string | null
  }
  if (body.name !== undefined && body.name.trim() === '') {
    return json({ error: 'Name darf nicht leer sein' }, { status: 400 })
  }

  const before = await getCategoryById(params.id)
  if (!before) return json({ error: 'Not found' }, { status: 404 })

  const res = await updateCategory(params.id, { name: body.name, icon: body.icon, parentId: body.parentId })
  if (!res.ok) {
    if (res.reason === 'cycle') return json({ error: res.detail ?? 'Ungültige Verschachtelung.' }, { status: 409 })
    return json({ error: 'Not found' }, { status: 404 })
  }
  const updated = res.row

  await writeAudit({
    householdId,
    userId: locals.user.id,
    action: 'UPDATE',
    tableName: 'categories',
    recordId: params.id,
    oldValues: { name: before.name, icon: before.icon, parentId: before.parentId },
    newValues: { name: updated.name, icon: updated.icon, parentId: updated.parentId },
  })

  return json(updated)
}

export const DELETE: RequestHandler = async ({ locals, params }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 })
  const householdId = await requireHouseholdId(locals.user.id)

  const before = await getCategoryById(params.id)
  const res = await deleteCategory(params.id)

  if (!res.ok) {
    if (res.reason === 'not-found') return json({ error: 'Not found' }, { status: 404 })
    // Seed-Schutz + Verwendung → 409 mit Klartext
    return json({ error: res.detail ?? 'Kategorie kann nicht gelöscht werden.' }, { status: 409 })
  }

  await writeAudit({
    householdId,
    userId: locals.user.id,
    action: 'DELETE',
    tableName: 'categories',
    recordId: params.id,
    oldValues: before ? { name: before.name, slug: before.slug } : undefined,
  })

  return new Response(null, { status: 204 })
}
