import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { upsertStockTarget, deleteStockTarget } from '$lib/server/queries/stock-targets'
import { requireHouseholdId } from '$lib/server/queries/households'
import { writeAudit } from '$lib/server/queries/audit'

// ---------------------------------------------------------------------------
// Soll-/Mindestbestand eines Produkts. Upsert (unique householdId+productId).
// ---------------------------------------------------------------------------

// PUT /api/products/:id/target  { targetQuantity, unit, minQuantity? }
export const PUT: RequestHandler = async ({ locals, params, request }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const householdId = await requireHouseholdId(locals.user.id)
    const body = await request.json()
    const targetQuantity = Number(body?.targetQuantity)
    const unit = typeof body?.unit === 'string' ? body.unit.trim() : ''
    const minRaw = body?.minQuantity

    if (!unit) return json({ error: 'unit ist erforderlich' }, { status: 400 })
    if (!Number.isFinite(targetQuantity) || targetQuantity <= 0) {
      return json({ error: 'targetQuantity muss eine Zahl > 0 sein' }, { status: 400 })
    }
    let minQuantity: number | null = null
    if (minRaw != null && minRaw !== '') {
      minQuantity = Number(minRaw)
      if (!Number.isFinite(minQuantity) || minQuantity < 0) {
        return json({ error: 'minQuantity muss eine Zahl >= 0 sein' }, { status: 400 })
      }
    }

    const row = await upsertStockTarget({
      productId: params.id,
      householdId,
      targetQuantity,
      unit,
      minQuantity,
    })

    // Audit-Log: Soll-/Mindestbestand gesetzt (upsert => action UPDATE).
    await writeAudit({
      householdId,
      userId: locals.user.id,
      action: 'UPDATE',
      tableName: 'stock_targets',
      recordId: params.id,
      newValues: {
        targetQuantity: row?.targetQuantity ?? String(targetQuantity),
        unit,
        minQuantity: row?.minQuantity ?? minQuantity,
        notes: row?.notes ?? null,
      },
    })

    return json(row)
  } catch (err) {
    console.error('[PUT /api/products/[id]/target]', err)
    return json({ error: 'Fehler beim Speichern des Soll-Bestands' }, { status: 500 })
  }
}

// DELETE /api/products/:id/target
export const DELETE: RequestHandler = async ({ locals, params }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const householdId = await requireHouseholdId(locals.user.id)
    const { deleted } = await deleteStockTarget(params.id, householdId)
    if (!deleted) return json({ error: 'Not found' }, { status: 404 })

    // Audit-Log: Soll-/Mindestbestand entfernt.
    await writeAudit({
      householdId,
      userId: locals.user.id,
      action: 'DELETE',
      tableName: 'stock_targets',
      recordId: params.id,
    })

    return new Response(null, { status: 204 })
  } catch (err) {
    console.error('[DELETE /api/products/[id]/target]', err)
    return json({ error: 'Fehler beim Löschen des Soll-Bestands' }, { status: 500 })
  }
}
