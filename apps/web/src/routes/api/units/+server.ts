import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { requireHouseholdId, getUnits } from '$lib/server/queries/households'
import { writeAudit } from '$lib/server/queries/audit'
import { getDb } from '$lib/server/db'
import { units } from '@stoqr/db'

// ---------------------------------------------------------------------------
// GET /api/units
// ---------------------------------------------------------------------------

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 })
  }

  const householdId = await requireHouseholdId(locals.user.id)
  const result = await getUnits(householdId)
  return json(result)
}

// ---------------------------------------------------------------------------
// POST /api/units
// ---------------------------------------------------------------------------

export const POST: RequestHandler = async ({ locals, request }) => {
  const db = getDb()
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 })
  }

  const householdId = await requireHouseholdId(locals.user.id)

  const body = await request.json()
  const { name, symbol, dimension, toBaseFactor } = body as {
    name?: string
    symbol?: string
    dimension?: string
    toBaseFactor?: number | string
  }

  if (!name?.trim() || !symbol?.trim()) {
    return json({ error: 'name and symbol are required' }, { status: 400 })
  }

  const dim = dimension ?? 'count'
  if (!['mass', 'volume', 'count'].includes(dim)) {
    return json({ error: 'dimension muss mass, volume oder count sein' }, { status: 400 })
  }

  const factorNum = toBaseFactor != null ? Number(toBaseFactor) : 1
  if (!Number.isFinite(factorNum) || factorNum <= 0) {
    return json({ error: 'toBaseFactor muss eine Zahl > 0 sein' }, { status: 400 })
  }

  const [newUnit] = await db
    .insert(units)
    .values({
      householdId,
      name: name.trim(),
      symbol: symbol.trim(),
      dimension: dim as 'mass' | 'volume' | 'count',
      toBaseFactor: String(factorNum),
      isSystem: false,
      // Custom-Einheiten nach die System-Einheiten (sort_order 1..9) einsortieren,
      // damit die Standard-Vorauswahl nicht auf einer Custom-Einheit landet.
      sortOrder: 100,
    })
    .returning()

  await writeAudit({
    householdId,
    userId: locals.user.id,
    action: 'INSERT',
    tableName: 'units',
    recordId: newUnit.id,
    newValues: {
      name: newUnit.name,
      symbol: newUnit.symbol,
      dimension: newUnit.dimension,
      toBaseFactor: newUnit.toBaseFactor,
    },
  })

  return json(newUnit, { status: 201 })
}
