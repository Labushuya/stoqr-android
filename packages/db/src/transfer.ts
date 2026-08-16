// ---------------------------------------------------------------------------
// transfer — Datei-basierter Import/Export (Erstbefuellung Pi <-> App)
// ---------------------------------------------------------------------------
// Gemeinsamer, dialekt-neutraler Kern fuer BEIDE Architekturen (Postgres/Pi und
// SQLite/App). Beide importieren @stoqr/db* und teilen sich dasselbe Envelope-
// Format, dieselben Tier-Definitionen, denselben FK-Deskriptor und dieselbe
// ID-Remap-Logik. So ist ein auf dem Pi erzeugtes .stoqr-File in der App
// importierbar und umgekehrt ("beide Architekturen ergaenzen sich").
//
// Dies ist ERSTBEFUELLUNG (Import = REPLACE), NICHT der spaetere bidirektionale
// Sync. Auth/Identitaet wird nie exportiert; beim Import wird alles auf die
// Ziel-Identitaet (household/user) umgehaengt. products werden global per gtin
// dedupliziert (products.gtin ist global unique, kein household_id).
//
// Der pure Kern (Typen, Registries, encode/decode, remapImport) haengt an KEINEM
// DB-Treiber und ist damit reintestbar. Die IO-Runner (collectExport/applyImport/
// wipeUserContent) nehmen die drizzle-Instanz + das Schema als Parameter und
// funktionieren dank des dialekt-neutralen Query-Builders auf beiden Targets.

import { getTableColumns } from 'drizzle-orm'

// ---------------------------------------------------------------------------
// Envelope-Format
// ---------------------------------------------------------------------------

export const TRANSFER_FORMAT_VERSION = 1 as const

export type ExportTier = 'stammdaten' | 'orte-inventar' | 'einkauf' | 'alles'

export type SourceSystem = 'pi' | 'app'

/** Sidecar: referenzierte Referenzdaten-IDs -> natuerlicher Schluessel. Erlaubt,
 *  die Referenzdaten (categories/nutrient_types/system-units) NICHT zu exportieren
 *  (das Ziel hat sie aus seedLocal) und die FKs dennoch aufzuloesen. */
export interface RefSidecar {
  categories: Record<string, string> // srcCategoryId -> slug
  nutrientTypes: Record<string, string> // srcNutrientTypeId -> slug
  units: Record<string, string> // srcSystemUnitId -> symbol
}

export interface StoqrExport {
  formatVersion: typeof TRANSFER_FORMAT_VERSION
  exportedAt: string // ISO-8601
  sourceSystem: SourceSystem
  scope: ExportTier
  tables: Partial<Record<TransferTable, Array<Record<string, unknown>>>>
  refs: RefSidecar
}

// ---------------------------------------------------------------------------
// Tabellen-Registry
// ---------------------------------------------------------------------------
// Namen sind die drizzle-EXPORT-Namen (camelCase Objekte in schema.sqlite.ts /
// schema.ts), NICHT die SQL-Tabellennamen. So kann der Runner
// schema[name] direkt als drizzle-Table nutzen.

export type TransferTable =
  | 'units'
  | 'stores'
  | 'products'
  | 'productNutrients'
  | 'productFieldSources'
  | 'productStores'
  | 'categoryMappings'
  | 'expiryConfig'
  | 'locations'
  | 'storages'
  | 'places'
  | 'inventoryItems'
  | 'stockTargets'
  | 'productPrices'
  | 'shoppingListItems'
  | 'shoppingTrips'
  | 'shoppingTripItems'

/**
 * Dependency-geordnete Insert-Reihenfolge (Eltern zuerst). Der Import fuegt
 * genau in dieser Reihenfolge ein; das Wipe laeuft in umgekehrter (children-
 * first) Reihenfolge. Referenzdaten (categories/nutrient_types) tauchen NICHT
 * auf — sie werden nur per Slug aufgeloest, nie eingefuegt.
 */
export const TRANSFER_TABLE_ORDER: TransferTable[] = [
  'units', // nur is_system=false (Household-eigene Einheiten)
  'stores',
  'products', // global, gtin-dedupe
  'productNutrients',
  'productFieldSources',
  'productStores',
  'categoryMappings',
  'expiryConfig',
  'locations',
  'storages',
  'places',
  'inventoryItems',
  'stockTargets',
  'productPrices',
  'shoppingListItems',
  'shoppingTrips',
  'shoppingTripItems',
]

/** Referenzdaten: werden nie exportiert, am Ziel per natuerlichem Schluessel
 *  (slug/symbol) aufgeloest. Der Ziel-Seed (seedLocal) hat sie bereits. */
