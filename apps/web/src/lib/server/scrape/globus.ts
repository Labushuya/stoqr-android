// ---------------------------------------------------------------------------
// Online-Preis-Abruf (server-only, I/O) — Block F2/G4/G5.
//
// Nutzt den Globus-Suggest-Endpunkt (/{filiale}/suggest?search={EAN}), der
// serverseitig JSON pro Treffer liefert (die /search-Seite rendert erst per JS).
// scrapeGlobusPrice waehlt den Treffer mit exakt passender EAN. Failsafe „in
// jeder Hinsicht": wirft NIE — Timeout (8s), Netz-/HTTP-/Parse-Fehler, kein
// EAN-Match → alles `null`. Opt-in ueber den In-App-Schalter
// expiry_config.price_scrape_enabled (default AUS).
// ---------------------------------------------------------------------------

import { env } from '$env/dynamic/private'
import { eq } from 'drizzle-orm'
import { getDb } from '$lib/server/db'
import { expiryConfig } from '@stoqr/db'
import { applyEanToUrl, parseGlobusSuggestJson, matchSuggestByEan, parseGlobusDetailJsonLd, EAN_PLACEHOLDER, type GlobusSuggestProduct, type GlobusDetailData } from '$lib/utils/globus-price'

const TIMEOUT_MS = 8000
const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (compatible; stoqr-price/0.1; +https://github.com/Labushuya/stoqr)'

export type ScrapedPrice = {
  priceCt: number
  name: string
  ean: string
  basePriceCt: number | null
  baseUnit: string | null
}

/**
 * In-App-Schalter (household-weit): Online-Preis-Abruf nur aktiv, wenn in den
 * Einstellungen eingeschaltet. Default AUS (keine Zeile / false).
 */
export async function isPriceScrapeEnabled(householdId: string): Promise<boolean> {
  const db = getDb()
  const [row] = await db
    .select({ v: expiryConfig.priceScrapeEnabled })
    .from(expiryConfig)
    .where(eq(expiryConfig.householdId, householdId))
    .limit(1)
  return row?.v ?? false
}

/**
 * Ermittelt die Abruf-URL fuer (Markt, Artikel) (G4): die Markt-Vorlage
 * store.scrapeUrl mit {EAN}-Platzhalter, ersetzt durch die Artikel-GTIN.
 * Keine Vorlage oder {EAN} ohne GTIN → null (Aufrufer ueberspringt).
 */
export function resolveScrapeUrl(
  store: { scrapeUrl?: string | null },
  gtin: string | null | undefined,
): string | null {
  return applyEanToUrl(store.scrapeUrl, gtin)
}

/** Sentinel: Eingabe war eine nicht-leere, aber ungueltige URL. */
export const INVALID_URL = Symbol('invalid-url')

/** Sentinel: gueltige URL, aber ohne den {EAN}-Platzhalter (nicht abrufbar). */
export const MISSING_EAN_PLACEHOLDER = Symbol('missing-ean-placeholder')

/**
 * Normalisiert eine optionale Abruf-URL: leer/undefined → null, gueltige
 * http/https-URL MIT {EAN}-Platzhalter → getrimmter String. Ungueltige URL →
 * INVALID_URL; gueltige URL ohne {EAN} → MISSING_EAN_PLACEHOLDER (waere sonst
 * nie abrufbar und wuerde den Sync stumm ueberspringen, G10-3).
 */
export function normalizeScrapeUrl(
  value: string | null | undefined,
): string | null | typeof INVALID_URL | typeof MISSING_EAN_PLACEHOLDER {
  if (value === undefined || value === null) return null
  const trimmed = value.trim()
  if (trimmed === '') return null
  try {
    const u = new URL(trimmed)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return INVALID_URL
    if (!trimmed.includes(EAN_PLACEHOLDER)) return MISSING_EAN_PLACEHOLDER
    return trimmed
  } catch {
    return INVALID_URL
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return '<invalid-url>'
  }
}

/**
 * Ruft den Globus-Suggest-Endpunkt ab und parst alle Treffer. Gemeinsame Basis
 * fuer Preis-Abruf und Katalog-Snapshot. Bei JEDEM Fehler → leeres Ergebnis
 * (nie throw). `totalHits` = Anzahl geparster Treffer (fuer den Struktur-Check).
 */
async function fetchSuggest(url: string): Promise<GlobusSuggestProduct[]> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': env.PRICE_SCRAPE_USER_AGENT || DEFAULT_USER_AGENT,
        'Accept-Language': 'de-DE,de;q=0.9',
        // Der Suggest-Endpunkt wird per XHR aufgerufen; Header signalisiert das.
        'X-Requested-With': 'XMLHttpRequest',
      },
    })
    if (!res.ok) {
      console.warn(`[scrape/globus] ${hostOf(url)} → HTTP ${res.status}`)
      return []
    }
    return parseGlobusSuggestJson(await res.text())
  } catch (err) {
    const reason = err instanceof Error ? err.name : 'unknown'
    console.warn(`[scrape/globus] ${hostOf(url)} → Fehler (${reason})`)
    return []
  } finally {
    clearTimeout(t)
  }
}

