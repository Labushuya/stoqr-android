// ---------------------------------------------------------------------------
// transfer-io — IO-Runner fuer Import/Export (dialekt-neutral)
// ---------------------------------------------------------------------------
// Getrennt vom puren Kern (transfer.ts), weil diese Funktionen eine drizzle-
// Instanz + das Schema-Namespace-Objekt brauchen. Sie bleiben aber dialekt-
// NEUTRAL: der drizzle-Query-Builder (select/insert/delete) ist fuer Postgres
// (Pi) und SQLite (App) identisch. Der Aufrufer injiziert die drizzle-Operatoren
// (eq/inArray/and) + das jeweilige Schema, damit packages/db keinen Dialekt
// hart importiert.
//
// - collectExport: liest die Tier-Tabellen + baut den refs-Sidecar (Slug/Symbol
//   der referenzierten Referenzdaten), encodet Dates -> ms, gibt ein Envelope.
// - wipeUserContent: children-first Delete des Household-Contents (OHNE die
//   Referenzdaten categories/nutrient_types und OHNE System-Units) — REPLACE.
// - applyImport: parseEnvelope -> Referenzen am Ziel aufloesen -> remapImport
//   -> wipe (in tx) -> decode + insert in TRANSFER_TABLE_ORDER.

import {
  FK_DESCRIPTOR,
  TIER_TABLES,
  TRANSFER_TABLE_ORDER,
  buildColumnTypeMap,
  buildEnvelope,
  decodeRow,
  encodeRow,
  parseEnvelope,
  remapImport,
  type ColumnTypeMap,
  type ExportTier,
  type RefSidecar,
  type SourceSystem,
  type StoqrExport,
  type TransferTable,
} from './transfer'

// Minimaler Drizzle-Kontrakt, den beide Dialekte erfuellen. `any`, weil die
// konkreten Tabellentypen dialektabhaengig sind — die Query-Semantik ist gleich.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Table = any

export interface DrizzleOps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  eq: (col: any, val: any) => any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  inArray: (col: any, vals: any[]) => any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  and: (...conds: any[]) => any
}

/** Schema-Namespace (sqliteSchema oder das Postgres-Barrel). */
export type TransferSchema = Record<string, Table>

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export interface CollectExportOpts {
  db: Db
  schema: TransferSchema
  ops: DrizzleOps
  sourceSystem: SourceSystem
  scope: ExportTier
  householdId: string
  /** ISO-Zeitstempel (Aufrufer liefert ihn; der Kern ruft kein Date.now()). */
  exportedAt: string
}

/**
 * Liest die zum Tier gehoerenden Tabellen des Haushalts und baut ein Envelope.
 * Baut den refs-Sidecar aus den tatsaechlich referenzierten Referenzdaten
 * (categories/nutrient_types per slug, System-units per symbol).
 */
export async function collectExport(opts: CollectExportOpts): Promise<StoqrExport> {
  const { db, schema, ops, sourceSystem, scope, householdId, exportedAt } = opts
  const tables = TIER_TABLES[scope]

  const collected: Partial<Record<TransferTable, Array<Record<string, unknown>>>> = {}
  const typeMaps = new Map<TransferTable, ColumnTypeMap>()

  // Referenzierte Referenzdaten-IDs sammeln (fuer den Sidecar).
  const refCategoryIds = new Set<string>()
  const refNutrientTypeIds = new Set<string>()
  const refUnitIds = new Set<string>()

  for (const name of tables) {
    const table = schema[name]
    if (!table) throw new Error(`collectExport: Tabelle ${name} fehlt im Schema.`)
    const types = buildColumnTypeMap(table)
    typeMaps.set(name, types)

    const rows = await selectTableForHousehold(db, ops, table, name, householdId)

    // referenzierte Ref-IDs aus den FK-Spalten einsammeln.
    for (const fk of FK_DESCRIPTOR[name]) {
      if (fk.kind === 'refCategory' || fk.kind === 'refNutrientType' || fk.kind === 'refUnit') {
        for (const r of rows) {
          const v = r[fk.col]
          if (v == null) continue
          if (fk.kind === 'refCategory') refCategoryIds.add(String(v))
          else if (fk.kind === 'refNutrientType') refNutrientTypeIds.add(String(v))
          else refUnitIds.add(String(v))
        }
      }
    }

    collected[name] = rows.map((r) => encodeRow(r, types))
  }

  const refs = await buildRefSidecar(db, schema, ops, {
    categoryIds: refCategoryIds,
    nutrientTypeIds: refNutrientTypeIds,
    unitIds: refUnitIds,
  })

  return buildEnvelope({ sourceSystem, scope, exportedAt, tables: collected, refs })
}

