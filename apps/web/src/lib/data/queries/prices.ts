import { getDb } from '$data/db'
import { productPrices } from '@stoqr/db'
import { and, eq, desc, inArray } from 'drizzle-orm'

// ---------------------------------------------------------------------------
// Preise je Artikel+Markt mit Historie (Block F / M3)
//
// Append-only: jede Erfassung ist ein neuer Eintrag. Genau EINER je
// (productId, storeId, householdId) traegt isCurrent=true = massgeblicher Preis
// fuers Estimate. Ein reduzierter Preis (isReduced) wird nur dann isCurrent,
// wenn er ausdruecklich als Dauerpreis uebernommen wird (makePermanent).
// ---------------------------------------------------------------------------

export type PriceSource = 'manual' | 'booked' | 'online'
export type PriceStatus = 'proposed' | 'confirmed' | 'rejected'

export interface RecordPriceInput {
  householdId: string
  productId: string
  storeId: string
  priceCt: number
  unit: string
  isReduced?: boolean
  priceIncludesDeposit?: boolean
  makePermanent?: boolean
  source: PriceSource
  note?: string | null
  createdBy?: string | null
}

/**
 * Schreibt einen Preis-Eintrag. Setzt isCurrent transaktional: ein regulaerer
 * Preis (oder ein als Dauerpreis uebernommener reduzierter) wird der neue
 * massgebliche Preis; der bisherige isCurrent-Eintrag wird zurueckgesetzt
 * (raeumt den partiellen Unique-Index).
 */
export async function recordPrice(input: RecordPriceInput) {
  const db = getDb()
  const willBeCurrent = !input.isReduced || input.makePermanent === true
  return db.transaction(async (tx) => {
    if (willBeCurrent) {
      await tx
        .update(productPrices)
        .set({ isCurrent: false })
        .where(
          and(
            eq(productPrices.productId, input.productId),
            eq(productPrices.storeId, input.storeId),
            eq(productPrices.householdId, input.householdId),
            eq(productPrices.isCurrent, true),
          ),
        )
    }
    const [row] = await tx
      .insert(productPrices)
      .values({
        householdId: input.householdId,
        productId: input.productId,
        storeId: input.storeId,
        priceCt: input.priceCt,
        unit: input.unit,
        isReduced: input.isReduced ?? false,
        priceIncludesDeposit: input.priceIncludesDeposit ?? false,
        isCurrent: willBeCurrent,
        status: 'confirmed',
        source: input.source,
        note: input.note ?? null,
        createdBy: input.createdBy ?? null,
      })
      .returning()
    return row
  })
}

/** Aktueller (massgeblicher) Preis fuer (Artikel, Markt) oder null. */
export async function getCurrentPrice(productId: string, storeId: string, householdId: string) {
  const db = getDb()
  const row = await db.query.productPrices.findFirst({
    where: (p, { and, eq }) =>
      and(
        eq(p.productId, productId),
        eq(p.storeId, storeId),
        eq(p.householdId, householdId),
        eq(p.isCurrent, true),
      ),
  })
  return row ?? null
}

/**
 * Aktuelle Preise mehrerer Artikel fuer EINEN Markt (Batch, fuers Run-Estimate).
 * Liefert Map<productId, PriceRow>.
 */
export async function getCurrentPricesForProducts(
  productIds: string[],
  storeId: string,
  householdId: string,
) {
  const db = getDb()
  const map = new Map<string, typeof productPrices.$inferSelect>()
  if (productIds.length === 0) return map
  const rows = await db
    .select()
    .from(productPrices)
    .where(
      and(
        eq(productPrices.householdId, householdId),
        eq(productPrices.storeId, storeId),
        eq(productPrices.isCurrent, true),
        inArray(productPrices.productId, productIds),
      ),
    )
  for (const r of rows) map.set(r.productId, r)
  return map
}

/** Alle aktuellen Preise eines Artikels ueber alle Maerkte (Detailseite-Card). */
export async function getCurrentPricesForProductAllStores(productId: string, householdId: string) {
  const db = getDb()
  return db.query.productPrices.findMany({
    where: (p, { and, eq }) =>
      and(eq(p.productId, productId), eq(p.householdId, householdId), eq(p.isCurrent, true)),
    with: { store: { columns: { id: true, name: true, chain: true } } },
  })
}

