import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { requireHouseholdId, getUnits } from '$lib/server/queries/households'
import {
  getProductById,
  updateProduct,
  listInventoryForProduct,
  updateInventoryItem,
} from '$lib/server/queries/products'
import { buildUnitMetaMap } from '$lib/utils/stock'
import { writeAudit } from '$lib/server/queries/audit'

// ---------------------------------------------------------------------------
// POST /api/products/[id]/normalize-unit  { unit, mode: 'relabel' | 'convert' }
//
// Gleicht die Standard-Einheit des Artikels UND ALLE Bestaende (jeden Status:
// available/consumed/donated/discarded/expired) auf eine Einheit an (G6).
//   - relabel: nur die Einheit umschreiben, Mengen unveraendert.
//   - convert: Menge umrechnen, wo Quelle+Ziel dieselbe mass/volume-Dimension
//     teilen (via toBaseFactor); sonst fuer diese Zeile Fallback = relabel.
// Betrifft ausschliesslich diesen Artikel + seine Bestaende, nicht das Inventar.
// ---------------------------------------------------------------------------

export const POST: RequestHandler = async ({ locals, params, request }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 })
  const householdId = await requireHouseholdId(locals.user.id)

  const body = (await request.json().catch(() => ({}))) as {
    unit?: string
    mode?: 'relabel' | 'convert'
  }
  const targetUnit = (body.unit ?? '').trim()
  const mode = body.mode === 'convert' ? 'convert' : 'relabel'
  if (!targetUnit) return json({ error: 'Einheit fehlt' }, { status: 400 })

  const product = await getProductById(params.id)
  if (!product) return json({ error: 'Artikel nicht gefunden' }, { status: 404 })

  const [units, items] = await Promise.all([
    getUnits(householdId),
    listInventoryForProduct(params.id, householdId),
  ])
  const meta = buildUnitMetaMap(units)
  const target = meta.get(targetUnit)
  if (!target) return json({ error: 'Unbekannte Einheit' }, { status: 400 })

  let converted = 0
  let relabeled = 0

  for (const item of items) {
    const src = meta.get(item.unit)
    let newQty: string | undefined
    if (
      mode === 'convert' &&
      src &&
      src.dimension === target.dimension &&
      (target.dimension === 'mass' || target.dimension === 'volume') &&
      target.toBaseFactor > 0
    ) {
      // Menge in Basiseinheit → Zieleinheit umrechnen.
      const qty = parseFloat(String(item.quantity))
      if (Number.isFinite(qty)) {
        const inBase = qty * src.toBaseFactor
        newQty = String(inBase / target.toBaseFactor)
        converted++
      } else {
        relabeled++
      }
    } else {
      relabeled++
    }
    await updateInventoryItem(item.id, householdId, {
      unit: targetUnit,
      ...(newQty !== undefined ? { quantity: newQty } : {}),
    })
  }

  const oldDefault = product.defaultUnit
  await updateProduct(params.id, { defaultUnit: targetUnit })

  await writeAudit({
    householdId,
    userId: locals.user.id,
    action: 'UPDATE',
    tableName: 'products',
    recordId: params.id,
    oldValues: { defaultUnit: oldDefault },
    newValues: { defaultUnit: targetUnit, mode, itemsConverted: converted, itemsRelabeled: relabeled },
  })

  return json({ ok: true, unit: targetUnit, mode, items: items.length, converted, relabeled })
}
