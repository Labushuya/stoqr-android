// ---------------------------------------------------------------------------
// transfer.roundtrip.test.ts — Import/Export-Kern (dialekt-neutral)
// ---------------------------------------------------------------------------
// Testet den PUREN Kern aus @stoqr/db (transfer.ts) ohne DB: Envelope
// build/parse-Identitaet inkl. Date-ms-Roundtrip, remapImport auf die lokale
// Identitaet (Pi-UUIDs -> local-*), GTIN-Dedup, Referenz-Aufloesung per Sidecar,
// FK-Umschreibung, Tier-FK-Closure + Registry-Invarianten gegen beide Schemas.

import { describe, expect, it } from 'vitest'
import {
  FK_DESCRIPTOR,
  NEVER_EXPORT,
  REFERENCE_TABLES,
  TIER_TABLES,
  TRANSFER_TABLE_ORDER,
  buildColumnTypeMap,
  buildEnvelope,
  decodeRow,
  encodeRow,
  parseEnvelope,
  remapImport,
  serializeEnvelope,
  type RefSidecar,
  type StoqrExport,
  type TransferTable,
} from '@stoqr/db'
import * as pgSchema from '@stoqr/db'
import { sqliteSchema } from '@stoqr/db/sqlite'
import { LOCAL_HOUSEHOLD_ID, LOCAL_USER_ID } from '@stoqr/db/sqlite'

// deterministischer ID-Generator (kein Math.random -> reproduzierbar)
function seqIds(prefix = 'new') {
  let n = 0
  return () => `${prefix}-${++n}`
}

const EMPTY_REFS: RefSidecar = { categories: {}, nutrientTypes: {}, units: {} }

describe('transfer — Registry-Invarianten', () => {
  it('NEVER_EXPORT und TIER-Tabellen sind disjunkt', () => {
    const never = new Set<string>(NEVER_EXPORT as readonly string[])
    for (const [tier, tables] of Object.entries(TIER_TABLES)) {
      for (const t of tables) {
        expect(never.has(t), `${t} in Tier ${tier} darf nicht in NEVER_EXPORT sein`).toBe(false)
      }
    }
  })

  it('Referenzdaten sind aus keinem Tier enthalten', () => {
    const refs = new Set<string>(REFERENCE_TABLES as readonly string[])
    for (const [tier, tables] of Object.entries(TIER_TABLES)) {
      for (const t of tables) {
        expect(refs.has(t), `Referenztabelle ${t} darf nicht in Tier ${tier} liegen`).toBe(false)
      }
    }
  })

  it('jeder Tier ist eine Teilmenge von TRANSFER_TABLE_ORDER', () => {
    const order = new Set<string>(TRANSFER_TABLE_ORDER)
    for (const [tier, tables] of Object.entries(TIER_TABLES)) {
      for (const t of tables) {
        expect(order.has(t), `${t} (Tier ${tier}) fehlt in TRANSFER_TABLE_ORDER`).toBe(true)
      }
    }
  })

  it('Tiers sind FK-geschlossen (jede id-Ziel-Tabelle liegt im selben Tier)', () => {
    for (const [tier, tables] of Object.entries(TIER_TABLES)) {
      const present = new Set<string>(tables)
      for (const t of tables) {
        for (const fk of FK_DESCRIPTOR[t as TransferTable]) {
          if (fk.kind === 'id' && fk.target) {
            expect(
              present.has(fk.target),
              `${t}.${fk.col} -> ${fk.target} fehlt in Tier ${tier}`
            ).toBe(true)
          }
        }
      }
    }
  })

  it('jeder TRANSFER_TABLE_ORDER-Name existiert in beiden Schemas', () => {
    for (const name of TRANSFER_TABLE_ORDER) {
      expect((sqliteSchema as Record<string, unknown>)[name], `${name} fehlt im SQLite-Schema`).toBeDefined()
      expect((pgSchema as Record<string, unknown>)[name], `${name} fehlt im Postgres-Schema`).toBeDefined()
    }
  })

  it('REFERENCE_TABLES existieren in beiden Schemas', () => {
    for (const name of REFERENCE_TABLES) {
      expect((sqliteSchema as Record<string, unknown>)[name]).toBeDefined()
      expect((pgSchema as Record<string, unknown>)[name]).toBeDefined()
    }
  })
})

