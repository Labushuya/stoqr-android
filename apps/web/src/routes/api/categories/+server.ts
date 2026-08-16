import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { requireHouseholdId } from '$lib/server/queries/households'
import { writeAudit } from '$lib/server/queries/audit'
import { listCategories, createCategory } from '$lib/server/queries/categories'

// ---------------------------------------------------------------------------
// GET /api/categories        — alle Kategorien (global, nach sortOrder/Name)
// POST /api/categories       — neue Kategorie anlegen { name, icon? }
//
// categories ist global (kein household_id) — Auth ist Pflicht, aber keine
// Zeilen-Scope-Filterung. writeAudit protokolliert die Aenderung je Haushalt.
// ---------------------------------------------------------------------------

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 })
  const rows = await listCategories()
  return json(rows)
}

export const POST: RequestHandler = async ({ locals, request }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 })
  const householdId = await requireHouseholdId(locals.user.id)

  const body = (await request.json().catch(() => ({}))) as { name?: string; icon?: string | null; parentId?: string | null }
  const name = (body.name ?? '').trim()
  if (!name) return json({ error: 'Name erforderlich' }, { status: 400 })

  const row = await createCategory({ name, icon: body.icon ?? null, parentId: body.parentId ?? null })

  await writeAudit({
    householdId,
    userId: locals.user.id,
    action: 'INSERT',
    tableName: 'categories',
    recordId: row.id,
    newValues: { name: row.name, slug: row.slug, icon: row.icon, parentId: row.parentId },
  })

  return json(row, { status: 201 })
}
