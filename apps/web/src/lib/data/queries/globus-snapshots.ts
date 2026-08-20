import { getDb } from '$data/db'
import { globusSnapshots, products, categories, inventoryItems, productStores } from '$data/schema'
import { and, eq, desc } from 'drizzle-orm'
import { snapshotDiffers, type SnapshotComparable } from '$lib/utils/snapshot-diff'
import { computeMirrorDiff, type MirrorDiff } from '$lib/utils/mirror-diff'
import { updateProduct, createProduct, suggestStockUnitForProduct, setFieldSources, getFieldSources, type ProductField } from '$data/queries/products'
import { recordProposedPrice } from '$data/queries/prices'
import { resolveMappedCategory } from '$data/queries/category-mapping'

export { snapshotDiffers }

// ---------------------------------------------------------------------------
// Globus-Katalog-Snapshots (Block G7) — Roh-Landing-Zone + Historie + Approval.
//
// Beim Katalog-Sync landet je EAN das komplette verifizierte Suggest-JSON als
// 'proposed'. Nur wenn sich etwas gegenueber dem letzten Snapshot geaendert hat,
// entsteht ein neuer Vorschlag (der alte offene wird superseded). Bestaetigen/
// Verwerfen setzt status auf 'confirmed'/'rejected' (Historie bleibt).
// ---------------------------------------------------------------------------

export interface SnapshotInput {
  householdId: string
  productId?: string | null
  storeId?: string | null
  gtin: string
  name: string | null
  category: string[]
  priceCt: number | null
  currency: string | null
  imageRemoteUrl: string | null
  localImagePath?: string | null
  rawJson: unknown
  // G44: Roh-Archiv des Detailseiten-HTML + strukturierte Feld-Landkarte des Abrufs.
  rawDetailHtml?: string | null
  extracted?: unknown
  createdBy?: string | null
}

/**
 * Legt einen Snapshot als 'proposed' an — aber nur, wenn er sich vom letzten
 * bekannten Stand (proposed ODER confirmed) derselben EAN unterscheidet. Ein
 * offener 'proposed' desselben Tripels wird zuvor superseded ('rejected').
 * Return: { changed:true, row } bei neuem Vorschlag, sonst { changed:false }.
 */
export async function recordSnapshot(
  input: SnapshotInput
): Promise<{ changed: boolean; row?: typeof globusSnapshots.$inferSelect }> {
  const db = getDb()
  return db.transaction(async (tx) => {
    // Letzten Stand (egal welcher Status) dieser EAN heranziehen.
    const last = await tx.query.globusSnapshots.findFirst({
      where: (s, { and, eq }) => and(eq(s.gtin, input.gtin), eq(s.householdId, input.householdId)),
      orderBy: [desc(globusSnapshots.fetchedAt)],
    })

    const incoming: SnapshotComparable = {
      name: input.name,
      category: input.category,
      priceCt: input.priceCt,
      currency: input.currency,
      imageRemoteUrl: input.imageRemoteUrl,
    }

    if (last && !snapshotDiffers(incoming, last)) {
      // Nichts Diff-relevantes geaendert -> Zeitstempel auffrischen. G44: die reicheren
      // Felder (Detail-HTML + Feld-Landkarte) trotzdem NACHTRAGEN, wenn sie neu vorliegen
      // — sonst bekaeme ein bereits gesicherter Artikel nie eine extracted-Landkarte.
      await tx
        .update(globusSnapshots)
        .set({
          fetchedAt: new Date(),
          localImagePath: input.localImagePath ?? last.localImagePath,
          rawDetailHtml: input.rawDetailHtml ?? last.rawDetailHtml,
          extracted: input.extracted ?? last.extracted,
        })
        .where(eq(globusSnapshots.id, last.id))
      return { changed: false }
    }

    // Offenen Vorschlag derselben EAN superseden (haelt den Partial-Unique frei).
    await tx
      .update(globusSnapshots)
      .set({ status: 'rejected', reviewedAt: new Date() })
      .where(
        and(
          eq(globusSnapshots.gtin, input.gtin),
          eq(globusSnapshots.householdId, input.householdId),
          eq(globusSnapshots.status, 'proposed')
        )
      )

    const [row] = await tx
      .insert(globusSnapshots)
      .values({
        householdId: input.householdId,
        productId: input.productId ?? null,
        storeId: input.storeId ?? null,
        gtin: input.gtin,
        name: input.name,
        category: input.category,
        priceCt: input.priceCt,
        currency: input.currency,
        imageRemoteUrl: input.imageRemoteUrl,
        localImagePath: input.localImagePath ?? null,
        rawJson: input.rawJson,
        rawDetailHtml: input.rawDetailHtml ?? null,
        extracted: input.extracted ?? null,
        status: 'proposed',
        source: 'globus',
        createdBy: input.createdBy ?? null,
      })
      .returning()
    return { changed: true, row }
  })
}

