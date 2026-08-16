import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { getDb } from '$lib/server/db'
import { stores } from '@stoqr/db'
import { eq, asc } from 'drizzle-orm'
import { requireHouseholdId } from '$lib/server/queries/households'
import { writeAudit } from '$lib/server/queries/audit'
import { normalizeScrapeUrl, INVALID_URL, MISSING_EAN_PLACEHOLDER } from '$lib/server/scrape/globus'

// Koordinate defensiv fuer die numeric-Spalte aufbereiten: leer/ungueltig -> null.
function coordToDb(v: string | number | null | undefined): string | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? String(n) : null
}

// ---------------------------------------------------------------------------
// GET /api/stores
// ---------------------------------------------------------------------------

export const GET: RequestHandler = async ({ locals }) => {
  const db = getDb()
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 })
  }

  const householdId = await requireHouseholdId(locals.user.id)

  const rows = await db
    .select()
    .from(stores)
    .where(eq(stores.householdId, householdId))
    .orderBy(asc(stores.name))

  return json(rows)
}

// ---------------------------------------------------------------------------
// POST /api/stores
// ---------------------------------------------------------------------------

export const POST: RequestHandler = async ({ locals, request }) => {
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

  // Pflichtfelder (G4): Name + Adresse + Stadt. Kette optional.
  const nameT = (name ?? '').trim()
  const addressT = (address ?? '').trim()
  const cityT = (city ?? '').trim()
  if (!nameT) return json({ error: 'Name ist erforderlich' }, { status: 400 })
  if (!addressT) return json({ error: 'Adresse ist erforderlich' }, { status: 400 })
  if (!cityT) return json({ error: 'Stadt ist erforderlich' }, { status: 400 })

  const normalizedUrl = normalizeScrapeUrl(scrapeUrl)
  if (normalizedUrl === INVALID_URL) {
    return json({ error: 'Ungültige Abruf-URL (nur http/https)' }, { status: 400 })
  }
  if (normalizedUrl === MISSING_EAN_PLACEHOLDER) {
    return json({ error: 'Abruf-URL muss den Platzhalter {EAN} enthalten' }, { status: 400 })
  }

  const [store] = await db
    .insert(stores)
    .values({
      householdId,
      name: nameT,
      chain: (chain ?? '').trim() || null,
      address: addressT,
      city: cityT,
      latitude: coordToDb(latitude),
      longitude: coordToDb(longitude),
      scrapeUrl: normalizedUrl,
    })
    .returning()

  await writeAudit({
    householdId,
    userId: locals.user.id,
    action: 'INSERT',
    tableName: 'stores',
    recordId: store.id,
    newValues: { name: store.name, chain: store.chain },
  })

  return json(store, { status: 201 })
}
