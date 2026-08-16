import { describe, it, expect } from 'vitest'
import {
  applyEanToUrl,
  applyQueryToUrl,
  parsePriceToCents,
  parseGlobusSuggestJson,
  extractImageUrlsByEan,
  matchSuggestByEan,
  parseGlobusReferencePrice,
  parseGlobusDetailJsonLd,
  normalizeBaseUnit,
  extractDetailUrlsByEan,
  buildFieldMap,
} from './globus-price'

// Echter Ausschnitt aus dem Globus-Suggest-HTML (verifiziert 2026-07-19,
// /hockenheim/suggest?search=4306188415978). HTML-Entities wie im Original.
const REAL_SUGGEST_HTML = `
<div class="search-suggest js-search-result">
  <div class="search-suggest suggest-products">
    <li class="search-suggest-product js-result">
      <input type="hidden" data-etracker-search-suggest-product='{"id":"4306188415978","name":"Mineralwasser, Classic","category":["Men&uuml;","Getr&auml;nke","Wasser","Mineralwasser"],"price":"0.29","currency":"EUR"}'>
      <a href="https://produkte.globus.de/hockenheim/getraenke/wasser/mineralwasser/4306188415978/mineralwasser-classic" class="search-suggest-product-link">
      <img src="https://produkte.globus.de/media/29/77/06/1774332551/4306188415978_f33fc833.jpg?1774332551">
      <div class="col search-suggest-product-name">Mineralwasser, Classic</div>
      <span class="search-suggest-product-price">0,29&nbsp;&euro;</span>
      <br><small class="search-suggest-product-reference-price">(0,19 &euro; / 1&nbsp;l)</small>
      </a>
    </li>
    <li class="search-suggest-product js-result">
      <input type="hidden" data-etracker-search-suggest-product='{"id":"5449000017987","name":"Cola, koffein- &amp; zuckerfrei (12x 1,000 Liter)","price":"15.99","currency":"EUR"}'>
    </li>
  </div>
</div>`

// Echtes Detailseiten-JSON-LD (verifiziert 2026-07-25, gekuerzt auf den Product-Block).
const REAL_DETAIL_HTML = `
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"LocalBusiness","name":"Hockenheim"}
</script>
<script type="application/ld+json">
[{"@context":"https://schema.org/","@type":"Product","name":"Mineralwasser, Classic","description":"Jeden Tag Mineralwasser Classic 1,5L PET EW DUE","sku":"4306188415978","brand":{"@type":"Brand","name":"Jeden Tag"},"image":["https://produkte.globus.de/media/x.jpg"],"offers":[{"@type":"Offer","availability":"https://schema.org/InStock","priceCurrency":"EUR","priceValidUntil":"2026-07-25","seller":{"@type":"Organization","name":"GLOBUS Markthallen"},"price":0.29}]},{"@context":"https://schema.org","@type":"Organization"}]
</script>`

describe('applyEanToUrl', () => {
  it('ersetzt {EAN} durch die GTIN', () => {
    expect(applyEanToUrl('https://produkte.globus.de/hockenheim/suggest?search={EAN}', '4306188415978')).toBe(
      'https://produkte.globus.de/hockenheim/suggest?search=4306188415978',
    )
  })
  it('liefert null bei Vorlage ohne {EAN}-Platzhalter (kann keinen Artikel adressieren)', () => {
    expect(applyEanToUrl('https://x.de/p/abc', '123')).toBeNull()
  })
  it('liefert null bei {EAN} ohne GTIN oder leerer Vorlage', () => {
    expect(applyEanToUrl('https://x.de/{EAN}', '')).toBeNull()
    expect(applyEanToUrl('', '123')).toBeNull()
    expect(applyEanToUrl(null, '123')).toBeNull()
  })
})

describe('applyQueryToUrl', () => {
  it('ersetzt {EAN} durch den (encodeten) Suchbegriff', () => {
    expect(applyQueryToUrl('https://produkte.globus.de/hockenheim/suggest?search={EAN}', 'mineralwasser classic')).toBe(
      'https://produkte.globus.de/hockenheim/suggest?search=mineralwasser%20classic',
    )
  })
  it('liefert null bei leerer Vorlage/Query', () => {
    expect(applyQueryToUrl('https://x.de/{EAN}', '')).toBeNull()
    expect(applyQueryToUrl('', 'cola')).toBeNull()
    expect(applyQueryToUrl(null, 'cola')).toBeNull()
  })
})