/** Offene Snapshot-Vorschlaege des Haushalts (mit product/store), neueste zuerst. */
export async function listProposedSnapshots(householdId: string) {
  const db = getDb()
  return db.query.globusSnapshots.findMany({
    where: (s, { and, eq }) => and(eq(s.householdId, householdId), eq(s.status, 'proposed')),
    with: {
      product: { columns: { id: true, name: true } },
      store: { columns: { id: true, name: true } },
    },
    orderBy: [desc(globusSnapshots.fetchedAt)],
  })
}

/** Offene Snapshot-Vorschlaege eines Artikels (Detailseite). */
export async function listProposedSnapshotsForProduct(productId: string, householdId: string) {
  const db = getDb()
  return db.query.globusSnapshots.findMany({
    where: (s, { and, eq }) =>
      and(eq(s.productId, productId), eq(s.householdId, householdId), eq(s.status, 'proposed')),
    orderBy: [desc(globusSnapshots.fetchedAt)],
  })
}

// ---------------------------------------------------------------------------
// Katalog-Spiegel (G10): je Bestands-Artikel-mit-EAN der neueste Globus-Snapshot
// derselben EAN + Feld-Diff (Artikel vs. Katalog). IMMER sichtbar, unabhaengig
// vom Snapshot-Status — der Abgleich bleibt so lange bestehen, bis die Felder
// uebereinstimmen. Ersetzt die alte „nur offene Vorschlaege"-Liste, die leer
// blieb, sobald ein Snapshot einmal confirmed/rejected war.
// ---------------------------------------------------------------------------

export type CatalogMirrorRow = {
  product: {
    id: string
    name: string
    gtin: string
    imageUrl: string | null
    categoryId: string | null
    categoryName: string | null
    brand: string | null
    description: string | null
    hasDeposit: boolean
    // Herkunft der gespeicherten Kategorie (G34) — fuer den "Herkunft zuruecksetzen"-
    // Button im Spiegel. null = nicht erfasst.
    categorySource: 'off' | 'globus' | 'manual' | null
  }
  snapshot: {
    id: string
    name: string | null
    category: string[] | null
    priceCt: number | null
    currency: string | null
    storeId: string | null
    localImagePath: string | null
    catalogCategoryId: string | null
    // Reichere Felder aus dem JSON-LD (G45/G47), fuer die uebernehmbaren Diff-Zeilen.
    brand: string | null
    description: string | null
    hasDeposit: boolean | null
    // Feld-Landkarte des Abrufs (G44): { field, value, source, belongsTo }[] — dokumentiert,
    // welcher Wert woher kam. null bei Alt-Snapshots ohne Anreicherung.
    extracted: unknown
    fetchedAt: Date
  } | null
  diff: MirrorDiff
}

/**
 * Liefert je im Haushalt verwendeten Artikel-mit-EAN (Bestand ODER Markt-
 * Zuordnung) den neuesten Katalog-Snapshot derselben EAN + Feld-Diff. Sortiert:
 * abweichende zuerst. Preis bleibt aussen vor (F2-Flow).
 */
