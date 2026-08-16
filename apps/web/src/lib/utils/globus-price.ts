// ---------------------------------------------------------------------------
// Globus-Preis-Parser (reine Funktionen, testbar) — Block F2/G5.
//
// Globus (Shopware 6) rendert die Ergebnis-Seite (/search) per JavaScript, ein
// serverseitiger fetch sieht dort KEINE Preise. Der Suggest-Endpunkt
// (/{filiale}/suggest?search=…) liefert dagegen serverseitig fertiges HTML mit
// eingebettetem JSON pro Treffer:
//   <input ... data-etracker-search-suggest-product='{"id":"<EAN>","name":"…","price":"0.29","currency":"EUR"}'>
// Wir parsen dieses JSON (robust) und matchen exakt auf die gesuchte EAN.
// Bewusst defensiv: jeder Fehler / kein Treffer → leeres Ergebnis bzw. null.
// Der Netzwerk-Teil liegt server-only in lib/server/scrape/globus.ts.
// ---------------------------------------------------------------------------

// Platzhalter in der Markt-Abruf-URL, der beim Abruf durch die Artikel-GTIN ersetzt wird.
export const EAN_PLACEHOLDER = '{EAN}'

// Attribut, das Globus je Suggest-Treffer mit dem strukturierten JSON traegt.
const SUGGEST_ATTR = 'data-etracker-search-suggest-product'

/**
 * Setzt die GTIN in eine Markt-Abruf-URL ein. Enthaelt die Vorlage den
 * {EAN}-Platzhalter, muss eine GTIN vorhanden sein (sonst null). Ohne Platzhalter
 * wird die URL unveraendert zurueckgegeben. Defensiv: leere Vorlage → null.
 */
/**
 * Setzt die GTIN in eine Markt-Abruf-URL ein. Die Vorlage MUSS den {EAN}-Platzhalter
 * enthalten (sonst kann sie keinen konkreten Artikel adressieren) und die GTIN muss
 * gesetzt sein — andernfalls null (Aufrufer ueberspringt sauber).
 */
export function applyEanToUrl(
  template: string | null | undefined,
  gtin: string | null | undefined,
): string | null {
  const tpl = typeof template === 'string' ? template.trim() : ''
  if (tpl === '' || !tpl.includes(EAN_PLACEHOLDER)) return null
  const g = typeof gtin === 'string' ? gtin.trim() : ''
  if (g === '') return null
  return tpl.split(EAN_PLACEHOLDER).join(encodeURIComponent(g))
}

/**
 * Setzt einen freien Suchbegriff in die Markt-Abruf-URL ein (On-demand-Katalog,
 * G8-4). Vorlage MUSS den {EAN}-Platzhalter enthalten. Defensiv: sonst null.
 */
export function applyQueryToUrl(
  template: string | null | undefined,
  query: string | null | undefined,
): string | null {
  const tpl = typeof template === 'string' ? template.trim() : ''
  if (tpl === '' || !tpl.includes(EAN_PLACEHOLDER)) return null
  const q = typeof query === 'string' ? query.trim() : ''
  if (q === '') return null
  return tpl.split(EAN_PLACEHOLDER).join(encodeURIComponent(q))
}

/**
 * Wandelt einen Preis-String in Cent um.
 * - „0.29" → 29, „15.99" → 1599, „1,19" → 119, „2" → 200
 * - komma/punkt-tolerant; unparsbar → `null`
 */
export function parsePriceToCents(value: string | number | null | undefined): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.round(value * 100) : null
  }
  if (typeof value !== 'string') return null
  const norm = value.trim().replace(',', '.')
  if (norm === '') return null
  const n = Number.parseFloat(norm)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n * 100)
}

