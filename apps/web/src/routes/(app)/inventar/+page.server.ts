import { getInventoryItems, getCategories } from '$lib/server/queries/products'
import { getLocations } from '$lib/server/queries/locations'
import { requireHouseholdId, getUnits } from '$lib/server/queries/households'
import { getDb } from '$lib/server/db'
import { expiryConfig } from '@stoqr/db'
import { eq } from 'drizzle-orm'
import { redirect } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ locals, url }) => {
  const db = getDb()
  if (!locals.user) redirect(302, '/login')
  const placeId = url.searchParams.get('placeId') ?? undefined
  const householdId = await requireHouseholdId(locals.user.id)
  const [items, locations, units, categories, cfg] = await Promise.all([
    // Alle Status laden, damit der „Nur verfuegbare"-Toggle clientseitig wirkt
    // (Default: nur verfuegbare sichtbar; abgeschaltet -> auch verbraucht/gespendet/entsorgt).
    getInventoryItems(householdId, { placeId, allStatuses: true }),
    getLocations(householdId),
    getUnits(householdId),
    getCategories(),
    // Haushalts-Ablaufkonfiguration → einheitliche MHD-Schwellen (statt Hardcodes) fuer beide Ansichten.
    db.query.expiryConfig.findFirst({ where: eq(expiryConfig.householdId, householdId) }),
  ])
  const expirySettings = {
    yellowDaysBefore: cfg?.yellowDaysBefore ?? 7,
    redDaysBefore: cfg?.redDaysBefore ?? 2,
    graceDaysAfter: cfg?.graceDaysAfter ?? 0,
  }
  return { items, locations, units, categories, expirySettings }
}