export async function listCatalogMirror(householdId: string): Promise<CatalogMirrorRow[]> {
  const db = getDb()
  // Artikel-IDs, die im Haushalt verwendet werden (Bestand oder Markt-Zuordnung).
  const invRows = await db
    .selectDistinct({ productId: inventoryItems.productId })
    .from(inventoryItems)
    .where(eq(inventoryItems.householdId, householdId))
  const psRows = await db
    .selectDistinct({ productId: productStores.productId })
    .from(productStores)
    .where(eq(productStores.householdId, householdId))
  const productIds = [...new Set([...invRows, ...psRows].map((r) => r.productId))]
  if (productIds.length === 0) return []

  // Nur Artikel mit EAN.
  const prods = await db.query.products.findMany({
    where: (p, { and, inArray, isNotNull }) =>
      and(inArray(p.id, productIds), isNotNull(p.gtin)),
    columns: { id: true, name: true, gtin: true, imageUrl: true, categoryId: true, brand: true, description: true, hasDeposit: true },
    with: { category: { columns: { name: true } } },
  })
  if (prods.length === 0) return []

  // Neuesten Snapshot je EAN dieses Haushalts holen (ein Query, dann in JS je EAN
  // den neuesten behalten).
  const gtins = prods.map((p) => p.gtin!).filter(Boolean)
  const snaps = await db.query.globusSnapshots.findMany({
    where: (s, { and, eq, inArray }) =>
      and(eq(s.householdId, householdId), inArray(s.gtin, gtins)),
    orderBy: [desc(globusSnapshots.fetchedAt)],
  })
  const latestByGtin = new Map<string, (typeof snaps)[number]>()
  for (const s of snaps) {
    if (!latestByGtin.has(s.gtin)) latestByGtin.set(s.gtin, s) // erster = neuester (orderBy)
  }

  // Kategorie-Herkunft aller Artikel in EINEM Query laden (kein N+1, G34).
  const catSrcRows = await db.query.productFieldSources.findMany({
    where: (fs, { and, eq, inArray }) => and(inArray(fs.productId, productIds), eq(fs.field, 'category')),
    columns: { productId: true, source: true },
  })
  const catSourceByProduct = new Map(catSrcRows.map((r) => [r.productId, r.source]))

  const rows: CatalogMirrorRow[] = []
  for (const p of prods) {
    const snap = latestByGtin.get(p.gtin!) ?? null
    // Katalog-Kategorie best-effort auf stoqr-categoryId mappen (fuer den Diff).
    const catalogCategoryId = snap ? await matchCategoryId(snap.category, householdId) : null
    // Reichere Felder (G45): brand/description aus snap.extracted (Feld-Landkarte) lesen.
    const extractedVal = (field: string): string | null => {
      const arr = snap?.extracted as { field?: string; value?: string | null }[] | null | undefined
      if (!Array.isArray(arr)) return null
      const v = arr.find((x) => x?.field === field)?.value
      return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
    }
    const snapBrand = extractedVal('brand')
    const snapDescription = extractedVal('description')
    // Pfandpflicht-Signal (G47): extracted trägt 'ja'/'nein' (oder fehlt).
    const depRaw = extractedVal('has_deposit')
    const snapHasDeposit = depRaw == null ? null : depRaw.toLowerCase() === 'ja'
    const diff = computeMirrorDiff(
      { name: p.name, imageUrl: p.imageUrl, categoryId: p.categoryId, brand: p.brand, description: p.description, hasDeposit: p.hasDeposit },
      snap
        ? { name: snap.name, localImagePath: snap.localImagePath, categoryId: catalogCategoryId, brand: snapBrand, description: snapDescription, hasDeposit: snapHasDeposit }
        : null
    )
    rows.push({
      product: {
        id: p.id,
        name: p.name,
        gtin: p.gtin!,
        imageUrl: p.imageUrl,
        categoryId: p.categoryId,
        categoryName: p.category?.name ?? null,
        brand: p.brand ?? null,
        description: p.description ?? null,
        hasDeposit: p.hasDeposit ?? false,
        categorySource: (catSourceByProduct.get(p.id) ?? null) as 'off' | 'globus' | 'manual' | null,
      },
      snapshot: snap
        ? {
            id: snap.id,
            name: snap.name,
            category: snap.category,
            priceCt: snap.priceCt,
            currency: snap.currency,
            storeId: snap.storeId,
            localImagePath: snap.localImagePath,
            catalogCategoryId,
            brand: snapBrand,
            description: snapDescription,
            hasDeposit: snapHasDeposit,
            extracted: snap.extracted ?? null,
            fetchedAt: snap.fetchedAt,
          }
        : null,
      diff,
    })
  }

  // Abweichende zuerst, dann alphabetisch nach Artikelname.
  rows.sort((a, b) => {
    if (a.diff.any !== b.diff.any) return a.diff.any ? -1 : 1
    return a.product.name.localeCompare(b.product.name, 'de')
  })
  return rows
}