export type GlobusSuggestProduct = {
  ean: string
  name: string
  priceCt: number | null // null = Treffer ohne (parsbaren) Preis (fuer Snapshot erlaubt)
  category: string[]
  currency: string | null
  imageUrl: string | null
  // Grundpreis (PAngV, G44): der gesetzlich ausgezeichnete Preis je Basiseinheit
  // („0,19 € / 1 l"), aus dem Suggest-HTML (reference-price). null = nicht ausgezeichnet.
  basePriceCt: number | null
  baseUnit: string | null // normalisierte Basiseinheit: 'l' | 'kg' | '100g' | 'Stück' | Rohtext
  detailUrl: string | null // Link zur Produkt-Detailseite (Tor zu JSON-LD, G44)
  raw: unknown // vollstaendiges geparstes Suggest-JSON (fuer globus_snapshots.rawJson)
}

// HTML-Entities, die in den JSON-Attributwerten vorkommen, dekodieren.
function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&auml;/g, 'ä')
    .replace(/&ouml;/g, 'ö')
    .replace(/&uuml;/g, 'ü')
    .replace(/&Auml;/g, 'Ä')
    .replace(/&Ouml;/g, 'Ö')
    .replace(/&Uuml;/g, 'Ü')
    .replace(/&szlig;/g, 'ß')
    .replace(/&euro;/g, '€')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

/**
 * Extrahiert je EAN die Produktbild-URL aus dem Suggest-HTML. Globus benennt die
 * Bilder nach der EAM (`…/media/…/{EAN}_….jpg`), daher Zuordnung ueber die EAN
 * im Dateinamen. Defensiv: kein Input / keine Bilder → leere Map.
 */
export function extractImageUrlsByEan(html: string | null | undefined): Map<string, string> {
  const map = new Map<string, string>()
  if (typeof html !== 'string' || html.length === 0) return map
  const re = /<img[^>]+src="([^"]*\/(\d{8,14})_[^"]*\.(?:jpe?g|png|webp)(?:\?[^"]*)?)"/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    const url = m[1]
    const ean = m[2]
    if (ean && url && !map.has(ean)) map.set(ean, url)
  }
  return map
}

/**
 * Normalisiert eine ausgezeichnete Grundpreis-Einheit auf einen kompakten Schluessel.
 * „1 l" / „1&nbsp;l" → 'l'; „1 kg" → 'kg'; „100 g" → '100g'; „1 Stück" → 'Stück'.
 * Unbekanntes → getrimmter Rohtext (nie null, solange nicht leer).
 */
export function normalizeBaseUnit(raw: string): string {
  const s = raw.replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
  // fuehrende Menge (1, 100, ...) + Einheit
  const m = s.match(/^(\d+)?\s*(l|liter|kg|kilogramm|g|gramm|ml|stück|stk|st)\b/)
  if (!m) return raw.replace(/&nbsp;/g, ' ').trim()
  const qty = m[1] ? parseInt(m[1], 10) : 1
  const unit = m[2]
  if (unit === 'l' || unit === 'liter') return 'l'
  if (unit === 'kg' || unit === 'kilogramm') return 'kg'
  if (unit === 'ml') return 'ml'
  if (unit === 'g' || unit === 'gramm') return qty === 100 ? '100g' : `${qty}g`
  return 'Stück'
}

/**
 * Extrahiert den Grundpreis (PAngV, G44) aus dem Suggest-HTML: das
 * `search-suggest-product-reference-price`-Element traegt „(0,19 € / 1 l)".
 * Liefert { basePriceCt, baseUnit } oder null (nicht ausgezeichnet / unparsbar).
 * Erwartet den HTML-Ausschnitt EINES Treffers (oder den ersten Fund im String).
 */