describe('parsePriceToCents', () => {
  it('parst Globus-Preis-Strings (Punkt-Dezimal)', () => {
    expect(parsePriceToCents('0.29')).toBe(29)
    expect(parsePriceToCents('15.99')).toBe(1599)
    expect(parsePriceToCents('2')).toBe(200)
  })
  it('toleriert Komma-Dezimal', () => {
    expect(parsePriceToCents('1,19')).toBe(119)
  })
  it('akzeptiert Zahlen', () => {
    expect(parsePriceToCents(0.29)).toBe(29)
  })
  it('liefert null bei Muell/leer/negativ', () => {
    expect(parsePriceToCents('abc')).toBeNull()
    expect(parsePriceToCents('')).toBeNull()
    expect(parsePriceToCents(null)).toBeNull()
    expect(parsePriceToCents('-1')).toBeNull()
  })
})

describe('extractImageUrlsByEan', () => {
  it('ordnet Bild-URL der EAN im Dateinamen zu', () => {
    const m = extractImageUrlsByEan(REAL_SUGGEST_HTML)
    expect(m.get('4306188415978')).toContain('4306188415978_f33fc833.jpg')
  })
  it('leere Map ohne Bilder/Input', () => {
    expect(extractImageUrlsByEan('').size).toBe(0)
    expect(extractImageUrlsByEan(null).size).toBe(0)
  })
})

describe('parseGlobusSuggestJson', () => {
  it('extrahiert Treffer inkl. category/currency/imageUrl/raw', () => {
    const r = parseGlobusSuggestJson(REAL_SUGGEST_HTML)
    expect(r).toHaveLength(2)
    expect(r[0]).toMatchObject({
      ean: '4306188415978',
      name: 'Mineralwasser, Classic',
      priceCt: 29,
      category: ['Menü', 'Getränke', 'Wasser', 'Mineralwasser'],
      currency: 'EUR',
    })
    expect(r[0].imageUrl).toContain('4306188415978_f33fc833.jpg')
    expect(r[0].raw).toBeTruthy()
    expect(r[1].ean).toBe('5449000017987')
    expect(r[1].priceCt).toBe(1599)
    expect(r[1].imageUrl).toBeNull() // kein <img> fuer diesen Treffer
  })
  it('dekodiert HTML-Entities im Namen', () => {
    const r = parseGlobusSuggestJson(REAL_SUGGEST_HTML)
    expect(r[1].name).toContain('&') // „Cola, koffein- & zuckerfrei …"
    expect(r[1].name).not.toContain('&amp;')
  })
  it('liefert [] bei „Keine Suchergebnisse" / leerem HTML', () => {
    expect(parseGlobusSuggestJson('<li class="search-suggest-no-result">Keine Suchergebnisse gefunden.</li>')).toEqual([])
    expect(parseGlobusSuggestJson('')).toEqual([])
    expect(parseGlobusSuggestJson(null)).toEqual([])
  })
  it('ueberspringt defekte JSON-Treffer, behaelt gueltige', () => {
    const html = `
      <input data-etracker-search-suggest-product='{kaputt'>
      <input data-etracker-search-suggest-product='{"id":"111","name":"Gut","price":"1.00"}'>`
    const r = parseGlobusSuggestJson(html)
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ ean: '111', name: 'Gut', priceCt: 100 })
  })
  it('behaelt preislose Treffer mit priceCt=null (fuer Snapshot), verwirft nur fehlende EAN', () => {
    const html = `
      <input data-etracker-search-suggest-product='{"name":"kein id","price":"1.00"}'>
      <input data-etracker-search-suggest-product='{"id":"222","name":"Ohne Preis","price":"0"}'>`
    const r = parseGlobusSuggestJson(html)
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ ean: '222', priceCt: null })
  })
})