/**
 * Durchsucht den lokalen Katalog (globus_snapshots) nach Name oder EAN. Liefert je
 * EAN den neuesten Eintrag (dedupe), unabhaengig vom Status (auch confirmed/rejected
 * sind gueltige Katalog-Daten). Fuer die On-demand-Suche beim Artikel-Anlegen (G8-4).
 */
export async function searchCatalogSnapshots(householdId: string, q: string, limit = 20) {
  const db = getDb()
  const term = q.trim()
  if (term === '') return []
  const rows = await db.query.globusSnapshots.findMany({
    where: (s, { and, eq, or, ilike }) =>
      and(eq(s.householdId, householdId), or(ilike(s.name, `%${term}%`), eq(s.gtin, term))),
    orderBy: [desc(globusSnapshots.fetchedAt)],
    limit: 200,
    columns: { id: true, gtin: true, name: true, category: true, priceCt: true, localImagePath: true },
  })
  // Dedupe je EAN (neuester zuerst durch orderBy), auf limit kuerzen.
  const seen = new Set<string>()
  const out: typeof rows = []
  for (const r of rows) {
    if (seen.has(r.gtin)) continue
    seen.add(r.gtin)
    out.push(r)
    if (out.length >= limit) break
  }
  return out
}

export async function getSnapshotCounts(householdId: string) {
  const db = getDb()
  const proposed = await db.query.globusSnapshots.findMany({
    where: (s, { and, eq }) => and(eq(s.householdId, householdId), eq(s.status, 'proposed')),
    columns: { id: true },
  })
  return { proposed: proposed.length }
}

/**
 * Uebernimmt gewaehlte Katalog-Felder eines Snapshots in den passenden Artikel
 * (G10: EAN-Spiegel). Status-agnostisch — der Snapshot muss NICHT 'proposed'
 * sein (der Spiegel zeigt auch confirmed/rejected). Der Artikel wird ueber
 * snap.productId ODER — falls null (easy-add-Snapshots) — ueber die EAN im
 * Haushalt aufgeloest. fields: welche Felder uebernommen werden (angekreuzt).
 * image nutzt den lokalen /media-Pfad. Angekreuzte Felder ueberschreiben; nicht
 * angekreuzte fuellen nur leere Artikelfelder. Kategorie best-effort per Name.
 * Setzt den Snapshot danach auf 'confirmed'. Return: { ok, reason? }.
 */