/**
 * Aktuelle Preise (alle Maerkte) mehrerer Listen-Produkte — fuer die client-reaktive
 * Einkaufslisten-Schaetzung. Liefert flache Row-Liste (Client gruppiert nach store/product).
 */
export async function getCurrentPricesForListProducts(householdId: string, productIds: string[]) {
  const db = getDb()
  if (productIds.length === 0) return []
  const rows = await db
    .select({
      productId: productPrices.productId,
      storeId: productPrices.storeId,
      priceCt: productPrices.priceCt,
      unit: productPrices.unit,
      isReduced: productPrices.isReduced,
      // Grundpreis (G46): fuer den fairen günstigster-Markt-Vergleich pro Basiseinheit.
      basePriceCt: productPrices.basePriceCt,
      basePriceUnit: productPrices.basePriceUnit,
      // Pfand (G47): fuer den getrennten Ware+Pfand-Ausweis der Einkaufsliste.
      priceIncludesDeposit: productPrices.priceIncludesDeposit,
    })
    .from(productPrices)
    .where(
      and(
        eq(productPrices.householdId, householdId),
        eq(productPrices.isCurrent, true),
        inArray(productPrices.productId, productIds),
      ),
    )
  // WICHTIG (App/SQLite): eine rohe .select({...})-Projektion durchlaeuft NICHT
  // den drizzle mode:'boolean'-Codec (anders als db.query.*.findMany). Auf der
  // On-Device-SQLite kommen boolean-Spalten daher als integer 0/1 zurueck. Der
  // Estimate prueft `priceIncludesDeposit === false` strikt -> 0 === false ist
  // false -> Pfand wuerde NIE ausgewiesen (Chip + Summenzeile fehlten). Auf dem
  // Pi (Postgres) liefert .select() echte Booleans, daher nur App betroffen.
  // Hier defensiv auf echte Booleans normalisieren (idempotent fuer beide Ziele).
  return rows.map((r) => ({
    ...r,
    isReduced: Boolean(r.isReduced),
    priceIncludesDeposit: Boolean(r.priceIncludesDeposit),
  }))
}

/** Preis-Historie eines Artikels (alle Maerkte), neueste zuerst. */
export async function listPriceHistory(
  productId: string,
  householdId: string,
  opts?: { limit?: number },
) {
  const db = getDb()
  const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 200)
  return db.query.productPrices.findMany({
    where: (p, { and, eq }) => and(eq(p.productId, productId), eq(p.householdId, householdId)),
    orderBy: [desc(productPrices.recordedAt)],
    limit,
    with: { store: { columns: { id: true, name: true, chain: true } } },
  })
}

// ---------------------------------------------------------------------------
// Staging/Freigabe (Block F2) — Online-Preis-Abruf landet als Vorschlag.
//
// Kern-Invariante: status != 'confirmed' => isCurrent = false. Ein Vorschlag
// fliesst nie ins Estimate; erst confirmProposedPrice befoerdert ihn (in-place)
// zu 'confirmed' mit der regulaeren recordPrice-isCurrent-Semantik.
// ---------------------------------------------------------------------------

export interface RecordProposedPriceInput {
  householdId: string
  productId: string
  storeId: string
  priceCt: number
  unit: string
  basePriceCt?: number | null
  basePriceUnit?: string | null
  priceIncludesDeposit?: boolean
  note?: string | null
  createdBy?: string | null
}

/**
 * Legt einen Online-Preis-Vorschlag an (status='proposed', isCurrent=false hart).
 * Ein bereits offener Vorschlag desselben Tripels wird auf 'rejected' gesetzt
 * (superseded), damit der partielle Unique-Index frei bleibt und der juengste
 * Vorschlag gewinnt.
 */