export const REFERENCE_TABLES = ['categories', 'nutrientTypes'] as const

/** Tabellen, die NIE in ein Export-File gehoeren (Identitaet/Auth, transiente
 *  Logs, re-derivierbare Landing-Zone, App-lokale Guard-Tabelle). */
export const NEVER_EXPORT = [
  'users',
  'sessions',
  'accounts',
  'verifications',
  'households',
  'householdMembers',
  'invites',
  'auditLog',
  'bringSync',
  'globusSnapshots',
  'meta',
] as const

// ---------------------------------------------------------------------------
// Tier-Definitionen (minimal -> maximal, jeweils FK-geschlossen)
// ---------------------------------------------------------------------------

const TIER_STAMMDATEN: TransferTable[] = [
  'units',
  'stores',
  'products',
  'productNutrients',
  'productFieldSources',
  'productStores',
  'categoryMappings',
  'expiryConfig',
]

const TIER_ORTE_INVENTAR: TransferTable[] = [
  ...TIER_STAMMDATEN,
  'locations',
  'storages',
  'places',
  'inventoryItems',
  'stockTargets',
]

const TIER_EINKAUF: TransferTable[] = [
  ...TIER_ORTE_INVENTAR,
  'productPrices',
  'shoppingListItems',
  'shoppingTrips',
  'shoppingTripItems',
]

/** Welche Tabellen jeder Tier umfasst. `alles` ist heute deckungsgleich mit
 *  `einkauf`, hat aber einen eigenen Namen fuer kuenftiges Wachstum. */
export const TIER_TABLES: Record<ExportTier, TransferTable[]> = {
  stammdaten: TIER_STAMMDATEN,
  'orte-inventar': TIER_ORTE_INVENTAR,
  einkauf: TIER_EINKAUF,
  alles: [...TIER_EINKAUF],
}

/** Menschliche Beschreibung der Tiers fuer die UI (minimal -> maximal). */
export const TIER_META: Array<{ id: ExportTier; title: string; desc: string }> = [
  {
    id: 'stammdaten',
    title: 'Stammdaten',
    desc: 'Artikel, Maerkte, eigene Einheiten, Kategorie-Regeln, MHD-Toleranzen. Ohne Orte, Bestand und Einkauf.',
  },
  {
    id: 'orte-inventar',
    title: '+ Orte & Bestand',
    desc: 'Zusaetzlich Orte (Raum/Schrank/Fach), der aktuelle Bestand und Soll-Bestaende.',
  },
  {
    id: 'einkauf',
    title: '+ Einkauf',
    desc: 'Zusaetzlich Preise, Einkaufsliste und Einkaufs-Runs.',
  },
  {
    id: 'alles',
    title: 'Alles',
    desc: 'Der komplette uebertragbare Datenbestand.',
  },
]

// ---------------------------------------------------------------------------
// FK-Deskriptor
// ---------------------------------------------------------------------------
// Pro Tabelle: welche Spalte auf welche Ziel-Tabelle zeigt. `kind`:
//   'id'        — zeigt auf eine im Transfer enthaltene Tabelle (idMap-Rewrite)
//   'household' — household_id -> targetHouseholdId
//   'user'      — created_by/user_id/reviewed_by -> targetUserId
//   'refCategory'/'refNutrientType'/'refUnit' — Referenzdaten, per Sidecar-Slug
//                 aufloesen (nicht via idMap)
// `nullable` steuert, was bei nicht aufloesbarer Referenz passiert:
//   nullable=true  -> auf null setzen + Warnung
//   nullable=false -> Zeile ueberspringen + Warnung

export type FkKind =
  | 'id'
  | 'household'
  | 'user'
  | 'refCategory'
  | 'refNutrientType'
  | 'refUnit'

export interface FkCol {
  col: string
  kind: FkKind
  target?: TransferTable // nur bei kind==='id'
  nullable: boolean
}