describe('matchSuggestByEan', () => {
  const products = parseGlobusSuggestJson(REAL_SUGGEST_HTML)
  it('findet den exakten EAN-Treffer', () => {
    expect(matchSuggestByEan(products, '4306188415978')?.priceCt).toBe(29)
  })
  it('liefert null bei fehlendem Match (kein falscher Artikel)', () => {
    expect(matchSuggestByEan(products, '0000000000000')).toBeNull()
    expect(matchSuggestByEan(products, '')).toBeNull()
    expect(matchSuggestByEan(products, null)).toBeNull()
    expect(matchSuggestByEan([], '4306188415978')).toBeNull()
  })
})

// ── G44: Grundpreis + Detail-URL + JSON-LD ──────────────────────────────────

describe('normalizeBaseUnit', () => {
  it('normalisiert gaengige Einheiten', () => {
    expect(normalizeBaseUnit('1 l')).toBe('l')
    expect(normalizeBaseUnit('1&nbsp;l')).toBe('l')
    expect(normalizeBaseUnit('1 Liter')).toBe('l')
    expect(normalizeBaseUnit('1 kg')).toBe('kg')
    expect(normalizeBaseUnit('100 g')).toBe('100g')
    expect(normalizeBaseUnit('1 Stück')).toBe('Stück')
  })
  it('faellt auf Rohtext zurueck bei Unbekanntem', () => {
    expect(normalizeBaseUnit('1 Rolle')).toBe('1 Rolle')
  })
})

describe('parseGlobusReferencePrice', () => {
  it('parst „(0,19 € / 1 l)" aus dem reference-price-Element', () => {
    const r = parseGlobusReferencePrice('<small class="search-suggest-product-reference-price">(0,19 &euro; / 1&nbsp;l)</small>')
    expect(r).toEqual({ basePriceCt: 19, baseUnit: 'l' })
  })
  it('parst kg / 100g', () => {
    expect(parseGlobusReferencePrice('reference-price">(1,49 € / 1 kg)</small>')).toEqual({ basePriceCt: 149, baseUnit: 'kg' })
    expect(parseGlobusReferencePrice('reference-price">(0,89 € / 100 g)</small>')).toEqual({ basePriceCt: 89, baseUnit: '100g' })
  })
  it('liefert null ohne reference-price / unparsbar', () => {
    expect(parseGlobusReferencePrice('<span>0,29 €</span>')).toBeNull()
    expect(parseGlobusReferencePrice('')).toBeNull()
    expect(parseGlobusReferencePrice(null)).toBeNull()
  })
})

describe('extractDetailUrlsByEan', () => {
  it('ordnet die Detail-URL der EAN zu', () => {
    const map = extractDetailUrlsByEan(REAL_SUGGEST_HTML)
    expect(map.get('4306188415978')).toContain('/4306188415978/mineralwasser-classic')
  })
})

describe('parseGlobusSuggestJson — G44-Felder', () => {
  it('reichert Treffer um basePrice + baseUnit + detailUrl an', () => {
    const r = parseGlobusSuggestJson(REAL_SUGGEST_HTML)
    const w = r.find((p) => p.ean === '4306188415978')
    expect(w?.basePriceCt).toBe(19)
    expect(w?.baseUnit).toBe('l')
    expect(w?.detailUrl).toContain('/4306188415978/')
  })
  it('Treffer ohne reference-price → basePrice null', () => {
    const r = parseGlobusSuggestJson(REAL_SUGGEST_HTML)
    const cola = r.find((p) => p.ean === '5449000017987')
    expect(cola?.basePriceCt).toBeNull()
    expect(cola?.baseUnit).toBeNull()
  })
  it('findet den reference-price auch bei GROSSEM Abstand zum Attribut (G44-Bug: srcset dazwischen)', () => {
    // Der echte Globus-Treffer hat ~2900 Zeichen (Bild-srcset) zwischen etracker-Attribut
    // und reference-price. Ein fixes 2000er-Fenster verpasste ihn. Hier: 3000 Fuellzeichen.
    const filler = ' '.repeat(3000)
    const html = `
      <li class="search-suggest-product js-result">
        <input data-etracker-search-suggest-product='{"id":"111","name":"Gross","price":"1.00"}'>
        <a href="https://x.de/p/111/gross" class="search-suggest-product-link">img</a>${filler}
        <small class="search-suggest-product-reference-price">(0,50 &euro; / 1&nbsp;l)</small>
      </li>`
    const r = parseGlobusSuggestJson(html)
    expect(r[0].basePriceCt).toBe(50)
    expect(r[0].baseUnit).toBe('l')
  })
  it('ordnet den reference-price dem RICHTIGEN Treffer zu (nicht dem naechsten)', () => {
    const html = `
      <li><input data-etracker-search-suggest-product='{"id":"aaa","name":"A","price":"1.00"}'>
      <small class="search-suggest-product-reference-price">(0,10 € / 1 l)</small></li>
      <li><input data-etracker-search-suggest-product='{"id":"bbb","name":"B","price":"2.00"}'>
      <small class="search-suggest-product-reference-price">(0,20 € / 1 kg)</small></li>`
    const r = parseGlobusSuggestJson(html)
    expect(r.find((p) => p.ean === 'aaa')?.basePriceCt).toBe(10)
    expect(r.find((p) => p.ean === 'aaa')?.baseUnit).toBe('l')
    expect(r.find((p) => p.ean === 'bbb')?.basePriceCt).toBe(20)
    expect(r.find((p) => p.ean === 'bbb')?.baseUnit).toBe('kg')
  })
})

