import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { getDb } from '$lib/server/db'
import { requireHouseholdId } from '$lib/server/queries/households'
import { writeAudit } from '$lib/server/queries/audit'
import {
  applyImport,
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
  bringSync,
} from '@stoqr/db'
import { eq, inArray, and } from 'drizzle-orm'

// ---------------------------------------------------------------------------
// POST /api/transfer/import
// ---------------------------------------------------------------------------
// Nimmt ein .stoqr-Envelope (Rohtext im Body) und ueberschreibt (REPLACE) den
// Household-Content des eingeloggten Nutzers auf dem Pi. Referenzdaten
// (categories/nutrient_types/System-Units) bleiben; FKs werden per Slug/Symbol
// aufgeloest. Produkte per gtin dedupliziert. Destruktiv -> der Client zeigt ein
// type-to-confirm-Modal; der Body muss confirm=true tragen.

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
  bringSync,
}

export const POST: RequestHandler = async ({ locals, request }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 })

  const householdId = await requireHouseholdId(locals.user.id)

  // Body: { confirm: boolean, file: string }  (file = Rohtext der .stoqr-Datei)
  let body: { confirm?: boolean; file?: string }
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Body muss JSON sein: { confirm, file }.' }, { status: 400 })
  }
  if (body.confirm !== true) {
    return json({ error: 'Import nicht bestaetigt (confirm=true erforderlich).' }, { status: 400 })
  }
  if (typeof body.file !== 'string' || !body.file.length) {
    return json({ error: 'Feld file (Datei-Inhalt) fehlt.' }, { status: 400 })
  }

  const db = getDb()
  let result
  try {
    result = await applyImport({
      db,
      schema: PG_SCHEMA,
      ops: { eq, inArray, and },
      fileText: body.file,
      targetHouseholdId: householdId,
      targetUserId: locals.user.id,
      newId: () => crypto.randomUUID(),
    })
  } catch (err) {
    return json(
      { error: `Import fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}` },
      { status: 400 }
    )
  }

  // Nach dem REPLACE protokollieren (audit_log wird vom Wipe NICHT geleert).
  await writeAudit({
    householdId,
    userId: locals.user.id,
    action: 'INSERT',
    tableName: 'transfer_import',
    recordId: householdId,
    newValues: {
      scope: result.scope,
      sourceSystem: result.sourceSystem,
      inserted: result.inserted,
      reusedProducts: result.reusedProducts,
      warnings: result.warnings.length,
    },
  })

  return json(result, { status: 200 })
}