describe('transfer — encode/decode (Date <-> epoch-ms)', () => {
  it('Date-Spalten werden zu ms und zurueck (verlustfrei)', () => {
    const types = buildColumnTypeMap(sqliteSchema.inventoryItems)
    // inventory_items hat createdAt/updatedAt/openedAt/consumedAt als timestamp_ms.
    expect(types.createdAt).toBe('date')
    expect(types.updatedAt).toBe('date')
    const dateCols = Object.entries(types).filter(([, k]) => k === 'date').map(([c]) => c)
    expect(dateCols.length).toBeGreaterThan(0)

    const now = new Date('2026-01-02T03:04:05.678Z')
    const row = { id: 'x', quantity: 3, createdAt: now }
    const enc = encodeRow(row, types)
    expect(typeof enc.createdAt).toBe('number')
    expect(enc.createdAt).toBe(now.getTime())
    expect(enc.quantity).toBe(3)

    const dec = decodeRow(enc, types)
    expect(dec.createdAt).toBeInstanceOf(Date)
    expect((dec.createdAt as Date).getTime()).toBe(now.getTime())
    expect(dec.quantity).toBe(3)
  })

  it('Nicht-Date-Werte bleiben unveraendert', () => {
    const types = buildColumnTypeMap(sqliteSchema.products)
    const row = { id: 'p', name: 'Milch', gtin: '40001234', offData: { brands: 'x' } }
    const enc = encodeRow(row, types)
    expect(enc).toEqual(row)
    const dec = decodeRow(enc, types)
    expect(dec).toEqual(row)
  })
})

describe('transfer — Envelope build/parse-Identitaet', () => {
  it('serialize -> parse ergibt denselben Envelope', () => {
    const env = buildEnvelope({
      sourceSystem: 'pi',
      scope: 'alles',
      exportedAt: '2026-08-16T10:00:00.000Z',
      tables: {
        products: [{ id: 'src-p1', name: 'Milch', gtin: '40001234' }],
        stores: [{ id: 'src-s1', name: 'Globus', householdId: 'pi-hh' }],
      },
      refs: { categories: { 'src-cat1': 'milchprodukte' }, nutrientTypes: {}, units: {} },
    })
    const back = parseEnvelope(serializeEnvelope(env))
    expect(back).toEqual(env)
  })

  it('parseEnvelope wirft bei falscher Format-Version', () => {
    const bad = JSON.stringify({ formatVersion: 99, sourceSystem: 'pi', tables: {} })
    expect(() => parseEnvelope(bad)).toThrow(/Format-Version/)
  })

  it('parseEnvelope wirft bei fehlendem sourceSystem', () => {
    const bad = JSON.stringify({ formatVersion: 1, tables: {} })
    expect(() => parseEnvelope(bad)).toThrow(/sourceSystem/)
  })

  it('parseEnvelope fuellt fehlendes refs-Sidecar defensiv', () => {
    const bad = JSON.stringify({
      formatVersion: 1,
      sourceSystem: 'app',
      scope: 'stammdaten',
      exportedAt: '2026-08-16T00:00:00.000Z',
      tables: {},
    })
    const env = parseEnvelope(bad)
    expect(env.refs).toEqual(EMPTY_REFS)
  })
})

