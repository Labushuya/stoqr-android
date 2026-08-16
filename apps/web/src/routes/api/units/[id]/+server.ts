import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { requireHouseholdId } from '$lib/server/queries/households'
import { writeAudit } from '$lib/server/queries/audit'
import { getDb } from '$lib/server/db'
import { units, inventoryItems } from '@stoqr/db'
import { eq, and, count } from 'drizzle-orm'

// ---------------------------------------------------------------------------
// DELETE /api/units/[id]
// ---------------------------------------------------------------------------

export const DELETE: RequestHandler = async ({ locals, params }) => {
  const db = getDb()
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 })
  }

  const householdId = await requireHouseholdId(locals.user.id)

  const [unit] = await db
    .select()
    .from(units)
    .where(eq(units.id, params.id))

  if (!unit) {
    return json({ error: 'Not found' }, { status: 404 })
  }

  if (unit.isSystem) {
    return json({ error: 'System units cannot be deleted' }, { status: 403 })
  }

  if (unit.householdId !== householdId) {
    return json({ error: 'Not found' }, { status: 404 })
  }

  const [{ usedBy }] = await db
    .select({ usedBy: count() })
    .from(inventoryItems)
    .where(
      and(
        eq(inventoryItems.householdId, householdId),
        eq(inventoryItems.unit, unit.symbol)
      )
    )

  if (usedBy > 0) {
    return json(
      {
        error: `Diese Einheit wird von ${usedBy} Artikel(n) verwendet und kann nicht gelöscht werden.`,
        usedBy,
      },
      { status: 409 }
    )
  }

  await db.delete(units).where(eq(units.id, params.id))

  await writeAudit({
    householdId,
    userId: locals.user.id,
    action: 'DELETE',
    tableName: 'units',
    recordId: params.id,
    oldValues: { name: unit.name, symbol: unit.symbol },
  })

  return json({ ok: true })
}

// ---------------------------------------------------------------------------
// PATCH /api/units/[id]
// ---------------------------------------------------------------------------

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
  const db = getDb()
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 })
  }

  const householdId = await requireHouseholdId(locals.user.id)

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { name, symbol, dimension, toBaseFactor } = body as {
    name?: string
    symbol?: string
    dimension?: string
    toBaseFactor?: number | string
  }

  if (name !== undefined && typeof name !== 'string') {
    return json({ error: 'name muss ein String sein' }, { status: 400 })
  }
  if (symbol !== undefined && typeof symbol !== 'string') {
    return json({ error: 'symbol muss ein String sein' }, { status: 400 })
  }
  if (dimension !== undefined && !['mass', 'volume', 'count'].includes(dimension)) {
    return json({ error: 'dimension muss mass, volume oder count sein' }, { status: 400 })
  }
  let factorNum: number | undefined
  if (toBaseFactor !== undefined) {
    factorNum = Number(toBaseFactor)
    if (!Number.isFinite(factorNum) || factorNum <= 0) {
      return json({ error: 'toBaseFactor muss eine Zahl > 0 sein' }, { status: 400 })
    }
  }

  const trimmedName = name?.trim()
  const trimmedSymbol = symbol?.trim()

  if (trimmedName !== undefined && trimmedName.length === 0) {
    return json({ error: 'Name darf nicht leer sein' }, { status: 400 })
  }
  if (trimmedSymbol !== undefined && trimmedSymbol.length === 0) {
    return json({ error: 'Kürzel darf nicht leer sein' }, { status: 400 })
  }

  const [unit] = await db
    .select()
    .from(units)
    .where(eq(units.id, params.id))

  if (!unit) {
    return json({ error: 'Not found' }, { status: 404 })
  }

  if (unit.isSystem) {
    return json({ error: 'System-Einheiten können nicht bearbeitet werden' }, { status: 403 })
  }

  if (unit.householdId !== householdId) {
    return json({ error: 'Not found' }, { status: 404 })
  }

  const updates: Partial<typeof unit> = {}
  if (trimmedName !== undefined) updates.name = trimmedName
  if (trimmedSymbol !== undefined) updates.symbol = trimmedSymbol
  if (dimension !== undefined) updates.dimension = dimension as 'mass' | 'volume' | 'count'
  if (factorNum !== undefined) updates.toBaseFactor = String(factorNum)

  if (Object.keys(updates).length === 0) {
    return json(unit)
  }

  const oldSymbol = unit.symbol

  const [updated] = await db
    .update(units)
    .set(updates)
    .where(eq(units.id, params.id))
    .returning()

  if (updates.symbol && updates.symbol !== oldSymbol) {
    await db.update(inventoryItems)
      .set({ unit: updates.symbol })
      .where(and(
        eq(inventoryItems.householdId, householdId),
        eq(inventoryItems.unit, oldSymbol)
      ))
  }

  const oldValues: Record<string, unknown> = {}
  const newValues: Record<string, unknown> = {}
  for (const key of Object.keys(updates) as (keyof typeof updates)[]) {
    oldValues[key as string] = unit[key]
    newValues[key as string] = updated[key]
  }

  await writeAudit({
    householdId,
    userId: locals.user.id,
    action: 'UPDATE',
    tableName: 'units',
    recordId: params.id,
    oldValues,
    newValues,
  })

  return json(updated)
}