export async function applySnapshotToProduct(
  id: string,
  householdId: string,
  fields: { image?: boolean; name?: boolean; category?: boolean; price?: boolean; brand?: boolean; description?: boolean; hasDeposit?: boolean },
  reviewedBy?: string | null,
  // G20-2: explizit im Katalog-Spiegel manuell gewaehlte Ziel-Kategorie. Wenn
  // gesetzt (und fields.category), gewinnt sie ueber das Best-Effort-matchCategoryId
  // und wird mit Herkunft 'manual' geschrieben (schuetzt vor spaeterem Auto-Sync).
  manualCategoryId?: string | null
): Promise<{ ok: boolean; reason?: string }> {
  const db = getDb()
  const snap = await db.query.globusSnapshots.findFirst({
    where: (s, { and, eq }) => and(eq(s.id, id), eq(s.householdId, householdId)),
  })
  if (!snap) return { ok: false, reason: 'not-found' }

  // Reichere Felder (G45): brand/description stehen NICHT als flache Spalten am
  // Snapshot, sondern in extracted (Feld-Landkarte, belongsTo='article'). Von dort lesen.
  const extractedVal = (field: string): string | null => {
    const arr = snap.extracted as { field?: string; value?: string | null }[] | null
    if (!Array.isArray(arr)) return null
    const e = arr.find((x) => x?.field === field)
    const v = e?.value
    return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
  }

  // Artikel aufloesen: bevorzugt ueber die Verknuepfung, sonst ueber die EAN
  // (verwendet im Haushalt). So funktioniert die Uebernahme auch fuer Snapshots
  // ohne productId.
  let product = snap.productId
    ? await db.query.products.findFirst({
        where: eq(products.id, snap.productId),
        columns: { id: true, name: true, imageUrl: true, categoryId: true, defaultUnit: true, brand: true, description: true, hasDeposit: true },
      })
    : undefined
  if (!product && snap.gtin) {
    product = await db.query.products.findFirst({
      where: eq(products.gtin, snap.gtin),
      columns: { id: true, name: true, imageUrl: true, categoryId: true, defaultUnit: true, brand: true, description: true, hasDeposit: true },
    })
  }
  if (!product) return { ok: false, reason: 'no-product' }

  const patch: { name?: string; imageUrl?: string | null; categoryId?: string | null; brand?: string; description?: string; hasDeposit?: boolean } = {}
  // Herkunft der Kategorie: 'globus' beim Auto-Match, 'manual' bei expliziter Wahl (G20-2).
  let categorySource: 'globus' | 'manual' | null = null

  // Bild: lokaler /media-Pfad; angekreuzt -> immer setzen, sonst nur wenn leer.
  if (snap.localImagePath) {
    const localUrl = `/media/${snap.localImagePath}`
    if (fields.image || !product.imageUrl) patch.imageUrl = localUrl
  }
  // Name: angekreuzt -> setzen; ohne Ankreuzen nur wenn Artikelname leer.
  if (snap.name && snap.name.trim() !== '' && (fields.name || !product.name?.trim())) {
    patch.name = snap.name.trim()
  }
  // Marke / Beschreibung (G45): aus extracted (JSON-LD). Regel wie Name — angekreuzt
  // ODER Feld leer. Schuetzt manuell gepflegte Werte (Herkunft 'manual' via setFieldSources).
  const snapBrand = extractedVal('brand')
  if (snapBrand && (fields.brand || !product.brand?.trim())) {
    // manual-Schutz: bereits manuell gesetzte Marke nur bei explizitem Ankreuzen ueberschreiben.
    const srcs = await getFieldSources(product.id)
    if (fields.brand || srcs.brand !== 'manual') patch.brand = snapBrand
  }
  const snapDescription = extractedVal('description')
  if (snapDescription && (fields.description || !product.description?.trim())) {
    const srcs = await getFieldSources(product.id)
    if (fields.description || srcs.description !== 'manual') patch.description = snapDescription
  }
  // Pfandpflicht (G47): nur ja/nein aus dem JSON-LD; Betrag bleibt manuell. Regel wie
  // oben — angekreuzt ODER am Artikel noch nicht gesetzt; manual-Schutz respektieren.
  const snapDeposit = extractedVal('has_deposit')
  if (snapDeposit != null) {
    const catHasDeposit = snapDeposit.toLowerCase() === 'ja'
    if (catHasDeposit && (fields.hasDeposit || !product.hasDeposit)) {
      const srcs = await getFieldSources(product.id)
      if (fields.hasDeposit || srcs.deposit !== 'manual') patch.hasDeposit = true
    }
  }
  // Kategorie: 1) explizit manuell gewaehlt (gewinnt, Herkunft 'manual'); sonst
  // 2) Best-Effort per matchCategoryId (Herkunft 'globus'). Manuelle Wahl wird
  // gegen die categories-Tabelle validiert, damit keine Fremd-/Fantasie-ID landet.
  if (fields.category && manualCategoryId) {
    const catExists = await db.query.categories.findFirst({
      where: eq(categories.id, manualCategoryId),
      columns: { id: true },
    })
    if (catExists) {
      patch.categoryId = manualCategoryId
      categorySource = 'manual'
    }
  }
  if (patch.categoryId === undefined && Array.isArray(snap.category) && snap.category.length > 0) {
    const { id: catId, fromRule } = await matchCategoryWithSource(snap.category, householdId)
    if (catId) {
      // Standard: schreiben, wenn angekreuzt ODER Artikel hat noch keine Kategorie.
      let mayWrite = fields.category || !product.categoryId
      // G31: Ein NUTZER-REGEL-Treffer darf auch eine bestehende Kategorie neu
      // zuordnen — AUSSER sie wurde manuell gesetzt (Herkunft 'manual' bleibt
      // geschuetzt). So wirkt eine Regel rueckwirkend, respektiert aber manuell > Regel.
      if (!mayWrite && fromRule && product.categoryId) {
        const srcs = await getFieldSources(product.id)
        if (srcs.category !== 'manual') mayWrite = true
      }
      if (mayWrite) {
        patch.categoryId = catId
        categorySource = 'globus'
      }
    }
  }

  if (Object.keys(patch).length > 0) {
    await updateProduct(product.id, patch)
    // Herkunft der uebernommenen Felder setzen (G15/G20-2).
    const srcs: Partial<Record<ProductField, 'globus' | 'manual'>> = {}
    if (patch.name !== undefined) srcs.name = 'globus'
    if (patch.imageUrl !== undefined) srcs.image = 'globus'
    if (patch.brand !== undefined) srcs.brand = 'globus'
    if (patch.description !== undefined) srcs.description = 'globus'
    if (patch.hasDeposit !== undefined) srcs.deposit = 'globus'
    if (patch.categoryId !== undefined && categorySource) srcs.category = categorySource
    await setFieldSources(product.id, srcs)
  }

  // Preis: angekreuzt + Katalog hat Preis + Markt-Bezug → als Preis-VORSCHLAG
  // anlegen (product_prices, proposed), analog zum Online-Preis-Abruf (F2).
  // Kein Direkt-Confirm (Staging bleibt). Ohne storeId nicht moeglich (der
  // Preis ist markt-gebunden) → dann still uebersprungen.
  if (fields.price && snap.priceCt != null && snap.storeId) {
    const unit = (await suggestStockUnitForProduct(product.id, householdId)) ?? product.defaultUnit ?? 'piece'
    await recordProposedPrice({
      householdId,
      productId: product.id,
      storeId: snap.storeId,
      priceCt: snap.priceCt,
      unit,
      note: 'aus Katalog-Spiegel',
      createdBy: reviewedBy ?? null,
    })
  }

  // Snapshot mit dem Artikel verknuepfen (falls noch nicht) + auf confirmed setzen.
  await db
    .update(globusSnapshots)
    .set({
      productId: snap.productId ?? product.id,
      status: 'confirmed',
      reviewedAt: new Date(),
      reviewedBy: reviewedBy ?? null,
    })
    .where(eq(globusSnapshots.id, id))

  return { ok: true }
}