// Synthetischer Pi-Datensatz (echte UUID-artige IDs) fuer den Remap-Kern.
function piEnvelope(): StoqrExport {
  return buildEnvelope({
    sourceSystem: 'pi',
    scope: 'alles',
    exportedAt: '2026-08-16T10:00:00.000Z',
    tables: {
      stores: [{ id: 'pi-store-1', name: 'Globus', householdId: 'pi-hh' }],
      products: [
        // vorhanden am Ziel (per gtin), muss wiederverwendet werden
        { id: 'pi-prod-A', name: 'Butter', gtin: 'GTIN-EXISTING', categoryId: 'pi-cat-1', createdBy: 'pi-user' },
        // neue GTIN -> frisch einfuegen, categoryId per refs-Slug aufloesen
        { id: 'pi-prod-B', name: 'Joghurt', gtin: 'GTIN-NEW', categoryId: 'pi-cat-1', createdBy: 'pi-user' },
        // Kategorie am Ziel unbekannt -> null + Warnung (nullable)
        { id: 'pi-prod-C', name: 'Exotik', gtin: 'GTIN-C', categoryId: 'pi-cat-UNKNOWN', createdBy: 'pi-user' },
      ],
      locations: [{ id: 'pi-loc-1', name: 'Kueche', householdId: 'pi-hh' }],
      storages: [{ id: 'pi-sto-1', name: 'Schrank', locationId: 'pi-loc-1' }],
      places: [{ id: 'pi-place-1', name: 'Fach 1', storageId: 'pi-sto-1' }],
      inventoryItems: [
        {
          id: 'pi-inv-1',
          productId: 'pi-prod-B',
          placeId: 'pi-place-1',
          householdId: 'pi-hh',
          storeId: 'pi-store-1',
          quantity: 2,
          addedAt: new Date('2026-05-01T00:00:00.000Z'),
        },
        // productId zeigt auf das dedup-wiederverwendete Produkt A
        {
          id: 'pi-inv-2',
          productId: 'pi-prod-A',
          placeId: null,
          householdId: 'pi-hh',
          storeId: null,
          quantity: 1,
          addedAt: new Date('2026-05-02T00:00:00.000Z'),
        },
      ],
      productNutrients: [
        // nutrient_type unbekannt am Ziel + nicht-nullbar -> Zeile ueberspringen
        { id: 'pi-pn-1', productId: 'pi-prod-B', nutrientTypeId: 'pi-nt-UNKNOWN', value: 3.2 },
      ],
    },
    refs: {
      categories: { 'pi-cat-1': 'milchprodukte' },
      nutrientTypes: {},
      units: {},
    },
  })
}