/**
 * Selektiert die Zeilen einer Tabelle fuer den Haushalt. products ist global
 * (kein household_id) -> alle Zeilen. units filtert zusaetzlich is_system=false
 * (System-Units werden nie exportiert, das Ziel hat sie aus seedLocal).
 */
async function selectTableForHousehold(
  db: Db,
  ops: DrizzleOps,
  table: Table,
  name: TransferTable,
  householdId: string
): Promise<Array<Record<string, unknown>>> {
  if (name === 'products') {
    // global: alle Produkte (Dedup passiert beim Import per gtin).
    return db.select().from(table)
  }
  if (name === 'units') {
    // nur haushaltseigene, nicht-System-Einheiten.
    return db
      .select()
      .from(table)
      .where(ops.and(ops.eq(table.householdId, householdId), ops.eq(table.isSystem, false)))
  }
  // Tabellen mit direkter householdId-Spalte.
  if ('householdId' in table) {
    return db.select().from(table).where(ops.eq(table.householdId, householdId))
  }
  // storages/places haben keine eigene householdId — sie haengen ueber
  // locationId/storageId am Haushalt. Beim Single-Household-Setup (App) bzw.
  // dem exportierten Haushalt genuegt der volle Read; verwaiste Zeilen kann es
  // nicht geben, weil die Eltern (locations) household-scoped sind und im selben
  // Tier mitexportiert werden. Der Import verwirft ohnehin FK-lose Kinder.
  return db.select().from(table)
}

/** Laedt Slug/Symbol der referenzierten Referenzdaten (nur die genutzten IDs). */
async function buildRefSidecar(
  db: Db,
  schema: TransferSchema,
  ops: DrizzleOps,
  used: { categoryIds: Set<string>; nutrientTypeIds: Set<string>; unitIds: Set<string> }
): Promise<RefSidecar> {
  const refs: RefSidecar = { categories: {}, nutrientTypes: {}, units: {} }

  if (used.categoryIds.size) {
    const cats = await db
      .select()
      .from(schema.categories)
      .where(ops.inArray(schema.categories.id, [...used.categoryIds]))
    for (const c of cats) refs.categories[String(c.id)] = String(c.slug)
  }
  if (used.nutrientTypeIds.size) {
    const nts = await db
      .select()
      .from(schema.nutrientTypes)
      .where(ops.inArray(schema.nutrientTypes.id, [...used.nutrientTypeIds]))
    for (const n of nts) refs.nutrientTypes[String(n.id)] = String(n.slug)
  }
  if (used.unitIds.size) {
    const us = await db
      .select()
      .from(schema.units)
      .where(ops.inArray(schema.units.id, [...used.unitIds]))
    for (const u of us) refs.units[String(u.id)] = String(u.symbol)
  }
  return refs
}

// ---------------------------------------------------------------------------
// Wipe (REPLACE) — children-first, OHNE Referenzdaten/System-Units
// ---------------------------------------------------------------------------
// Reihenfolge gespiegelt aus resetHousehold (einstellungen/+page.server.ts),
// ABER: categories/nutrient_types werden NICHT geloescht (der Import loest FKs
// per Slug gegen sie auf) und System-Units bleiben (household_id=null). products
// werden global hart geleert wie beim Werksreset Stufe C — Dedup beim Import
// legt vorhandene GTINs ohnehin neu an.

export interface WipeOpts {
  tx: Db
  schema: TransferSchema
  ops: DrizzleOps
  householdId: string
}

export async function wipeUserContent(opts: WipeOpts): Promise<void> {
  const { tx, schema: s, ops, householdId: hid } = opts
  const { eq, and } = ops

  // Bestand + soll (referenzieren products/places/stores).
  await tx.delete(s.inventoryItems).where(eq(s.inventoryItems.householdId, hid))
  await tx.delete(s.stockTargets).where(eq(s.stockTargets.householdId, hid))
  // Preise + Markt-Junction + Snapshots (household-scoped).
  await tx.delete(s.productPrices).where(eq(s.productPrices.householdId, hid))
  await tx.delete(s.productStores).where(eq(s.productStores.householdId, hid))
  await tx.delete(s.globusSnapshots).where(eq(s.globusSnapshots.householdId, hid))
  // Einkaufs-Kette children-first.
  await tx.delete(s.shoppingTripItems).where(eq(s.shoppingTripItems.householdId, hid))
  await tx.delete(s.shoppingTrips).where(eq(s.shoppingTrips.householdId, hid))
  await tx.delete(s.shoppingListItems).where(eq(s.shoppingListItems.householdId, hid))
  // bring_sync_log referenziert stores (RESTRICT) -> vor stores.
  await tx.delete(s.bringSync).where(eq(s.bringSync.householdId, hid))
  // category_mappings + expiry_config (household-scoped).
  await tx.delete(s.categoryMappings).where(eq(s.categoryMappings.householdId, hid))
  await tx.delete(s.expiryConfig).where(eq(s.expiryConfig.householdId, hid))
  // Lager-Hierarchie: locations cascadet auf storages -> places.
  await tx.delete(s.locations).where(eq(s.locations.householdId, hid))
  // Maerkte (nach allen store-referenzierenden Tabellen).
  await tx.delete(s.stores).where(eq(s.stores.householdId, hid))
  // Eigene (nicht-System-)Einheiten des Haushalts.
  await tx.delete(s.units).where(and(eq(s.units.householdId, hid), eq(s.units.isSystem, false)))
  // Artikel global hart (product_nutrients & product_field_sources cascaden mit).
  // Bewusst wie beim Werksreset: Single-Household-Setup, Import legt neu an.
  await tx.delete(s.products)
  // NICHT geloescht: categories, nutrient_types (Slug-Aufloesung), System-Units,
  // Auth-Tabellen, audit_log, invites, meta.
}

