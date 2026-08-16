import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { env } from '$env/dynamic/private'
import { mapNominatimResult, type NominatimRaw } from '$lib/utils/geo'

// ---------------------------------------------------------------------------
// GET /api/geo/search?q=<adresse>  — OpenStreetMap/Nominatim-Adress-Autocomplete (G2)
//
// Server-Proxy, weil Nominatim einen identifizierenden User-Agent + max. 1 req/s
// verlangt (Browser kann UA nicht setzen, CORS unzuverlässig). Failsafe: jeder
// Fehler / Timeout -> [], nie 5xx. In-Memory 1 req/s-Guard (Höflichkeit).
// ---------------------------------------------------------------------------

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'
const TIMEOUT_MS = 6000
const MIN_INTERVAL_MS = 1100 // Nominatim-Policy: <= 1 req/s

// Prozessweiter Zeitstempel des letzten Requests (einfacher Rate-Limit-Guard).
let lastRequestAt = 0

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export const GET: RequestHandler = async ({ locals, url }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 })

  const q = (url.searchParams.get('q') ?? '').trim()
  if (q.length < 3) return json({ results: [] })

  // Rate-Limit: mindestens MIN_INTERVAL_MS zwischen zwei Nominatim-Requests.
  const now = Date.now()
  const wait = lastRequestAt + MIN_INTERVAL_MS - now
  if (wait > 0) await sleep(wait)
  lastRequestAt = Date.now()

  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const target = new URL(NOMINATIM_URL)
    target.searchParams.set('format', 'json')
    target.searchParams.set('addressdetails', '1')
    target.searchParams.set('limit', '5')
    target.searchParams.set('countrycodes', 'de')
    target.searchParams.set('q', q)

    const res = await fetch(target, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': env.PRICE_SCRAPE_USER_AGENT || 'stoqr/0.1 (self-hosted household inventory)',
        'Accept-Language': 'de-DE,de;q=0.9',
      },
    })
    if (!res.ok) {
      console.warn(`[geo/search] Nominatim HTTP ${res.status}`)
      return json({ results: [] })
    }
    const raw = (await res.json()) as NominatimRaw[]
    const results = Array.isArray(raw)
      ? raw.map((r) => mapNominatimResult(r)).filter((r) => r !== null)
      : []
    return json({ results })
  } catch (err) {
    const reason = err instanceof Error ? err.name : 'unknown'
    console.warn(`[geo/search] Fehler (${reason})`)
    return json({ results: [] })
  } finally {
    clearTimeout(t)
  }
}
