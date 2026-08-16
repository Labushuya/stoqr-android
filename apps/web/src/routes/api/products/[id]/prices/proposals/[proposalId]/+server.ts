import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { requireHouseholdId } from '$lib/server/queries/households'
import { writeAudit } from '$lib/server/queries/audit'
import { confirmProposedPrice, rejectProposedPrice } from '$lib/server/queries/prices'

// ---------------------------------------------------------------------------
// POST /api/products/[id]/prices/proposals/[proposalId]  (F2)
//   { action: 'confirm' | 'reject', makePermanent?, priceCt?, unit?, isReduced? }
//
// Nicht env-geguarded: Vorschlaege muessen immer bestaetigt/verworfen werden
// koennen, auch wenn der Abruf spaeter abgeschaltet wird. „Korrigieren" =
// confirm mit ueberschriebenen Werten.
// ---------------------------------------------------------------------------

export const POST: RequestHandler = async ({ locals, params, request }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 })
  const householdId = await requireHouseholdId(locals.user.id)

  const body = (await request.json().catch(() => ({}))) as {
    action?: 'confirm' | 'reject'
    makePermanent?: boolean
    priceCt?: number
    unit?: string
    isReduced?: boolean
  }

  if (body.action === 'reject') {
    const row = await rejectProposedPrice(params.proposalId, householdId)
    if (!row) return json({ error: 'Vorschlag nicht gefunden' }, { status: 404 })
    await writeAudit({
      householdId,
      userId: locals.user.id,
      action: 'UPDATE',
      tableName: 'product_prices',
      recordId: row.id,
      oldValues: { status: 'proposed' },
      newValues: { status: 'rejected' },
    })
    return json({ ok: true, price: row })
  }

  if (body.action === 'confirm') {
    if (body.priceCt !== undefined && (!Number.isFinite(body.priceCt) || body.priceCt <= 0)) {
      return json({ error: 'Ungültiger Preis' }, { status: 400 })
    }
    const row = await confirmProposedPrice(params.proposalId, {
      householdId,
      makePermanent: body.makePermanent,
      priceCt: body.priceCt,
      unit: body.unit,
      isReduced: body.isReduced,
      createdBy: locals.user.id,
    })
    if (!row) return json({ error: 'Vorschlag nicht gefunden' }, { status: 404 })
    await writeAudit({
      householdId,
      userId: locals.user.id,
      action: 'UPDATE',
      tableName: 'product_prices',
      recordId: row.id,
      oldValues: { status: 'proposed' },
      newValues: {
        status: 'confirmed',
        isCurrent: row.isCurrent,
        priceCt: row.priceCt,
        unit: row.unit,
        isReduced: row.isReduced,
      },
    })
    return json({ ok: true, price: row })
  }

  return json({ error: 'Ungültige Aktion' }, { status: 400 })
}
