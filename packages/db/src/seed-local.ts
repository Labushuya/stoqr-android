// ---------------------------------------------------------------------------
// First-Launch-Seeding (App / On-Device SQLite)
// ---------------------------------------------------------------------------
// Laeuft einmalig beim ersten App-Start (Capacitor), NACHDEM die DDL angelegt
// wurde. Legt die lokale Identitaet + Werkszustand an, damit die App sofort
// offline nutzbar ist:
//   - lokaler Haushalt (LOCAL_HOUSEHOLD_ID) + lokaler Bypass-User (LOCAL_USER_ID)
//   - Kategorien (alle Wurzeln, parentId=null)
//   - Naehrwert-Typen (zwei Pass: Wurzeln zuerst, Kinder per slug->id)
//   - 9 System-Einheiten (household_id=null, is_system=true)
//   - meta-Guard (schema_version, seeded_at) -> Re-Run ist No-Op
//
// Alle IDs werden client-seitig via crypto.randomUUID() erzeugt (kollisionsfrei
// gegenueber dem Pi -> Sync-Fundament). Alle Inserts sind idempotent
// (onConflictDoNothing), das Ganance laeuft in EINER Transaktion.

import { eq } from 'drizzle-orm'
import type { SqliteDatabase } from './client.sqlite'
import { users, households, categories, nutrientTypes, units, meta } from './schema.sqlite'
import { categorySeeds } from '../seeds/categories'
import { nutrientTypeSeeds } from '../seeds/nutrient-types'

// Feste lokale Identitaet der Standalone-App. Der Pi hat andere IDs; beim
// spaeteren Sync werden Auth-Tabellen NICHT als Daten gesynct (die App haelt
// ihren eigenen Bypass-User + Haushalt).
export const LOCAL_HOUSEHOLD_ID = 'local-household'
export const LOCAL_USER_ID = 'local-user'

export const SCHEMA_VERSION = '1'

// Die 9 System-Einheiten (Quelle: Pi-Migration 0018_seed_system_units.sql).
// household_id=null, is_system=true. toBaseFactor als String (numeric->text).
const SYSTEM_UNITS: Array<{
  name: string
  symbol: string
  sortOrder: number
  dimension: 'mass' | 'volume' | 'count'
  toBaseFactor: string
}> = [
  { name: 'Stück', symbol: 'piece', sortOrder: 1, dimension: 'count', toBaseFactor: '1' },
  { name: 'Gramm', symbol: 'g', sortOrder: 2, dimension: 'mass', toBaseFactor: '1' },
  { name: 'Kilogramm', symbol: 'kg', sortOrder: 3, dimension: 'mass', toBaseFactor: '1000' },
  { name: 'Milliliter', symbol: 'ml', sortOrder: 4, dimension: 'volume', toBaseFactor: '1' },
  { name: 'Liter', symbol: 'l', sortOrder: 5, dimension: 'volume', toBaseFactor: '1000' },
  { name: 'Packung', symbol: 'Packung', sortOrder: 6, dimension: 'count', toBaseFactor: '1' },
  { name: 'Dose', symbol: 'Dose', sortOrder: 7, dimension: 'count', toBaseFactor: '1' },
  { name: 'Flasche', symbol: 'Flasche', sortOrder: 8, dimension: 'count', toBaseFactor: '1' },
  { name: 'Tetrapak', symbol: 'Tetrapak', sortOrder: 9, dimension: 'count', toBaseFactor: '1' },
]

/**
 * Ist die DB bereits geseedet? Prueft die meta-Guard-Zeile.
 */
export async function isSeeded(db: SqliteDatabase): Promise<boolean> {
  const row = await db.query.meta.findFirst({ where: eq(meta.key, 'seeded_at') })
  return Boolean(row?.value)
}

/**
 * First-Launch-Seeding. Idempotent: ist die meta-Guard-Zeile gesetzt, No-Op.
 * Der Aufrufer (App-Layer) stellt sicher, dass die DDL vorher lief.
 */
export async function seedLocal(db: SqliteDatabase): Promise<void> {
  if (await isSeeded(db)) return

  // 1) Lokaler Bypass-User (aeltester User -> Bypass-Identitaet, spiegelt Pi).
  await db
    .insert(users)
    .values({
      id: LOCAL_USER_ID,
      username: 'local',
      displayName: 'Lokal',
      emailVerified: false,
      isActive: true,
      locale: 'de-DE',
    })
    .onConflictDoNothing({ target: users.id })

  // 2) Lokaler Haushalt.
  await db
    .insert(households)
    .values({
      id: LOCAL_HOUSEHOLD_ID,
      name: 'Die Merbotts',
      createdBy: LOCAL_USER_ID,
    })
    .onConflictDoNothing({ target: households.id })

  // 3) Kategorien — alle Wurzeln (parentId=null).
  await db
    .insert(categories)
    .values(
      categorySeeds.map((s) => ({
        id: crypto.randomUUID(),
        slug: s.slug,
        name: s.name,
        icon: s.icon,
        defaultExpiryToleranceDays: s.defaultExpiryToleranceDays ?? 0,
        sortOrder: s.sortOrder,
        parentId: null,
      }))
    )
    .onConflictDoNothing({ target: categories.slug })

  // 4) Naehrwert-Typen — Pass 1: Wurzeln, Pass 2: Kinder per slug->id.
  const rootSeeds = nutrientTypeSeeds.filter((s) => s.parentSlug === null)
  await db
    .insert(nutrientTypes)
    .values(
      rootSeeds.map((s) => ({
        id: crypto.randomUUID(),
        slug: s.slug,
        name: s.name,
        unit: s.unit,
        parentId: null,
        sortOrder: s.sortOrder,
        offKey: s.offKey,
      }))
    )
    .onConflictDoNothing({ target: nutrientTypes.slug })

  const childSeeds = nutrientTypeSeeds.filter((s) => s.parentSlug !== null)
  if (childSeeds.length > 0) {
    const inserted = await db.query.nutrientTypes.findMany()
    const slugToId = new Map(inserted.map((r) => [r.slug, r.id]))
    await db
      .insert(nutrientTypes)
      .values(
        childSeeds.map((s) => {
          const parentId = slugToId.get(s.parentSlug!)
          if (!parentId) {
            throw new Error(
              `seed-local nutrient_types: parentSlug "${s.parentSlug}" fuer "${s.slug}" nicht aufloesbar`
            )
          }
          return {
            id: crypto.randomUUID(),
            slug: s.slug,
            name: s.name,
            unit: s.unit,
            parentId,
            sortOrder: s.sortOrder,
            offKey: s.offKey,
          }
        })
      )
      .onConflictDoNothing({ target: nutrientTypes.slug })
  }

  // 5) System-Einheiten (household_id=null, is_system=true).
  await db
    .insert(units)
    .values(
      SYSTEM_UNITS.map((u) => ({
        id: crypto.randomUUID(),
        householdId: null,
        name: u.name,
        symbol: u.symbol,
        dimension: u.dimension,
        toBaseFactor: u.toBaseFactor,
        sortOrder: u.sortOrder,
        isSystem: true,
      }))
    )
    .onConflictDoNothing()

  // 6) Guard setzen — Re-Run ist danach No-Op.
  await db
    .insert(meta)
    .values([
      { key: 'schema_version', value: SCHEMA_VERSION },
      { key: 'seeded_at', value: new Date().toISOString() },
    ])
    .onConflictDoNothing({ target: meta.key })
}
