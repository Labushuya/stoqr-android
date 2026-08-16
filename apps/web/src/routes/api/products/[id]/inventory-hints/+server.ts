import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { suggestStorePlaceForProduct } from '$lib/server/queries/products'
import { requireHouseholdId } from '$lib/server/queries/households'

/**
 * GET /api/products/:id/inventory-hints
 *
 * Liefert Vorbelegungs-Hinweise fuer einen neuen Bestand dieses Artikels:
 * haeufigster Lagerort (location/storage/place) und Markt vorhandener Bestaende
 * desselben Haushalts (Block C — Vererbung bekannter Werte).
 */
export const GET: RequestHandler = async ({ locals, params }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 })
  }
  const householdId = await requireHouseholdId(locals.user.id)
  const hints = await suggestStorePlaceForProduct(params.id, householdId)
  return json(hints)
}