/**
 * Globus-Kategorie-Pfad best-effort auf categories.id mappen (G19-2).
 * Robuster als frueher: es werden ALLE Pfad-Segmente geprueft (nicht nur das
 * letzte), und zwar gegen Name UND Slug der Seed-Kategorien. Reihenfolge:
 * spezifischste Segmente (hinten im Pfad) zuerst — so gewinnt "Joghurt" vor dem
 * Ober-Segment "Kühlregal", wenn beide zufaellig treffen wuerden.
 * Ergibt sich KEIN Treffer, wird null zurueckgegeben (→ "nicht zuordenbar" in der UI),
 * NICHT stillschweigend eine Default-Kategorie.
 */
async function matchCategoryId(
  category: string[] | null | undefined,
  householdId: string
): Promise<string | null> {
  return (await matchCategoryWithSource(category, householdId)).id
}

/**
 * Wie matchCategoryId, liefert aber zusaetzlich fromRule: true, wenn der Treffer
 * aus einer NUTZER-MAPPING-REGEL (resolveMappedCategory) stammt — false beim
 * reinen Name/Slug-Fallback. Genutzt in applySnapshotToProduct, um zu entscheiden,
 * ob auch eine BESTEHENDE (nicht-manuelle) Kategorie neu zugeordnet werden darf (G31).
 */
async function matchCategoryWithSource(
  category: string[] | null | undefined,
  householdId: string
): Promise<{ id: string | null; fromRule: boolean }> {
  const db = getDb()
  if (!Array.isArray(category) || category.length === 0) return { id: null, fromRule: false }

  // 0. Nutzer-Mapping-Regeln haben Vorrang vor dem Name/Slug-Fallback (G29).
  const mapped = await resolveMappedCategory('globus', category, householdId)
  if (mapped) return { id: mapped, fromRule: true }

  const cats = await db
    .select({ id: categories.id, name: categories.name, slug: categories.slug })
    .from(categories)

  const norm = (s: string) => s.trim().toLowerCase()
  // Spezifischste zuerst (Pfad ist grob → fein): von hinten nach vorne.
  for (let i = category.length - 1; i >= 0; i--) {
    const seg = norm(category[i] ?? '')
    if (seg === '') continue
    const hit = cats.find((c) => norm(c.name) === seg || norm(c.slug) === seg)
    if (hit) return { id: hit.id, fromRule: false }
  }
  return { id: null, fromRule: false }
}

