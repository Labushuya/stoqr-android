// ---------------------------------------------------------------------------
// SQLite-Subpath-Barrel (@stoqr/db/sqlite)
// ---------------------------------------------------------------------------
// Getrennt vom Haupt-Barrel (./index.ts, Postgres), damit die gleichnamigen
// Tabellen-Exports (users, products, …) nicht kollidieren. Der App-Layer
// importiert die On-Device-Datenschicht ueber '@stoqr/db/sqlite'.

export * as sqliteSchema from './schema.sqlite'
export { createSqliteDb } from './client.sqlite'
export type { SqliteExecutor, SqliteDatabase } from './client.sqlite'

// On-Device-DDL (CREATE TABLE/INDEX), zur Laufzeit aus dem Schema abgeleitet.
// selfHealSchema: additives ALTER TABLE ADD COLUMN fuer Alt-Installationen
// (kein Migrationspfad on-device -> fehlende Spalten nachruesten).
export {
  getSqliteDdl,
  getSqliteDdlSql,
  getSqliteColumnDefs,
  selfHealSchema,
} from './ddl.sqlite'
export type { SqliteColumnDef, SelfHealExec } from './ddl.sqlite'

// First-Launch-Seeding + lokale Identitaets-Konstanten.
export {
  seedLocal,
  isSeeded,
  LOCAL_HOUSEHOLD_ID,
  LOCAL_USER_ID,
  SCHEMA_VERSION,
} from './seed-local'

// Seeds sind dialekt-neutral (reine Datensaetze) und werden auch hier
// wieder-exportiert, damit das First-Launch-Seeding sie ohne Zusatzimport hat.
export { categorySeeds } from '../seeds/categories'
export { nutrientTypeSeeds } from '../seeds/nutrient-types'

// Datei-basierter Import/Export — derselbe dialekt-neutrale Kern wie im
// Haupt-Barrel (Pi). So teilen App und Pi Envelope-Format, Tiers, FK-Map und
// remapImport ohne Duplikat.
export * from './transfer'
export * from './transfer-io'
