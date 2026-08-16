import { redirect, fail } from '@sveltejs/kit'
import { getDb } from '$lib/server/db'
import { stores } from '@stoqr/db'
import { eq, asc } from 'drizzle-orm'
import { requireHouseholdId } from '$lib/server/queries/households'
import { normalizeScrapeUrl, INVALID_URL, MISSING_EAN_PLACEHOLDER, isPriceScrapeEnabled } from '$lib/server/scrape/globus'
import type { PageServerLoad, Actions } from './$types'

// Koordinate defensiv parsen: leer/ungueltig -> null, sonst als String (Drizzle numeric).
function parseCoord(raw: string): string | null {
  const t = raw.trim()
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? String(n) : null
}

// Pflichtfelder (G4): Name + Adresse + Stadt. Kette optional; Abruf-URL optional.
// Gibt eine Fehlermeldung zurueck oder null, wenn alles vorhanden ist.
function validateRequired(name: string, address: string | null, city: string | null): string | null {
  if (!name) return 'Name ist erforderlich.'
  if (!address) return 'Adresse ist erforderlich.'
  if (!city) return 'Stadt ist erforderlich.'
  return null
}

export const load: PageServerLoad = async ({ locals }) => {
  const db = getDb()
  if (!locals.user) redirect(302, '/login')

  const householdId = await requireHouseholdId(locals.user.id)
  const priceScrapeEnabled = await isPriceScrapeEnabled(householdId)

  try {
    const storeRows = await db.query.stores.findMany({
      where: (s: any, { eq }: any) => eq(s.householdId, householdId),
      orderBy: [asc(stores.name)],
      columns: {
        id: true,
        name: true,
        chain: true,
        address: true,
        city: true,
        latitude: true,
        longitude: true,
        scrapeUrl: true,
      },
    })

    return { stores: storeRows, priceScrapeEnabled, loadError: null }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[maerkte] load error:', msg)
    return {
      stores: [],
      priceScrapeEnabled,
      loadError: 'Märkte konnten nicht geladen werden. Bitte Seite neu laden.',
    }
  }
}

export const actions: Actions = {
  addStore: async ({ locals, request }) => {
    const db = getDb()
    if (!locals.user) redirect(302, '/login')

    const householdId = await requireHouseholdId(locals.user.id)
    const data = await request.formData()

    const name = String(data.get('name') ?? '').trim()
    const chain = String(data.get('chain') ?? '').trim() || null
    const address = String(data.get('address') ?? '').trim() || null
    const city = String(data.get('city') ?? '').trim() || null
    const latitude = parseCoord(String(data.get('latitude') ?? ''))
    const longitude = parseCoord(String(data.get('longitude') ?? ''))
    const scrapeUrl = normalizeScrapeUrl(String(data.get('scrapeUrl') ?? ''))

    const reqErr = validateRequired(name, address, city)
    if (reqErr) {
      return fail(400, { action: 'addStore', error: reqErr })
    }
    if (scrapeUrl === INVALID_URL) {
      return fail(400, { action: 'addStore', error: 'Ungültige Abruf-URL (nur http/https).' })
    }
    if (scrapeUrl === MISSING_EAN_PLACEHOLDER) {
      return fail(400, { action: 'addStore', error: 'Abruf-URL muss den Platzhalter {EAN} enthalten.' })
    }

    const [created] = await db
      .insert(stores)
      .values({ householdId, name, chain, address, city, latitude, longitude, scrapeUrl })
      .returning()

    return { action: 'addStore', success: true, store: created }
  },

  editStore: async ({ locals, request }) => {
    const db = getDb()
    if (!locals.user) redirect(302, '/login')

    await requireHouseholdId(locals.user.id)
    const data = await request.formData()

    const id = String(data.get('id') ?? '').trim()
    const name = String(data.get('name') ?? '').trim()
    const chain = String(data.get('chain') ?? '').trim() || null
    const address = String(data.get('address') ?? '').trim() || null
    const city = String(data.get('city') ?? '').trim() || null
    const latitude = parseCoord(String(data.get('latitude') ?? ''))
    const longitude = parseCoord(String(data.get('longitude') ?? ''))
    const scrapeUrl = normalizeScrapeUrl(String(data.get('scrapeUrl') ?? ''))

    if (!id) {
      return fail(400, { action: 'editStore', error: 'ID ist erforderlich.' })
    }
    const reqErr = validateRequired(name, address, city)
    if (reqErr) {
      return fail(400, { action: 'editStore', error: reqErr })
    }
    if (scrapeUrl === INVALID_URL) {
      return fail(400, { action: 'editStore', error: 'Ungültige Abruf-URL (nur http/https).' })
    }
    if (scrapeUrl === MISSING_EAN_PLACEHOLDER) {
      return fail(400, { action: 'editStore', error: 'Abruf-URL muss den Platzhalter {EAN} enthalten.' })
    }

    const [updated] = await db
      .update(stores)
      .set({ name, chain, address, city, latitude, longitude, scrapeUrl })
      .where(eq(stores.id, id))
      .returning()

    if (!updated) {
      return fail(404, { action: 'editStore', error: 'Markt nicht gefunden.' })
    }

    return { action: 'editStore', success: true, store: updated }
  },

  deleteStore: async ({ locals, request }) => {
    const db = getDb()
    if (!locals.user) redirect(302, '/login')

    await requireHouseholdId(locals.user.id)
    const data = await request.formData()

    const id = String(data.get('id') ?? '').trim()

    if (!id) {
      return fail(400, { action: 'deleteStore', error: 'ID ist erforderlich.' })
    }

    try {
      await db.delete(stores).where(eq(stores.id, id))
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('foreign key') || msg.includes('violates') || msg.includes('constraint')) {
        return fail(409, {
          action: 'deleteStore',
          error: 'Dieser Markt kann nicht gelöscht werden, da er noch Artikeln zugeordnet ist.',
        })
      }
      return fail(500, { action: 'deleteStore', error: 'Unbekannter Fehler beim Löschen.' })
    }

    return { action: 'deleteStore', success: true, id }
  },
}
