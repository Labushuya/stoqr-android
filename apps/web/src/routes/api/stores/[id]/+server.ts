import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { getDb } from '$lib/server/db'
import { stores, inventoryItems } from '@stoqr/db'
import { eq, and, count } from 'drizzle-orm'
import { requireHouseholdId } from '$lib/server/queries/households'
import { writeAudit } from '$lib/server/queries/audit'
import { normalizeScrapeUrl, INVALID_URL, MISSING_EAN_PLACEHOLDER } from '$lib/server/scrape/globus'

// ---------------------------------------------------------------------------
// GET /api/stores/[id]
// ---------------------------------------------------------------------------

export const GET: RequestHandler = async ({ locals, params }) => {
  const db = getDb()
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 })
  }

  const householdId = await requireHouseholdId(locals.user.id)

  const [store] = await db
    .select()
    .from(stores)
    .where(and(eq(stores.id, params.id), eq(stores.householdId, householdId)))

  if (!store) {
    return json({ error: 'Not found' }, { status: 404 })
  }

  return json(store)
}

// ---------------------------------------------------------------------------
// PATCH /api/stores/[id]
// ---------------------------------------------------------------------------

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
  const db = getDb()
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 })
  }

  const householdId = await requireHouseholdId(locals.user.id)
  const body = await request.json()
  const { name, chain, address, city, latitude, longitude, scrapeUrl } = body as {
    name?: string
    chain?: string
    address?: string
    city?: string
    latitude?: string | number | null
    longitude?: string | number | null
    scrapeUrl?: string | null
  }

  const coordToDb = (v: string | number | null | undefined): string | null => {
    if (v === null || v === undefined || v === '') return null
    const n = Number(v)
    return Number.isFinite(n) ? String(n) : null
  }

  const patch: Partial<typeof stores.$inferInsert> = {}
  if (name !== undefined) patch.name = name
  if (chain !== undefined) patch.chain = chain ?? null
  if (address !== undefined) patch.address = address ?? null
  if (city !== undefined) patch.city = city ?? null
  if (latitude !== undefined) patch.latitude = coordToDb(latitude)
  if (longitude !== undefined) patch.longitude = coordToDb(longitude)
  if (scrapeUrl !== undefined) {
    const normalized = normalizeScrapeUrl(scrapeUrl)
    if (normalized === INVALID_URL) {
      return json({ error: 'Ungültige Abruf-URL (nur http/https)' }, { status: 400 })
    }
    if (normalized === MISSING_EAN_PLACEHOLDER) {
      return json({ error: 'Abruf-URL muss den Platzhalter {EAN} enthalten' }, { status: 400 })
    }
    patch.scrapeUrl = normalized
  }

  if (Object.keys(patch).length === 0) {
    return json({ error: 'No fields to update' }, { status: 400 })
  }

  const [existing] = await db
    .select()
    .from(stores)
    .where(and(eq(stores.id, params.id), eq(stores.householdId, householdId)))

  const [updated] = await db
    .update(stores)
    .set(patch)
    .where(and(eq(stores.id, params.id), eq(stores.householdId, householdId)))
    .returning()

  if (!updated) {
    return json({ error: 'Not found' }, { status: 404 })
  }

  const oldValues: Record<string, unknown> = {}
  const newValues: Record<string, unknown> = {}
  for (const key of Object.keys(patch) as (keyof typeof patch)[]) {
    oldValues[key] = existing[key]
    newValues[key] = updated[key]
  }

  await writeAudit({
    householdId,
    userId: locals.user.id,
    action: 'UPDATE',
    tableName: 'stores',
    recordId: params.id,
    oldValues,
    newValues,
  })

  return json(updated)
}

// ---------------------------------------------------------------------------
// DELETE /api/stores/[id]
// ---------------------------------------------------------------------------

export const DELETE: RequestHandler = async ({ locals, params }) => {
  const db = getDb()
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 })
  }

  const householdId = await requireHouseholdId(locals.user.id)

  // Verify store belongs to this household
  const [store] = await db
    .select({ id: stores.id, name: stores.name, chain: stores.chain })
    .from(stores)
    .where(and(eq(stores.id, params.id), eq(stores.householdId, householdId)))

  if (!store) {
    return json({ error: 'Not found' }, { status: 404 })
  }

  // Check for inventory items still referencing this store before deleting
  const [{ value: refCount }] = await db
    .select({ value: count() })
    .from(inventoryItems)
    .where(eq(inventoryItems.storeId, params.id))

  if (refCount > 0) {
    return json(
      { error: 'Markt wird noch von Beständen verwendet', count: refCount },
      { status: 409 }
    )
  }

  await db.delete(stores).where(eq(stores.id, params.id))

  await writeAudit({
    householdId,
    userId: locals.user.id,
    action: 'DELETE',
    tableName: 'stores',
    recordId: params.id,
    oldValues: { name: store.name, chain: store.chain },
  })

  return json({ ok: true })
}
