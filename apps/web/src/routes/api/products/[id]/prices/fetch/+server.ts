import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { getDb } from '$lib/server/db'
import { stores, products } from '@stoqr/db'
import { eq, and } from 'drizzle-orm'
import { requireHouseholdId } from '$lib/server/queries/households'
import { writeAudit } from '$lib/server/queries/audit'
import { recordProposedPrice } from '$lib/server/queries/prices'
import { suggestStockUnitForProduct } from '$lib/server/queries/products'
import { scrapeGlobusPrice, isPriceScrapeEnabled, resolveScrapeUrl } from '$lib/server/scrape/globus'

// ---------------------------------------------------------------------------
// POST /api/products/[id]/prices/fetch  { storeId }  — Online-Preis-Abruf (F2/G2)
//
// Failsafe: Env-Guard (403 wenn aus). Abruf-URL = store.scrapeUrl-Vorlage mit
// {EAN} → products.gtin ersetzt. Keine Quelle → 200 { proposed: null }.
// Scrape-Miss = 200 { proposed: null }. Treffer → Vorschlag (status='proposed',
// isCurrent=false) + Audit. Kein Auto-Confirm, kein 5xx bei Miss.
// ---------------------------------------------------------------------------

export const POST: RequestHandler = async ({ locals, params, request }) => {
  const db = getDb()
  try {
    if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 })

    const householdId = await requireHouseholdId(locals.user.id)
    if (!(await isPriceScrapeEnabled(householdId))) {
      return json({ error: 'Online-Preis-Abruf ist deaktiviert' }, { status: 403 })
    }

    const body = (await request.json().catch(() => ({}))) as { storeId?: string }
    if (!body.storeId) return json({ error: 'storeId fehlt' }, { status: 400 })

    const [store] = await db
      .select({ id: stores.id, name: stores.name, scrapeUrl: stores.scrapeUrl })
      .from(stores)
      .where(and(eq(stores.id, body.storeId), eq(stores.householdId, householdId)))
    if (!store) return json({ error: 'Markt nicht gefunden' }, { status: 404 })

    const product = await db.query.products.findFirst({
      where: eq(products.id, params.id),
      columns: { id: true, defaultUnit: true, gtin: true },
    })
    if (!product) return json({ error: 'Artikel nicht gefunden' }, { status: 404 })

    const url = resolveScrapeUrl(store, product.gtin)
    if (!url || !product.gtin) {
      // Keine Abruf-URL am Markt oder keine EAN am Artikel → nichts abrufbar.
      return json({ proposed: null, reason: 'no-source' })
    }

    const parsed = await scrapeGlobusPrice(url, product.gtin)
    if (!parsed) return json({ proposed: null, reason: 'no-price' })

    // Einheit des Vorschlags: haeufigste Bestands-Einheit (das, was der User sieht),
    // sonst defaultUnit, sonst 'piece'. Behebt den „falsche Einheit"-Fall.
    const stockUnit = await suggestStockUnitForProduct(product.id, householdId)

    const row = await recordProposedPrice({
      householdId,
      productId: product.id,
      storeId: store.id,
      priceCt: parsed.priceCt,
      unit: stockUnit ?? product.defaultUnit ?? 'piece',
      basePriceCt: parsed.basePriceCt,
      basePriceUnit: parsed.baseUnit,
      createdBy: locals.user.id,
    })

    await writeAudit({
      householdId,
      userId: locals.user.id,
      action: 'INSERT',
      tableName: 'product_prices',
      recordId: row.id,
      newValues: {
        status: 'proposed',
        source: 'online',
        priceCt: row.priceCt,
        unit: row.unit,
        storeId: store.id,
      },
    })

    return json({ proposed: row }, { status: 201 })
  } catch (err) {
    console.error('[prices/fetch] unerwarteter Fehler', err)
    return json({ error: 'Interner Fehler' }, { status: 500 })
  }
}