describe('parseGlobusDetailJsonLd', () => {
  it('extrahiert brand/description/offers aus dem Product-JSON-LD', () => {
    const d = parseGlobusDetailJsonLd(REAL_DETAIL_HTML)
    expect(d.brand).toBe('Jeden Tag')
    expect(d.description).toContain('1,5L PET EW DUE')
    expect(d.priceCt).toBe(29)
    expect(d.availability).toBe('InStock')
    expect(d.priceValidUntil).toBe('2026-07-25')
    expect(d.seller).toBe('GLOBUS Markthallen')
    // Pfand-Signal (G47): "PET EW DUE" → Einweg → hasDeposit true.
    expect(d.hasDeposit).toBe(true)
  })
  it('ignoriert Nicht-Product-Bloecke, liefert bei fehlendem Product alles null', () => {
    const d = parseGlobusDetailJsonLd('<script type="application/ld+json">{"@type":"LocalBusiness","name":"x"}</script>')
    expect(d).toEqual({ brand: null, description: null, priceCt: null, availability: null, priceValidUntil: null, seller: null, hasDeposit: null })
  })
  it('robust bei kaputtem JSON / leerem Input', () => {
    expect(parseGlobusDetailJsonLd('<script type="application/ld+json">{kaputt</script>').brand).toBeNull()
    expect(parseGlobusDetailJsonLd('').brand).toBeNull()
    expect(parseGlobusDetailJsonLd(null).brand).toBeNull()
  })
})

describe('buildFieldMap', () => {
  it('erfasst Felder aus Suggest + Detail mit Quelle und Zugehoerigkeit', () => {
    const hit = parseGlobusSuggestJson(REAL_SUGGEST_HTML).find((p) => p.ean === '4306188415978')!
    const detail = parseGlobusDetailJsonLd(REAL_DETAIL_HTML)
    const map = buildFieldMap(hit, detail)
    const by = (f: string) => map.find((e) => e.field === f)
    expect(by('gtin')).toMatchObject({ source: 'suggest-json', belongsTo: 'article' })
    expect(by('basePrice')).toMatchObject({ source: 'suggest-html', belongsTo: 'price' })
    expect(by('basePrice')?.value).toContain('0.19 € / l')
    expect(by('brand')).toMatchObject({ value: 'Jeden Tag', source: 'detail-jsonld', belongsTo: 'article' })
    expect(by('seller')).toMatchObject({ belongsTo: 'store' })
    // leere Felder werden ausgelassen
    expect(map.every((e) => e.value !== null && e.value !== '')).toBe(true)
  })
  it('funktioniert ohne Detail-Daten (nur Suggest)', () => {
    const hit = parseGlobusSuggestJson(REAL_SUGGEST_HTML).find((p) => p.ean === '4306188415978')!
    const map = buildFieldMap(hit, null)
    expect(map.find((e) => e.field === 'brand')).toBeUndefined()
    expect(map.find((e) => e.field === 'gtin')).toBeDefined()
  })
})