describe('transfer — remapImport (Pi -> lokale Identitaet)', () => {
  const referenceIds = {
    categoryBySlug: new Map([['milchprodukte', 'local-cat-milch']]),
    nutrientTypeBySlug: new Map<string, string>(), // pi-nt-UNKNOWN nicht aufloesbar
    unitBySymbol: new Map<string, string>(),
  }
  const existingProductsByGtin = new Map([['GTIN-EXISTING', 'local-prod-existing']])

  function run() {
    return remapImport({
      envelope: piEnvelope(),
      targetHouseholdId: LOCAL_HOUSEHOLD_ID,
      targetUserId: LOCAL_USER_ID,
      existingProductsByGtin,
      referenceIds,
      newId: seqIds(),
    })
  }

  it('GTIN-Match behaelt die lokale id + wird als Insert eingeplant', () => {
    const { inserts, reusedProductIds } = run()
    // A (GTIN-EXISTING) wird mit der BESTEHENDEN lokalen id eingeplant (Option B):
    // wipeUserContent loescht global alle Produkte, daher muss auch das
    // wiederverwendete Produkt neu eingefuegt werden, sonst haengen die FKs.
    const byGtin = new Map((inserts.products ?? []).map((r) => [r.gtin, r]))
    expect(byGtin.has('GTIN-EXISTING')).toBe(true)
    expect(byGtin.get('GTIN-EXISTING')!.id).toBe('local-prod-existing')
    // Alle drei Produkte sind eingeplant: A (reuse), B (neu), C (neue GTIN).
    const insertedGtins = (inserts.products ?? []).map((r) => r.gtin)
    expect(insertedGtins.sort()).toEqual(['GTIN-C', 'GTIN-EXISTING', 'GTIN-NEW'])
    expect(reusedProductIds.get('pi-prod-A')).toBe('local-prod-existing')
  })

  it('household_id/created_by werden auf die lokale Identitaet gesetzt', () => {
    const { inserts } = run()
    for (const r of inserts.stores ?? []) expect(r.householdId).toBe(LOCAL_HOUSEHOLD_ID)
    for (const r of inserts.locations ?? []) expect(r.householdId).toBe(LOCAL_HOUSEHOLD_ID)
    for (const r of inserts.products ?? []) expect(r.createdBy).toBe(LOCAL_USER_ID)
    for (const r of inserts.inventoryItems ?? []) expect(r.householdId).toBe(LOCAL_HOUSEHOLD_ID)
  })

  it('categoryId wird via refs-Slug aufgeloest bzw. genullt bei Unbekannt', () => {
    const { inserts, warnings } = run()
    const byGtin = new Map((inserts.products ?? []).map((r) => [r.gtin, r]))
    expect(byGtin.get('GTIN-NEW')!.categoryId).toBe('local-cat-milch')
    expect(byGtin.get('GTIN-C')!.categoryId).toBeNull()
    expect(warnings.some((w) => /Kategorie/.test(w))).toBe(true)
  })

  it('FK-IDs (place_id, product_id, store_id) werden konsistent umgeschrieben', () => {
    const { inserts, reusedProductIds } = run()
    const places = inserts.places ?? []
    const localPlaceId = places[0].id as string
    const localStoreId = (inserts.stores ?? [])[0].id as string
    const newProdByGtin = new Map((inserts.products ?? []).map((r) => [r.gtin, r.id as string]))
    const localProdB = newProdByGtin.get('GTIN-NEW')!

    const inv = inserts.inventoryItems ?? []
    const inv1 = inv.find((r) => r.quantity === 2)!
    const inv2 = inv.find((r) => r.quantity === 1)!

    expect(inv1.productId).toBe(localProdB)
    expect(inv1.placeId).toBe(localPlaceId)
    expect(inv1.storeId).toBe(localStoreId)
    // inv2 zeigt auf das wiederverwendete Produkt A + null-FKs bleiben null
    expect(inv2.productId).toBe(reusedProductIds.get('pi-prod-A'))
    expect(inv2.placeId).toBeNull()
    expect(inv2.storeId).toBeNull()
  })

  it('nicht-nullbare Ref-FK unbekannt -> Zeile uebersprungen + Warnung', () => {
    const { inserts, warnings } = run()
    // product_nutrients-Zeile mit unbekanntem nutrient_type wird gedroppt
    expect(inserts.productNutrients ?? []).toHaveLength(0)
    expect(warnings.some((w) => /uebersprungen/.test(w))).toBe(true)
  })

  it('KEINE Ausgabe-ID referenziert eine Quell-ID', () => {
    const { inserts } = run()
    const srcIds = new Set<string>()
    const env = piEnvelope()
    for (const rows of Object.values(env.tables)) {
      for (const r of rows ?? []) srcIds.add(String((r as { id: unknown }).id))
    }
    for (const rows of Object.values(inserts)) {
      for (const r of rows ?? []) {
        // id selbst darf keine Quell-id sein. Auch das GTIN-wiederverwendete
        // Produkt ist jetzt in inserts.products (Option B), traegt aber die
        // LOKALE id (local-prod-existing) — also ebenfalls keine Quell-id.
        expect(srcIds.has(String((r as { id: unknown }).id))).toBe(false)
        // und kein FK-Wert darf eine Quell-id sein
        for (const [, v] of Object.entries(r)) {
          if (typeof v === 'string') expect(srcIds.has(v)).toBe(false)
        }
      }
    }
  })
})
