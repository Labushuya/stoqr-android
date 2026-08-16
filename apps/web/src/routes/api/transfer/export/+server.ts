import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { getDb } from '$lib/server/db'
import { requireHouseholdId } from '$lib/server/queries/households'
import {
  collectExport,
  serializeEnvelope,
  TIER_TABLES,
  type ExportTier,
  type TransferSchema,
  units,
  stores,
  products,
  productNutrients,
  productFieldSources,
  productStores,
  categoryMappings,
  expiryConfig,
  locations,
  storages,
  places,
  inventoryItems,
  stockTargets,
  productPrices,
  shoppingListItems,
  shoppingTrips,
  shoppingTripItems,
  categories,
  nutrientTypes,
  globusSnapshots,
} from '@stoqr/db'
import { eq, inArray, and } from 'drizzle-orm'

// ---------------------------------------------------------------------------
// GET /api/transfer/export?scope=<tier>
// ---------------------------------------------------------------------------
// Baut auf dem Pi (Postgres) ein .stoqr-Envelope des gewaehlten Tiers und
// liefert es als Download. Auth/Referenzdaten werden nie exportiert (siehe
// collectExport / NEVER_EXPORT). Dies ist Erstbefuellung, kein Sync.

// Schema-Namespace fuer den dialekt-neutralen Runner. Beim Pi kommen die
// Tabellen direkt aus dem Barrel (kein sqliteSchema-Namespace).
const PG_SCHEMA: TransferSchema = {
  units,
  stores,
  products,
  productNutrients,
  productFieldSources,
  productStores,
  categoryMappings,
  expiryConfig,
  locations,
  storages,
  places,
  inventoryItems,
  stockTargets,
  productPrices,
  shoppingListItems,
  shoppingTrips,
  shoppingTripItems,
  categories,
  nutrientTypes,
  globusSnapshots,
}

function isTier(v: string): v is ExportTier {
  return v === 'stammdaten' || v === 'orte-inventar' || v === 'einkauf' || v === 'alles'
}

export const GET: RequestHandler = async ({ locals, url }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 })

  const householdId = await requireHouseholdId(locals.user.id)
  const scopeRaw = url.searchParams.get('scope') ?? 'alles'
  if (!isTier(scopeRaw)) {
    return json({ error: `Unbekannter scope: ${scopeRaw}` }, { status: 400 })
  }
  // sicherstellen, dass der Tier bekannt ist (defensiv gegen Registry-Drift).
  if (!TIER_TABLES[scopeRaw]) error(500, 'Tier-Definition fehlt.')

  const db = getDb()
  const envelope = await collectExport({
    db,
    schema: PG_SCHEMA,
    ops: { eq, inArray, and },
    sourceSystem: 'pi',
    scope: scopeRaw,
    householdId,
    exportedAt: new Date().toISOString(),
  })

  const body = serializeEnvelope(envelope)
  const stamp = envelope.exportedAt.slice(0, 10)
  const filename = `stoqr-${scopeRaw}-${stamp}.stoqr`

  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'no-store',
    },
  })
}
