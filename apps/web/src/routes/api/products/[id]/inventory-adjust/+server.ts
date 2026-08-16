import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { requireHouseholdId, getUnits } from '$lib/server/queries/households'
import {
  listInventoryForProduct,
  updateInventoryItem,
  createInventoryItem,
} from '$lib/server/queries/products'
import { generateAutoNeeds } from '$lib/server/queries/shopping-list'
import { writeAudit } from '$lib/server/queries/audit'
import { buildUnitMetaMap, planInventoryAdjustment, resolveUnitMeta, buildPackSize } from '$lib/utils/stock'
import { getDb } from '$lib/server/db'
import { products } from '@stoqr/db'
import { eq } from 'drizzle-orm'

// ---------------------------------------------------------------------------
// POST /api/products/:id/inventory-adjust
//
// Bestandskorrektur/Inventur pro Artikel (G42) — zwei Modi:
//
//  A) VORSCHAU (Dry-Run):  { newQuantity, unit, preview: true }
//     Rechnet den FIFO-Plan (planInventoryAdjustment) und gibt ihn zurueck,
//     OHNE zu schreiben. Grundlage fuer die editierbare Vorschau im UI.
//
//  B) COMMIT:              { unit, lines: [{ id, newQuantity }], newLine?: { quantity, bestBeforeDate?, placeId?, storeId? } }
//     Schreibt die vom Nutzer bestaetigten/editierten Zeilen. Zeilen mit
//     newQuantity===0 werden zusaetzlich auf status 'consumed' gesetzt (G42:
//     0 -> verbraucht statt available/0). Optional wird eine neue Zeile angelegt
//     (Aufstocken „neue Zeile"). Audit je beruehrter Zeile mit old/new (Undo-Basis).
//
// Danach wird der auto-Bedarf neu berechnet.
// ---------------------------------------------------------------------------

export const POST: RequestHandler = async ({ locals, params, request }) => {
  const db = getDb()
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const householdId = await requireHouseholdId(locals.user.id)
    const body = await request.json()
    const unit = typeof body?.unit === 'string' ? body.unit.trim() : ''
    if (!unit) return json({ error: 'unit ist erforderlich' }, { status: 400 })

    // ── A) VORSCHAU ────────────────────────────────────────────────────────
    if (body?.preview === true) {
      const newQuantity = Number(body?.newQuantity)
      if (!Number.isFinite(newQuantity) || newQuantity < 0) {
        return json({ error: 'newQuantity muss eine Zahl >= 0 sein' }, { status: 400 })
      }
      const [items, units, product] = await Promise.all([
        listInventoryForProduct(params.id, householdId),
        getUnits(householdId),
        db.query.products.findFirst({
          where: eq(products.id, params.id),
          columns: { defaultUnit: true, defaultVolumeMl: true, defaultWeightG: true },
        }),
      ])
      const metaMap = buildUnitMetaMap(units)
      const packSize = product ? buildPackSize(product) : undefined
      const meta = resolveUnitMeta(unit, metaMap, packSize)
      const newTotalInBase = newQuantity * meta.toBaseFactor

      const plan = planInventoryAdjustment(
        items.map((i: any) => ({
          id: i.id,
          quantity: i.quantity,
          unit: i.unit,
          status: i.status,
          bestBeforeDate: i.bestBeforeDate,
        })),
        newTotalInBase,
        { dimension: meta.dimension, symbol: meta.symbol },
        metaMap,
        packSize
      )

      return json({
        preview: true,
        direction: plan.needsIncrease ? 'increase' : 'decrease',
        updates: plan.updates, // reduzierte Zeilen (alt->neu) — bei „decrease"
        relevantRows: plan.relevantRows, // bestehende Zeilen — Grundlage fuer „bestehende aufstocken"
        needsIncrease: plan.needsIncrease,
        suggestedNewQuantity: plan.suggestedNewQuantity, // Fehlmenge in Ziel-Einheit — fuer „neue Zeile"
        unit,
      })
    }

    // ── B) COMMIT ────────────────────────────────────────────────────────────
    const lines: Array<{ id: string; newQuantity: number }> = Array.isArray(body?.lines) ? body.lines : []
    const newLine = body?.newLine as
      | { quantity: number | string; bestBeforeDate?: string | null; placeId?: string | null; storeId?: string | null }
      | undefined

    if (lines.length === 0 && !newLine) {
      return json({ error: 'Keine Änderungen übergeben' }, { status: 400 })
    }

    let touched = 0

    // Bestehende Zeilen aktualisieren (Reduktion ODER Aufstockung auf bestehende).
    for (const line of lines) {
      if (typeof line?.id !== 'string') continue
      const q = Number(line.newQuantity)
      if (!Number.isFinite(q) || q < 0) continue

      // Alt-Zustand fuer Audit (Undo-Basis: Item-ID + Alt-Menge + Alt-Status).
      const before = await db.query.inventoryItems.findFirst({
        where: (i: any, { and, eq }: any) => and(eq(i.id, line.id), eq(i.householdId, householdId)),
        columns: { quantity: true, status: true },
      })
      if (!before) continue

      // G42: faellt eine Zeile auf 0, gilt sie als verbraucht (nicht available/0).
      const patch: Parameters<typeof updateInventoryItem>[2] = { quantity: q }
      if (q === 0) patch.status = 'consumed'
      else if (before.status !== 'available') patch.status = 'available' // Aufstocken reaktiviert

      await updateInventoryItem(line.id, householdId, patch)
      touched++

      await writeAudit({
        householdId,
        userId: locals.user.id,
        action: 'UPDATE',
        tableName: 'inventory_items',
        recordId: line.id,
        oldValues: { quantity: before.quantity, status: before.status },
        newValues: { quantity: String(q), status: patch.status ?? before.status },
        changedFields: patch.status ? ['quantity', 'status'] : ['quantity'],
      })
    }

    // Optional: neue Zeile anlegen (Aufstocken „neue Zeile"). MHD direkt setzbar.
    if (newLine) {
      const q = Number(newLine.quantity)
      if (Number.isFinite(q) && q > 0) {
        const created = await createInventoryItem({
          productId: params.id,
          householdId,
          quantity: q,
          unit,
          bestBeforeDate: newLine.bestBeforeDate || undefined,
          placeId: newLine.placeId || undefined,
          storeId: newLine.storeId || undefined,
        })
        touched++
        await writeAudit({
          householdId,
          userId: locals.user.id,
          action: 'INSERT',
          tableName: 'inventory_items',
          recordId: created?.id ?? params.id,
          newValues: { quantity: String(q), unit, bestBeforeDate: newLine.bestBeforeDate ?? null },
        })
      }
    }

    // Bedarf neu berechnen (auto-Eintraege aktualisieren).
    await generateAutoNeeds(householdId)

    return json({ ok: true, touched })
  } catch (err) {
    console.error('[POST /api/products/[id]/inventory-adjust]', err)
    return json({ error: 'Fehler bei der Bestandskorrektur' }, { status: 500 })
  }
}