/** Oeffentlicher Zugriff auf alle Suggest-Treffer einer URL (On-demand-Katalog-Suche, G8-4). */
export async function fetchGlobusSuggest(url: string): Promise<GlobusSuggestProduct[]> {
  return fetchSuggest(url)
}

/**
 * Laedt eine Globus-Produkt-Detailseite (G44) und liefert das rohe HTML + das
 * geparste schema.org/Product-JSON-LD (brand/description/offers). Best-effort,
 * defensiv: jeder Fehler → { html: null, data: <alles null> }. Kein throw.
 */
export async function fetchGlobusDetail(
  url: string,
): Promise<{ html: string | null; data: GlobusDetailData }> {
  const empty: GlobusDetailData = {
    brand: null, description: null, priceCt: null,
    availability: null, priceValidUntil: null, seller: null, hasDeposit: null,
  }
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': env.PRICE_SCRAPE_USER_AGENT || DEFAULT_USER_AGENT,
        'Accept-Language': 'de-DE,de;q=0.9',
      },
    })
    if (!res.ok) {
      console.warn(`[scrape/globus] detail ${hostOf(url)} → HTTP ${res.status}`)
      return { html: null, data: empty }
    }
    const html = await res.text()
    return { html, data: parseGlobusDetailJsonLd(html) }
  } catch (err) {
    const reason = err instanceof Error ? err.name : 'unknown'
    console.warn(`[scrape/globus] detail ${hostOf(url)} → Fehler (${reason})`)
    return { html: null, data: empty }
  } finally {
    clearTimeout(t)
  }
}

/**
 * Liefert den PREIS des Treffers mit exakt passender EAN (in Cent). Kein Match
 * oder Treffer ohne Preis → null (nie throw).
 */
export async function scrapeGlobusPrice(url: string, gtin: string): Promise<ScrapedPrice | null> {
  const match = matchSuggestByEan(await fetchSuggest(url), gtin)
  if (!match || match.priceCt == null) return null
  return {
    priceCt: match.priceCt,
    name: match.name,
    ean: match.ean,
    basePriceCt: match.basePriceCt,
    baseUnit: match.baseUnit,
  }
}

/**
 * Liefert den kompletten Katalog-Treffer (inkl. category/currency/imageUrl/raw,
 * auch ohne Preis) mit exakt passender EAN + Gesamt-Trefferzahl (fuer den
 * Struktur-Check des Katalog-Syncs). Zusaetzlich (G44): bei vorhandener Detail-URL
 * best-effort die Detailseite ziehen → detailData (JSON-LD) + detailHtml (Roh-Archiv).
 * Kein Fehler wird geworfen; ohne Detailtreffer bleiben detailData=null/detailHtml=null.
 */
export async function scrapeGlobusSnapshot(
  url: string,
  gtin: string,
): Promise<{
  product: GlobusSuggestProduct | null
  totalHits: number
  detailData: GlobusDetailData | null
  detailHtml: string | null
}> {
  const products = await fetchSuggest(url)
  const product = matchSuggestByEan(products, gtin)

  let detailData: GlobusDetailData | null = null
  let detailHtml: string | null = null
  if (product?.detailUrl) {
    const detail = await fetchGlobusDetail(product.detailUrl)
    detailData = detail.data
    detailHtml = detail.html
  }

  return { product, totalHits: products.length, detailData, detailHtml }
}