export const FK_DESCRIPTOR: Record<TransferTable, FkCol[]> = {
  units: [{ col: 'householdId', kind: 'household', nullable: true }],
  stores: [{ col: 'householdId', kind: 'household', nullable: false }],
  products: [
    { col: 'categoryId', kind: 'refCategory', nullable: true },
    { col: 'createdBy', kind: 'user', nullable: true },
  ],
  productNutrients: [
    { col: 'productId', kind: 'id', target: 'products', nullable: false },
    { col: 'nutrientTypeId', kind: 'refNutrientType', nullable: false },
  ],
  productFieldSources: [{ col: 'productId', kind: 'id', target: 'products', nullable: false }],
  productStores: [
    { col: 'productId', kind: 'id', target: 'products', nullable: false },
    { col: 'storeId', kind: 'id', target: 'stores', nullable: false },
    { col: 'householdId', kind: 'household', nullable: false },
  ],
  categoryMappings: [
    { col: 'householdId', kind: 'household', nullable: false },
    { col: 'categoryId', kind: 'refCategory', nullable: false },
  ],
  expiryConfig: [{ col: 'householdId', kind: 'household', nullable: false }],
  locations: [{ col: 'householdId', kind: 'household', nullable: false }],
  storages: [{ col: 'locationId', kind: 'id', target: 'locations', nullable: false }],
  places: [{ col: 'storageId', kind: 'id', target: 'storages', nullable: false }],
  inventoryItems: [
    { col: 'productId', kind: 'id', target: 'products', nullable: false },
    { col: 'placeId', kind: 'id', target: 'places', nullable: true },
    { col: 'householdId', kind: 'household', nullable: false },
    { col: 'storeId', kind: 'id', target: 'stores', nullable: true },
  ],
  stockTargets: [
    { col: 'householdId', kind: 'household', nullable: false },
    { col: 'productId', kind: 'id', target: 'products', nullable: false },
    { col: 'preferredPlaceId', kind: 'id', target: 'places', nullable: true },
    { col: 'preferredStoreId', kind: 'id', target: 'stores', nullable: true },
  ],
  productPrices: [
    { col: 'householdId', kind: 'household', nullable: false },
    { col: 'productId', kind: 'id', target: 'products', nullable: false },
    { col: 'storeId', kind: 'id', target: 'stores', nullable: false },
    { col: 'createdBy', kind: 'user', nullable: true },
  ],
  shoppingListItems: [
    { col: 'householdId', kind: 'household', nullable: false },
    { col: 'productId', kind: 'id', target: 'products', nullable: true },
    { col: 'preferredStoreId', kind: 'id', target: 'stores', nullable: true },
  ],
  shoppingTrips: [
    { col: 'householdId', kind: 'household', nullable: false },
    { col: 'storeId', kind: 'id', target: 'stores', nullable: true },
  ],
  shoppingTripItems: [
    { col: 'tripId', kind: 'id', target: 'shoppingTrips', nullable: false },
    { col: 'householdId', kind: 'household', nullable: false },
    { col: 'shoppingListItemId', kind: 'id', target: 'shoppingListItems', nullable: false },
    { col: 'productId', kind: 'id', target: 'products', nullable: true },
  ],
}

// ---------------------------------------------------------------------------
// Cross-Dialekt Wert-Normalisierung
// ---------------------------------------------------------------------------
// Der App-Dialekt (SQLite, timestamp_ms) und der Pi-Dialekt (Postgres,
// timestamp) liefern beide `Date` in JS. Fuers File normalisieren wir Dates zu
// epoch-ms (number). Welche Spalten Dates sind, leiten wir zur Laufzeit aus dem
// drizzle-Schema ab (getTableColumns -> columnType/dataType), damit die Liste
// nie gegenueber dem Schema driftet.

export type ColumnTypeMap = Record<string, 'date' | 'other'>

/**
 * Baut fuer eine drizzle-Table die Spalten-Typ-Map (Spaltenname -> 'date'|'other').
 * Date-Spalten sind jene mit dataType 'date' (drizzle mappt sowohl PG timestamp
 * als auch SQLite timestamp_ms darauf).
 */
export function buildColumnTypeMap(table: unknown): ColumnTypeMap {
  const cols = getTableColumns(table as never) as Record<string, { dataType?: string }>
  const map: ColumnTypeMap = {}
  for (const [name, col] of Object.entries(cols)) {
    map[name] = col?.dataType === 'date' ? 'date' : 'other'
  }
  return map
}

/** Export-Richtung: Date -> epoch-ms; alles andere pass-through. */
export function encodeRow(
  row: Record<string, unknown>,
  types: ColumnTypeMap
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) {
    if (v instanceof Date) {
      out[k] = v.getTime()
    } else if (types[k] === 'date' && typeof v === 'number') {
      // bereits ms (defensiv)
      out[k] = v
    } else {
      out[k] = v
    }
  }
  return out
}