/**
 * Legt aus einem Katalog-Snapshot einen Artikel an (Name/EAN/Bild/Kategorie) und
 * verknuepft den Snapshot damit (productId). Fuer die On-demand-Katalog-Suche
 * beim Anlegen (G9-3). Kein status-Wechsel (Snapshot bleibt Katalog-Eintrag).
 * Liefert das angelegte Produkt (id + Anzeige-Felder) oder null.
 */
export async function materializeSnapshotToProduct(
  snapshotId: string,
  householdId: string,
  createdBy?: string | null
): Promise<{ id: string; name: string; imageUrl: string | null; categoryId: string | null } | null> {
  const db = getDb()
  const snap = await db.query.globusSnapshots.findFirst({
    where: (s, { and, eq }) => and(eq(s.id, snapshotId), eq(s.householdId, householdId)),
  })
  if (!snap) return null

  const categoryId = await matchCategoryId(snap.category, householdId)
  const imageUrl = snap.localImagePath ? `/media/${snap.localImagePath}` : undefined

  const productId = await createProduct({
    name: snap.name?.trim() || snap.gtin,
    gtin: snap.gtin,
    imageUrl,
    categoryId: categoryId ?? undefined,
    createdBy: createdBy ?? undefined,
  })

  // Snapshot mit dem neuen Artikel verknuepfen (best-effort).
  await db
    .update(globusSnapshots)
    .set({ productId })
    .where(eq(globusSnapshots.id, snapshotId))

  // Herkunft der aus dem Katalog gesetzten Felder → 'globus' (G15).
  const srcs: Partial<Record<ProductField, 'globus'>> = { name: 'globus' }
  if (imageUrl) srcs.image = 'globus'
  if (categoryId) srcs.category = 'globus'
  await setFieldSources(productId, srcs)

  return {
    id: productId,
    name: snap.name?.trim() || snap.gtin,
    imageUrl: imageUrl ?? null,
    categoryId: categoryId ?? null,
  }
}

/** Snapshot bestaetigen (status='confirmed'). Nur offene Vorschlaege. */
export async function confirmSnapshot(id: string, householdId: string, reviewedBy?: string | null) {
  const db = getDb()
  const [row] = await db
    .update(globusSnapshots)
    .set({ status: 'confirmed', reviewedAt: new Date(), reviewedBy: reviewedBy ?? null })
    .where(
      and(
        eq(globusSnapshots.id, id),
        eq(globusSnapshots.householdId, householdId),
        eq(globusSnapshots.status, 'proposed')
      )
    )
    .returning()
  return row ?? null
}

/** Snapshot verwerfen (status='rejected'). Nur offene Vorschlaege. */
export async function rejectSnapshot(id: string, householdId: string, reviewedBy?: string | null) {
  const db = getDb()
  const [row] = await db
    .update(globusSnapshots)
    .set({ status: 'rejected', reviewedAt: new Date(), reviewedBy: reviewedBy ?? null })
    .where(
      and(
        eq(globusSnapshots.id, id),
        eq(globusSnapshots.householdId, householdId),
        eq(globusSnapshots.status, 'proposed')
      )
    )
    .returning()
  return row ?? null
}

/**
 * Distinct, lowercase-normalisierte Globus-Pfad-Segmente aus den Snapshots des
 * Haushalts — die real vorkommenden Token-Kandidaten fuer Mapping-Regeln (G30).
 * category ist text[]; hier bewusst driver-agnostisch: Arrays laden + in JS
 * flatten/deduplizieren (Datenmenge je Haushalt klein), statt rohes unnest-SQL.
 */
export async function listGlobusCategorySegments(householdId: string): Promise<string[]> {
  const db = getDb()
  const rows = await db
    .select({ category: globusSnapshots.category })
    .from(globusSnapshots)
    .where(eq(globusSnapshots.householdId, householdId))
  const set = new Set<string>()
  for (const r of rows) {
    for (const seg of r.category ?? []) {
      const norm = (seg ?? '').trim().toLowerCase()
      if (norm !== '') set.add(norm)
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b))
}
