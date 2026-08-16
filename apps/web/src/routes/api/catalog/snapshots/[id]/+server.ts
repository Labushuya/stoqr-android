import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { requireHouseholdId } from '$lib/server/queries/households'
import { writeAudit } from '$lib/server/queries/audit'
import {
  applySnapshotToProduct,
  rejectSnapshot,
  materializeSnapshotToProduct,
} from '$lib/server/queries/globus-snapshots'

// ---------------------------------------------------------------------------
// POST /api/catalog/snapshots/[id]
//   { action: 'confirm', fields?: {...} } | { action: 'reject' } | { action: 'materialize' }
// confirm: uebernimmt angekreuzte Katalog-Felder in den zugeordneten Artikel (G8-1).
// materialize: legt aus dem Snapshot einen neuen Artikel an (Name/EAN/Bild/Kategorie) (G9-3).
// reject: verwirft den Vorschlag.
// ---------------------------------------------------------------------------

export const POST: RequestHandler = async ({ locals, params, request }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 })
  const householdId = await requireHouseholdId(locals.user.id)

  const body = (await request.json().catch(() => ({}))) as {
    action?: 'confirm' | 'reject' | 'materialize'
    fields?: { image?: boolean; name?: boolean; category?: boolean; price?: boolean; brand?: boolean; description?: boolean }
    // G20-2: im Katalog-Spiegel manuell gewaehlte Ziel-Kategorie (gewinnt ueber Auto-Match).
    categoryId?: string | null
  }

  if (body.action === 'materialize') {
    const product = await materializeSnapshotToProduct(params.id, householdId, locals.user.id)
    if (!product) return json({ error: 'Snapshot nicht gefunden' }, { status: 404 })
    await writeAudit({
      householdId,
      userId: locals.user.id,
      action: 'INSERT',
      tableName: 'products',
      recordId: product.id,
      newValues: { name: product.name, fromSnapshot: params.id },
    })
    return json({ ok: true, product })
  }

  if (body.action === 'confirm') {
    const fields = body.fields ?? { image: true }
    const res = await applySnapshotToProduct(
      params.id,
      householdId,
      fields,
      locals.user.id,
      body.categoryId ?? null
    )
    if (!res.ok) {
      if (res.reason === 'no-product') {
        return json({ error: 'Kein Artikel mit dieser EAN gefunden.' }, { status: 409 })
      }
      return json({ error: 'Snapshot nicht gefunden' }, { status: 404 })
    }
    await writeAudit({
      householdId,
      userId: locals.user.id,
      action: 'UPDATE',
      tableName: 'globus_snapshots',
      recordId: params.id,
      oldValues: { status: 'proposed' },
      newValues: { status: 'confirmed', applied: fields },
    })
    return json({ ok: true })
  }

  if (body.action === 'reject') {
    const row = await rejectSnapshot(params.id, householdId, locals.user.id)
    if (!row) return json({ error: 'Snapshot nicht gefunden' }, { status: 404 })
    await writeAudit({
      householdId,
      userId: locals.user.id,
      action: 'UPDATE',
      tableName: 'globus_snapshots',
      recordId: row.id,
      oldValues: { status: 'proposed' },
      newValues: { status: 'rejected' },
    })
    return json({ ok: true, snapshot: row })
  }

  return json({ error: 'Ungültige Aktion' }, { status: 400 })
}