/** Import-Richtung: epoch-ms -> Date fuer Date-Spalten; sonst pass-through. */
export function decodeRow(
  row: Record<string, unknown>,
  types: ColumnTypeMap
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) {
    if (types[k] === 'date' && v != null) {
      out[k] = v instanceof Date ? v : new Date(v as number)
    } else {
      out[k] = v
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Envelope (De-)Serialisierung
// ---------------------------------------------------------------------------

export function buildEnvelope(input: {
  sourceSystem: SourceSystem
  scope: ExportTier
  exportedAt: string
  tables: Partial<Record<TransferTable, Array<Record<string, unknown>>>>
  refs: RefSidecar
}): StoqrExport {
  return {
    formatVersion: TRANSFER_FORMAT_VERSION,
    exportedAt: input.exportedAt,
    sourceSystem: input.sourceSystem,
    scope: input.scope,
    tables: input.tables,
    refs: input.refs,
  }
}

export function serializeEnvelope(env: StoqrExport): string {
  return JSON.stringify(env)
}

/** Parst + validiert grob ein .stoqr-File. Wirft bei falschem/fehlendem Format. */
export function parseEnvelope(text: string): StoqrExport {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('Datei ist kein gueltiges JSON (.stoqr erwartet).')
  }
  const env = parsed as Partial<StoqrExport>
  if (!env || typeof env !== 'object') {
    throw new Error('Datei enthaelt kein stoqr-Export-Objekt.')
  }
  if (env.formatVersion !== TRANSFER_FORMAT_VERSION) {
    throw new Error(
      `Nicht unterstuetzte Format-Version: ${String(env.formatVersion)} (erwartet ${TRANSFER_FORMAT_VERSION}).`
    )
  }
  if (env.sourceSystem !== 'pi' && env.sourceSystem !== 'app') {
    throw new Error('Feld sourceSystem fehlt oder ist ungueltig.')
  }
  if (!env.tables || typeof env.tables !== 'object') {
    throw new Error('Feld tables fehlt.')
  }
  // refs-Sidecar defensiv auffuellen (aeltere/teilweise Files).
  const refs: RefSidecar = {
    categories: env.refs?.categories ?? {},
    nutrientTypes: env.refs?.nutrientTypes ?? {},
    units: env.refs?.units ?? {},
  }
  return {
    formatVersion: TRANSFER_FORMAT_VERSION,
    exportedAt: typeof env.exportedAt === 'string' ? env.exportedAt : '',
    sourceSystem: env.sourceSystem,
    scope: (env.scope as ExportTier) ?? 'alles',
    tables: env.tables as StoqrExport['tables'],
    refs,
  }
}

// ---------------------------------------------------------------------------
// ID-Remapping (der Kern)
// ---------------------------------------------------------------------------

export interface RemapInput {
  envelope: StoqrExport
  targetHouseholdId: string
  targetUserId: string
  /** gtin -> vorhandene lokale product-id (Dedup). */
  existingProductsByGtin: Map<string, string>
  /** Referenz-Aufloesung am Ziel: natuerlicher Schluessel -> lokale id. */
  referenceIds: {
    categoryBySlug: Map<string, string>
    nutrientTypeBySlug: Map<string, string>
    unitBySymbol: Map<string, string>
  }
  /** ID-Generator (Injektion, damit der Kern testbar/deterministisch bleibt). */
  newId: () => string
}

export interface RemapResult {
  /** Einzufuegende Zeilen je Tabelle, in TRANSFER_TABLE_ORDER, FK-umgeschrieben. */
  inserts: Partial<Record<TransferTable, Array<Record<string, unknown>>>>
  /** Wiederverwendete (nicht eingefuegte) Produkte: srcId -> lokale id. */
  reusedProductIds: Map<string, string>
  /** Menschenlesbare Warnungen (fehlende Referenzen, uebersprungene Zeilen). */
  warnings: string[]
}

/**
 * Rechnet die Zeilen eines Envelopes auf die Ziel-Identitaet um. Reine Funktion
 * (kein DB-Zugriff): baut old-id -> new-id-Maps in Dependency-Reihenfolge auf und
 * schreibt alle FKs um. Self-Refs entfallen, weil Referenzdaten nie eingefuegt,
 * nur per Slug aufgeloest werden.
 */
export function remapImport(input: RemapInput): RemapResult {
  const { envelope, targetHouseholdId, targetUserId, existingProductsByGtin, referenceIds, newId } =
    input

  const warnings: string[] = []
  const inserts: Partial<Record<TransferTable, Array<Record<string, unknown>>>> = {}
  // idMap[table] = Map<srcId, localId>
  const idMap = new Map<TransferTable, Map<string, string>>()
  const reusedProductIds = new Map<string, string>()

  const refs = envelope.refs

  const resolveRef = (
    kind: 'refCategory' | 'refNutrientType' | 'refUnit',
    srcId: unknown
  ): string | null => {
    if (srcId == null) return null
    const src = String(srcId)
    if (kind === 'refCategory') {
      const slug = refs.categories[src]
      if (slug == null) return null
      return referenceIds.categoryBySlug.get(slug) ?? null
    }
    if (kind === 'refNutrientType') {
      const slug = refs.nutrientTypes[src]
      if (slug == null) return null
      return referenceIds.nutrientTypeBySlug.get(slug) ?? null
    }
    const sym = refs.units[src]
    if (sym == null) return null
    return referenceIds.unitBySymbol.get(sym) ?? null
  }

  // ---- Pass C: products zuerst separat (global, gtin-dedupe) ----------------
  const productRows = envelope.tables.products ?? []
  const productIdMap = new Map<string, string>()
  const productInserts: Array<Record<string, unknown>> = []
  for (const row of productRows) {
    const srcId = String(row.id)
    const gtin = row.gtin == null ? null : String(row.gtin)
    if (gtin && existingProductsByGtin.has(gtin)) {
      // vorhandenes Produkt wiederverwenden — nicht einfuegen.
      const localId = existingProductsByGtin.get(gtin)!
      productIdMap.set(srcId, localId)
      reusedProductIds.set(srcId, localId)
      continue
    }
    const localId = newId()
    productIdMap.set(srcId, localId)
    const out: Record<string, unknown> = { ...row, id: localId }
    // categoryId per Sidecar aufloesen (nullable -> null + Warnung).
    if ('categoryId' in out) {
      const resolved = resolveRef('refCategory', row.categoryId)
      if (row.categoryId != null && resolved == null) {
        warnings.push(
          `Produkt "${String(row.name ?? srcId)}": Kategorie unbekannt am Ziel — ohne Kategorie importiert.`
        )
      }
      out.categoryId = resolved
    }
    if ('createdBy' in out) out.createdBy = targetUserId
    productInserts.push(out)
  }
  if (productRows.length) {
    idMap.set('products', productIdMap)
    inserts.products = productInserts
  }

  // ---- Pass D: restliche Tabellen in Dependency-Reihenfolge -----------------
  for (const table of TRANSFER_TABLE_ORDER) {
    if (table === 'products') continue // schon behandelt
    const rows = envelope.tables[table]
    if (!rows || !rows.length) continue

    const fks = FK_DESCRIPTOR[table]
    const localMap = new Map<string, string>()
    idMap.set(table, localMap)
    const tableInserts: Array<Record<string, unknown>> = []

    for (const row of rows) {
      const srcId = String(row.id)
      const localId = newId()
      const out: Record<string, unknown> = { ...row, id: localId }

      let skip = false
      for (const fk of fks) {
        if (!(fk.col in out)) continue
        const srcVal = row[fk.col]

        if (fk.kind === 'household') {
          out[fk.col] = targetHouseholdId
          continue
        }
        if (fk.kind === 'user') {
          out[fk.col] = srcVal == null ? null : targetUserId
          continue
        }
        if (fk.kind === 'refCategory' || fk.kind === 'refNutrientType' || fk.kind === 'refUnit') {
          const resolved = resolveRef(fk.kind, srcVal)
          if (srcVal != null && resolved == null) {
            if (fk.nullable) {
              warnings.push(
                `${table}: Referenz (${fk.col}) unbekannt am Ziel — Feld geleert.`
              )
              out[fk.col] = null
            } else {
              warnings.push(
                `${table}: Referenz (${fk.col}) unbekannt am Ziel — Zeile uebersprungen.`
              )
              skip = true
              break
            }
          } else {
            out[fk.col] = resolved
          }
          continue
        }
        // kind === 'id': via idMap der Ziel-Tabelle umschreiben.
        if (srcVal == null) {
          out[fk.col] = null
          continue
        }
        const targetMap = fk.target ? idMap.get(fk.target) : undefined
        const mapped = targetMap?.get(String(srcVal))
        if (mapped == null) {
          if (fk.nullable) {
            warnings.push(
              `${table}: Verweis (${fk.col}) nicht im Import enthalten — Feld geleert.`
            )
            out[fk.col] = null
          } else {
            warnings.push(
              `${table}: Verweis (${fk.col}) nicht im Import enthalten — Zeile uebersprungen.`
            )
            skip = true
            break
          }
        } else {
          out[fk.col] = mapped
        }
      }

      if (skip) {
        localMap.delete(srcId) // sicherstellen, dass Kinder darauf nicht mappen
        continue
      }
      localMap.set(srcId, localId)
      tableInserts.push(out)
    }

    if (tableInserts.length) inserts[table] = tableInserts
  }

  return { inserts, reusedProductIds, warnings }
}