export function parseGlobusReferencePrice(
  html: string | null | undefined,
): { basePriceCt: number; baseUnit: string } | null {
  if (typeof html !== 'string' || html.length === 0) return null
  // Inhalt des reference-price-Elements greifen (Klasse kann mit weiteren kombiniert sein).
  const block = html.match(/reference-price[^>]*>([^<]*)</i)
  if (!block) return null
  const text = decodeEntities(block[1]) // z.B. "(0,19 € / 1 l)"
  // Preis + Einheit: "0,19 € / 1 l"
  const m = text.match(/([\d.,]+)\s*€\s*\/\s*(.+?)\s*\)?\s*$/)
  if (!m) return null
  const basePriceCt = parsePriceToCents(m[1])
  if (basePriceCt === null || basePriceCt <= 0) return null
  const baseUnit = normalizeBaseUnit(m[2])
  return { basePriceCt, baseUnit }
}

/**
 * Extrahiert die Produkt-Detail-URL je EAN aus dem Suggest-HTML
 * (`search-suggest-product-link href="…/{EAN}/…"`). Zuordnung ueber die EAN im Pfad.
 * Defensiv: kein Input → leere Map.
 */
export function extractDetailUrlsByEan(html: string | null | undefined): Map<string, string> {
  const map = new Map<string, string>()
  if (typeof html !== 'string' || html.length === 0) return map
  const re = /href="([^"]*\/(\d{8,14})\/[^"]*)"[^>]*class="[^"]*search-suggest-product-link/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    const url = m[1]
    const ean = m[2]
    if (ean && url && !map.has(ean)) map.set(ean, url)
  }
  return map
}

// ---------------------------------------------------------------------------
// Detailseiten-JSON-LD (G44): die Produkt-Detailseite bettet schema.org/Product
// als <script type="application/ld+json"> serverseitig ein — deutlich reicher als
// das Suggest-JSON (brand, description, offers). Rein/testbar; kein Netz-I/O hier.
// ---------------------------------------------------------------------------

export type GlobusDetailData = {
  brand: string | null
  description: string | null
  priceCt: number | null
  availability: string | null // z.B. 'InStock'
  priceValidUntil: string | null // ISO-Datum
  seller: string | null
  // Pfand-Signal (G47): aus der description abgeleitet (EW/Einweg/DUE/Mehrweg/Pfand).
  // NUR ja/nein — der Betrag ist JS-gerendert (Stufe 2). null = kein Signal/keine description.
  hasDeposit: boolean | null
}

// Pfand-Marker in der Globus-description. Belegt (real, Test): 'EW'/'DUE'/'Einweg'.
// 'MW'/'Mehrwe'/'Pfand' additiv (plausibel, unbelegt — auch Mehrweg ist bepfandet).
const DEPOSIT_RE = /\b(EW|MW|DUE)\b|Einweg|Mehrweg|Pfand/i

/**
 * Parst die schema.org/Product-JSON-LD-Bloecke einer Globus-Detailseite und
 * fasst die interessanten Felder zusammen. Mehrere ld+json-Bloecke moeglich;
 * der erste @type Product (oder ein Array-Element davon) gewinnt. Defensiv:
 * kein Product-Block / Parse-Fehler → alle Felder null.
 */
