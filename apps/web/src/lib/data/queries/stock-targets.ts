import { getDb } from '$data/db'
import { stockTargets } from '@stoqr/db'
import { and, eq } from 'drizzle-orm'

// ---------------------------------------------------------------------------
// Soll-/Mindestbestand je Artikel (stock_targets). Unique (householdId, productId)
// → Upsert-Semantik. numeric-Felder werden als String geschrieben.
// ---------------------------------------------------------------------------

export async function getStockTargetForProduct(productId: string, householdId: string) {
  const db = getDb()
  const row = await db.query.stockTargets.findFirst({
    where: (t, { and, eq }) => and(eq(t.productId, productId), eq(t.householdId, householdId)),
  })
  return row ?? null
}

// Alle aktiven Soll-Vorgaben eines Haushalts (mit Produkt) — für die auto-Bedarfsrechnung.
export async function getStockTargets(householdId: string) {
  const db = getDb()
  return db.query.stockTargets.findMany({
    where: (t, { and, eq }) => and(eq(t.householdId, householdId), eq(t.isActive, true)),
    with: {
      product: {
        columns: {
          id: true,
          name: true,
          defaultUnit: true,
          defaultVolumeMl: true,
          defaultWeightG: true,
        },
      },
    },
  })
}

export async function upsertStockTarget(input: {
  productId: string
  householdId: string
  targetQuantity: number | string
  unit: string
  minQuantity?: number | string | null
  notes?: string | null
}) {
  const db = getDb()
  const values = {
    productId: input.productId,
    householdId: input.householdId,
    targetQuantity: String(input.targetQuantity),
    unit: input.unit,
    minQuantity:
      input.minQuantity != null && input.minQuantity !== '' ? String(input.minQuantity) : null,
    notes: input.notes ?? null,
  }

  await db
    .insert(stockTargets)
    .values(values)
    .onConflictDoUpdate({
      target: [stockTargets.householdId, stockTargets.productId],
      set: {
        targetQuantity: values.targetQuantity,
        unit: values.unit,
        minQuantity: values.minQuantity,
        notes: values.notes,
        updatedAt: new Date(),
      },
    })

  return getStockTargetForProduct(input.productId, input.householdId)
}

export async function deleteStockTarget(productId: string, householdId: string) {
  const db = getDb()
  const [row] = await db
    .delete(stockTargets)
    .where(and(eq(stockTargets.productId, productId), eq(stockTargets.householdId, householdId)))
    .returning({ id: stockTargets.id })
  return { deleted: !!row }
}