export async function recordProposedPrice(input: RecordProposedPriceInput) {
  const db = getDb()
  return db.transaction(async (tx) => {
    await tx
      .update(productPrices)
      .set({ status: 'rejected' })
      .where(
        and(
          eq(productPrices.productId, input.productId),
          eq(productPrices.storeId, input.storeId),
          eq(productPrices.householdId, input.householdId),
          eq(productPrices.status, 'proposed'),
        ),
      )
    const [row] = await tx
      .insert(productPrices)
      .values({
        householdId: input.householdId,
        productId: input.productId,
        storeId: input.storeId,
        priceCt: input.priceCt,
        unit: input.unit,
        basePriceCt: input.basePriceCt ?? null,
        basePriceUnit: input.basePriceUnit ?? null,
        priceIncludesDeposit: input.priceIncludesDeposit ?? false,
        isReduced: false,
        isCurrent: false,
        status: 'proposed',
        source: 'online',
        note: input.note ?? null,
        createdBy: input.createdBy ?? null,
      })
      .returning()
    return row
  })
}

/** Offene Vorschlaege eines Artikels (alle Maerkte) — fuer die Detailseite-Card. */
export async function listProposedForProduct(productId: string, householdId: string) {
  const db = getDb()
  return db.query.productPrices.findMany({
    where: (p, { and, eq }) =>
      and(eq(p.productId, productId), eq(p.householdId, householdId), eq(p.status, 'proposed')),
    with: { store: { columns: { id: true, name: true, chain: true } } },
    orderBy: [desc(productPrices.recordedAt)],
  })
}

/** Offene Vorschlaege mehrerer Produkte (flach) — fuer spaetere Badges. */
export async function getProposedForProducts(householdId: string, productIds: string[]) {
  const db = getDb()
  if (productIds.length === 0) return []
  return db
    .select({
      id: productPrices.id,
      productId: productPrices.productId,
      storeId: productPrices.storeId,
      priceCt: productPrices.priceCt,
      unit: productPrices.unit,
    })
    .from(productPrices)
    .where(
      and(
        eq(productPrices.householdId, householdId),
        eq(productPrices.status, 'proposed'),
        inArray(productPrices.productId, productIds),
      ),
    )
}

export interface ConfirmProposedPriceInput {
  householdId: string
  makePermanent?: boolean
  priceCt?: number
  unit?: string
  isReduced?: boolean
  createdBy?: string | null
}

/**
 * Befoerdert einen Vorschlag in-place zu 'confirmed'. „Korrigieren" = confirm mit
 * ueberschriebenen priceCt/unit/isReduced. Uebernimmt die recordPrice-Semantik:
 * willBeCurrent = !isReduced || makePermanent; bei willBeCurrent wird der bisherige
 * isCurrent-Eintrag desselben Tripels zurueckgesetzt. Liefert die aktualisierte Row
 * oder null (Vorschlag nicht gefunden / nicht offen).
 */
export async function confirmProposedPrice(id: string, input: ConfirmProposedPriceInput) {
  const db = getDb()
  return db.transaction(async (tx) => {
    const proposal = await tx.query.productPrices.findFirst({
      where: (p, { and, eq }) =>
        and(eq(p.id, id), eq(p.householdId, input.householdId), eq(p.status, 'proposed')),
    })
    if (!proposal) return null

    const isReduced = input.isReduced ?? proposal.isReduced
    const willBeCurrent = !isReduced || input.makePermanent === true

    if (willBeCurrent) {
      await tx
        .update(productPrices)
        .set({ isCurrent: false })
        .where(
          and(
            eq(productPrices.productId, proposal.productId),
            eq(productPrices.storeId, proposal.storeId),
            eq(productPrices.householdId, proposal.householdId),
            eq(productPrices.isCurrent, true),
          ),
        )
    }

    const [row] = await tx
      .update(productPrices)
      .set({
        status: 'confirmed',
        isCurrent: willBeCurrent,
        isReduced,
        priceCt: input.priceCt ?? proposal.priceCt,
        unit: input.unit ?? proposal.unit,
        recordedAt: new Date(),
      })
      .where(eq(productPrices.id, id))
      .returning()
    return row ?? null
  })
}

/** Verwirft einen Vorschlag (status='rejected', bleibt isCurrent=false). */
export async function rejectProposedPrice(id: string, householdId: string) {
  const db = getDb()
  const [row] = await db
    .update(productPrices)
    .set({ status: 'rejected' })
    .where(
      and(
        eq(productPrices.id, id),
        eq(productPrices.householdId, householdId),
        eq(productPrices.status, 'proposed'),
      ),
    )
    .returning()
  return row ?? null
}