export function parseGlobusDetailJsonLd(html: string | null | undefined): GlobusDetailData {
  const empty: GlobusDetailData = {
    brand: null, description: null, priceCt: null,
    availability: null, priceValidUntil: null, seller: null, hasDeposit: null,
  }
  if (typeof html !== 'string' || html.length === 0) return empty

  const re = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    let parsed: unknown
    try {
      parsed = JSON.parse(m[1].trim())
    } catch {
      continue
    }
    // Block kann Objekt oder Array sein; nach @type Product suchen.
    const candidates = Array.isArray(parsed) ? parsed : [parsed]
    for (const c of candidates) {
      if (!c || typeof c !== 'object') continue
      const obj = c as Record<string, unknown>
      if (obj['@type'] !== 'Product') continue

      const brand =
        typeof obj.brand === 'object' && obj.brand !== null
          ? (typeof (obj.brand as Record<string, unknown>).name === 'string'
              ? ((obj.brand as Record<string, unknown>).name as string)
              : null)
          : typeof obj.brand === 'string'
            ? obj.brand
            : null
      const description = typeof obj.description === 'string' ? obj.description : null

      // offers kann Objekt oder Array sein.
      const offersRaw = obj.offers
      const offer = Array.isArray(offersRaw) ? offersRaw[0] : offersRaw
      const off = (offer && typeof offer === 'object' ? offer : {}) as Record<string, unknown>
      const priceCt = parsePriceToCents(off.price as string | number | undefined)
      const availability =
        typeof off.availability === 'string' ? off.availability.split('/').pop() ?? null : null
      const priceValidUntil = typeof off.priceValidUntil === 'string' ? off.priceValidUntil : null
      const sellerObj = off.seller
      const seller =
        sellerObj && typeof sellerObj === 'object' && typeof (sellerObj as Record<string, unknown>).name === 'string'
          ? ((sellerObj as Record<string, unknown>).name as string)
          : null

      const hasDeposit = description != null ? DEPOSIT_RE.test(description) : null

      return { brand, description, priceCt, availability, priceValidUntil, seller, hasDeposit }
    }
  }
  return empty
}

// ---------------------------------------------------------------------------
// Feld-Landkarte (G44): dokumentiert je extrahiertem Feld Wert, Quelle und
// Zugehoerigkeit. Wird als globus_snapshots.extracted (jsonb) archiviert, damit
// nachvollziehbar ist, welcher Wert woher kam. Rein/testbar.
// ---------------------------------------------------------------------------

export type FieldMapEntry = {
  field: string
  value: string | null
  source: 'suggest-json' | 'suggest-html' | 'detail-jsonld'
  belongsTo: 'article' | 'price' | 'store'
}

/**
 * Baut die Feld-Landkarte aus dem Suggest-Treffer + (optional) den Detail-JSON-LD-Daten.
 * Nur Felder mit Wert werden aufgenommen (leere/null-Felder ausgelassen).
 */
export function buildFieldMap(
  hit: GlobusSuggestProduct,
  detail: GlobusDetailData | null,
): FieldMapEntry[] {
  const out: FieldMapEntry[] = []
  const push = (
    field: string,
    value: string | number | null | undefined,
    source: FieldMapEntry['source'],
    belongsTo: FieldMapEntry['belongsTo'],
  ) => {
    if (value === null || value === undefined || value === '') return
    out.push({ field, value: String(value), source, belongsTo })
  }

  // Suggest-JSON
  push('gtin', hit.ean, 'suggest-json', 'article')
  push('name', hit.name, 'suggest-json', 'article')
  push('category', hit.category.length ? hit.category.join(' › ') : null, 'suggest-json', 'article')
  push('price', hit.priceCt != null ? (hit.priceCt / 100).toFixed(2) + ' €' : null, 'suggest-json', 'price')
  push('currency', hit.currency, 'suggest-json', 'price')
  // Suggest-HTML
  push('image', hit.imageUrl, 'suggest-html', 'article')
  push('detailUrl', hit.detailUrl, 'suggest-html', 'article')
  if (hit.basePriceCt != null) {
    push('basePrice', (hit.basePriceCt / 100).toFixed(2) + ' € / ' + (hit.baseUnit ?? '?'), 'suggest-html', 'price')
  }
  // Detail-JSON-LD
  if (detail) {
    push('brand', detail.brand, 'detail-jsonld', 'article')
    push('description', detail.description, 'detail-jsonld', 'article')
    push('availability', detail.availability, 'detail-jsonld', 'price')
    push('priceValidUntil', detail.priceValidUntil, 'detail-jsonld', 'price')
    push('seller', detail.seller, 'detail-jsonld', 'store')
    push('has_deposit', detail.hasDeposit == null ? null : (detail.hasDeposit ? 'ja' : 'nein'), 'detail-jsonld', 'article')
  }
  return out
}