// ---------------------------------------------------------------------------
// Import (REPLACE + remap)
// ---------------------------------------------------------------------------

export interface ApplyImportOpts {
  db: Db
  schema: TransferSchema
  ops: DrizzleOps
  /** Rohtext der .stoqr-Datei. */
  fileText: string
  targetHouseholdId: string
  targetUserId: string
  /** ID-Generator fuers Ziel (Pi: crypto.randomUUID; App: dito). */
  newId: () => string
}

export interface ApplyImportResult {
  scope: ExportTier
  sourceSystem: SourceSystem
  inserted: Partial<Record<TransferTable, number>>
  reusedProducts: number
  warnings: string[]
}

export async function applyImport(opts: ApplyImportOpts): Promise<ApplyImportResult> {
  const { db, schema: s, ops, fileText, targetHouseholdId, targetUserId, newId } = opts

  const envelope = parseEnvelope(fileText)

  // 1) Ziel-Referenzen laden (Slug/Symbol -> lokale id).
  const [cats, nts, us, existingProducts] = await Promise.all([
    db.select().from(s.categories),
    db.select().from(s.nutrientTypes),
    db.select().from(s.units),
    db.select().from(s.products),
  ])
  const categoryBySlug = new Map<string, string>(cats.map((c: any) => [String(c.slug), String(c.id)]))
  const nutrientTypeBySlug = new Map<string, string>(nts.map((n: any) => [String(n.slug), String(n.id)]))
  const unitBySymbol = new Map<string, string>(us.map((u: any) => [String(u.symbol), String(u.id)]))
  const existingProductsByGtin = new Map<string, string>()
  for (const p of existingProducts) {
    if (p.gtin != null) existingProductsByGtin.set(String(p.gtin), String(p.id))
  }

  // 2) Reiner Remap auf die Ziel-Identitaet.
  const { inserts, reusedProductIds, warnings } = remapImport({
    envelope,
    targetHouseholdId,
    targetUserId,
    existingProductsByGtin,
    referenceIds: { categoryBySlug, nutrientTypeBySlug, unitBySymbol },
    newId,
  })

  // 3) Decode (ms -> Date) je Tabelle vorbereiten.
  const decoded: Partial<Record<TransferTable, Array<Record<string, unknown>>>> = {}
  for (const name of TRANSFER_TABLE_ORDER) {
    const rows = inserts[name]
    if (!rows || !rows.length) continue
    const types = buildColumnTypeMap(s[name])
    decoded[name] = rows.map((r) => decodeRow(r, types))
  }

  // 4) REPLACE + Insert in EINER Transaktion (children-first Wipe, dann
  //    parent-first Insert in TRANSFER_TABLE_ORDER).
  const inserted: Partial<Record<TransferTable, number>> = {}
  await db.transaction(async (tx: Db) => {
    await wipeUserContent({ tx, schema: s, ops, householdId: targetHouseholdId })
    for (const name of TRANSFER_TABLE_ORDER) {
      const rows = decoded[name]
      if (!rows || !rows.length) continue
      // In Chunks einfuegen (SQLite-Parameterlimit ~999 -> defensiv 200 Zeilen).
      for (let i = 0; i < rows.length; i += 200) {
        await tx.insert(s[name]).values(rows.slice(i, i + 200))
      }
      inserted[name] = rows.length
    }
  })

  return {
    scope: envelope.scope,
    sourceSystem: envelope.sourceSystem,
    inserted,
    reusedProducts: reusedProductIds.size,
    warnings,
  }
}
