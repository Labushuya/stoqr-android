import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { getDb } from '$lib/server/db'
import { stores } from '@stoqr/db'
import { and, eq, isNotNull } from 'drizzle-orm'
import { requireHouseholdId } from '$lib/server/queries/households'
import { searchCatalogSnapshots, recordSnapshot } from '$lib/server/queries/globus-snapshots'
import { downloadCatalogImage } from '$lib/server/media'
import { fetchGlobusSuggest, isPriceScrapeEnabled } from '$lib/server/scrape/globus'
import { applyQueryToUrl } from '$lib/utils/globus-price'

// ---------------------------------------------------------------------------
// GET /api/catalog/search?q=<begriff>  — On-demand-Katalog-Suche (G8-4)
//
// (1) Durchsucht den lokalen Katalog (globus_snapshots). (2) Wenn der Abruf aktiv
// ist, ein Markt mit Abruf-URL existiert und wenige/keine lokalen Treffer da sind,
// EINMALIG live bei Globus suchen (Klartext-Query), Treffer als Snapshots
// persistieren (productId=null) + Bilder laden. Failsafe: Live-Fehler → nur lokale
// Treffer. Kein Massen-Crawl.
// ---------------------------------------------------------------------------

const LOCAL_ENOUGH = 5

export const GET: RequestHandler = async ({ locals, url }) => {
  const db = getDb()
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 })
  const householdId = await requireHouseholdId(locals.user.id)

  const q = (url.searchParams.get('q') ?? '').trim()
  if (q.length < 2) return json({ results: [], live: false })

  let results = await searchCatalogSnapshots(householdId, q)

  // Live-Nachschlag nur bei aktivem Feature + wenig lokalen Treffern.
  let live = false
  if (results.length < LOCAL_ENOUGH && (await isPriceScrapeEnabled(householdId))) {
    const [store] = await db
      .select({ id: stores.id, scrapeUrl: stores.scrapeUrl })
      .from(stores)
      .where(and(eq(stores.householdId, householdId), isNotNull(stores.scrapeUrl)))
      .limit(1)
    const target = store?.scrapeUrl ? applyQueryToUrl(store.scrapeUrl, q) : null
    if (store && target) {
      try {
        const hits = await fetchGlobusSuggest(target)
        for (const hit of hits) {
          const localImagePath = await downloadCatalogImage(householdId, hit.ean, hit.imageUrl)
          await recordSnapshot({
            householdId,
            productId: null,
            storeId: store.id,
            gtin: hit.ean,
            name: hit.name,
            category: hit.category,
            priceCt: hit.priceCt,
            currency: hit.currency,
            imageRemoteUrl: hit.imageUrl,
            localImagePath,
            rawJson: hit.raw,
            createdBy: locals.user.id,
          })
        }
        live = hits.length > 0
        // Nach dem Persistieren erneut lokal suchen (dedupe + einheitliche Form).
        results = await searchCatalogSnapshots(householdId, q)
      } catch (err) {
        console.error('[catalog/search] Live-Suggest fehlgeschlagen', err)
      }
    }
  }

  return json({ results, live })
}