/**
 * Extrahiert alle Suggest-Treffer aus dem Globus-Suggest-HTML. Liest die
 * `data-etracker-search-suggest-product`-JSON-Objekte, dekodiert HTML-Entities,
 * parst sie einzeln (ein defekter Treffer verwirft nicht die uebrigen) und ordnet
 * je EAN die Bild-URL zu. Preislose Treffer bleiben erhalten (priceCt=null).
 * Defensiv: kein Input / keine Treffer → `[]`.
 */
export function parseGlobusSuggestJson(html: string | null | undefined): GlobusSuggestProduct[] {
  if (typeof html !== 'string' || html.length === 0) return []
  const imgByEan = extractImageUrlsByEan(html)
  const detailByEan = extractDetailUrlsByEan(html)
  const results: GlobusSuggestProduct[] = []
  // Attributwert steht in einfachen ODER doppelten Quotes.
  const re = new RegExp(`${SUGGEST_ATTR}=(?:'([^']*)'|"([^"]*)")`, 'g')
  // Erst alle Treffer-Positionen sammeln, um je Treffer das HTML-Segment bis zum
  // NAECHSTEN Treffer abzugrenzen. Der reference-price (Grundpreis) steht im selben
  // <li>, aber teils weit hinter dem Attribut (grosses Bild-srcset dazwischen) —
  // ein fixes Fenster wuerde ihn verpassen (G44-Bug). Segment-Grenze ist zuverlaessig.
  const matches: RegExpExecArray[] = []
  let mm: RegExpExecArray | null
  while ((mm = re.exec(html)) !== null) matches.push(mm)

  for (let idx = 0; idx < matches.length; idx++) {
    const m = matches[idx]
    const raw = m[1] ?? m[2] ?? ''
    if (!raw) continue
    try {
      const decoded = decodeEntities(raw)
      const obj = JSON.parse(decoded) as {
        id?: unknown
        name?: unknown
        price?: unknown
        category?: unknown
        currency?: unknown
      }
      const ean = typeof obj.id === 'string' ? obj.id.trim() : ''
      if (ean === '') continue
      const name = typeof obj.name === 'string' ? decodeEntities(obj.name).trim() : ''
      const priceCt = parsePriceToCents(obj.price as string | number | undefined)
      const category = Array.isArray(obj.category)
        ? obj.category.filter((c): c is string => typeof c === 'string').map((c) => decodeEntities(c))
        : []
      const currency = typeof obj.currency === 'string' ? obj.currency : null
      // Grundpreis (G44): reference-price im Segment dieses Treffers (bis zum naechsten
      // etracker-Attribut, sonst bis Stringende) — nicht in einem fixen Byte-Fenster.
      const segEnd = idx + 1 < matches.length ? matches[idx + 1].index : html.length
      const segment = html.slice(m.index, segEnd)
      const ref = parseGlobusReferencePrice(segment)
      results.push({
        ean,
        name,
        priceCt: priceCt !== null && priceCt > 0 ? priceCt : null,
        category,
        currency,
        imageUrl: imgByEan.get(ean) ?? null,
        basePriceCt: ref?.basePriceCt ?? null,
        baseUnit: ref?.baseUnit ?? null,
        detailUrl: detailByEan.get(ean) ?? null,
        raw: obj,
      })
    } catch {
      // defekter Treffer → ueberspringen
    }
  }
  return results
}

/**
 * Waehlt aus den Suggest-Treffern den mit exakt passender EAN. Kein Match → null
 * (kein „falscher Artikel"). GTIN wird getrimmt verglichen.
 */
export function matchSuggestByEan(
  products: GlobusSuggestProduct[],
  gtin: string | null | undefined,
): GlobusSuggestProduct | null {
  const g = typeof gtin === 'string' ? gtin.trim() : ''
  if (g === '') return null
  return products.find((p) => p.ean === g) ?? null
}
