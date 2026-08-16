// ---------------------------------------------------------------------------
// DDL-Generator (On-Device SQLite)
// ---------------------------------------------------------------------------
// Leitet die CREATE-TABLE-/CREATE-INDEX-Statements zur Laufzeit aus dem Drizzle-
// Schema (schema.sqlite.ts) ab, damit die DDL NIE gegenueber dem Schema driftet.
// Der App-Layer (Capacitor) fuehrt diese Statements beim ersten Boot aus, BEVOR
// seedLocal() laeuft.
//
// Ansatz: getTableConfig(table) aus 'drizzle-orm/sqlite-core' liefert je Tabelle
// die Spalten (name, getSQLType(), notNull, primary, hasDefault/default,
// autoIncrement, uniqueName) sowie die separaten Indexe (index/uniqueIndex).
// Daraus bauen wir dialekt-korrektes SQLite-DDL:
//   - Spaltentyp: col.getSQLType() (text | integer | …) — die mode-Wahl aus dem
//     Schema (boolean/timestamp -> integer, json/uuid/numeric -> text) ist da
//     bereits eingekocht.
//   - PRIMARY KEY / AUTOINCREMENT / NOT NULL / column-level UNIQUE
//   - DEFAULT-Werte: nur statische Defaults (.default(...)) landen im DDL;
//     Laufzeit-Defaults (.$defaultFn, z.B. createdAt) setzt Drizzle beim INSERT,
//     daher hier bewusst KEIN DEFAULT.
//   - Tabellen-Indexe (index/uniqueIndex) inkl. partieller WHERE-Klausel.
//
// Reihenfolge: FK-abhaengige Tabellen kommen spaeter. Wir nutzen aber ohnehin
// 'CREATE TABLE IF NOT EXISTS' und lassen PRAGMA foreign_keys aus (SQLite prueft
// FKs nur bei aktiviertem Pragma), daher ist die Erzeugungsreihenfolge unkritisch.

import { getTableConfig, SQLiteTable, SQLiteSyncDialect } from 'drizzle-orm/sqlite-core'
import { is, SQL } from 'drizzle-orm'
import * as schema from './schema.sqlite'

// Rendert einen drizzle-SQL-Ausdruck (z.B. die partielle WHERE-Klausel eines
// uniqueIndex) zu rohem SQLite-SQL. Statisch, ohne Parameter-Bindung.
const dialect = new SQLiteSyncDialect()
function renderSql(expr: SQL): string {
  return dialect.sqlToQuery(expr).sql
}

// Ein statischer Default kann ein primitiver Wert oder ein drizzle-SQL-Ausdruck
// sein. Wir serialisieren beide SQLite-korrekt.
function formatDefault(value: unknown): string {
  if (value === null) return 'NULL'
  if (typeof value === 'boolean') return value ? '1' : '0'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'string') return `'${value.replace(/'/g, "''")}'`
  // Fallback: alles andere als JSON-String ablegen (json-Spalten mit Objekt-Default).
  return `'${JSON.stringify(value).replace(/'/g, "''")}'`
}

// Baut die CREATE-TABLE-Anweisung fuer eine einzelne Tabelle.
function tableDdl(table: SQLiteTable): string {
  const cfg = getTableConfig(table)
  const cols: string[] = []

  for (const col of cfg.columns) {
    const parts: string[] = [`"${col.name}"`, col.getSQLType()]

    if (col.primary) {
      parts.push('PRIMARY KEY')
      // autoIncrement gibt es nur bei integer-PK (audit_log.id).
      if ((col as { autoIncrement?: boolean }).autoIncrement) parts.push('AUTOINCREMENT')
    }
    if (col.notNull && !col.primary) parts.push('NOT NULL')
    // column-level UNIQUE (.unique()) — Tabellen-uniqueIndex kommt separat unten.
    if (col.isUnique && !col.primary) parts.push('UNIQUE')

    // Nur statische Defaults ins DDL. Laufzeit-Defaults ($defaultFn) haben
    // hasDefault=false und werden von Drizzle beim INSERT gesetzt.
    if (col.hasDefault && col.default !== undefined) {
      const def = col.default
      if (is(def, SQL)) {
        // drizzle-SQL-Default (selten im SQLite-Schema) — gerendert uebernehmen.
        parts.push(`DEFAULT (${renderSql(def)})`)
      } else {
        parts.push(`DEFAULT ${formatDefault(def)}`)
      }
    }

    cols.push('  ' + parts.join(' '))
  }

  return `CREATE TABLE IF NOT EXISTS "${cfg.name}" (\n${cols.join(',\n')}\n);`
}

// Baut die CREATE-INDEX-Anweisungen (index/uniqueIndex) einer Tabelle inkl.
// partieller WHERE-Klausel (z.B. product_prices_proposed_uniq).
function indexDdl(table: SQLiteTable): string[] {
  const cfg = getTableConfig(table)
  const out: string[] = []

  for (const idx of cfg.indexes) {
    // Interne Config-Struktur von drizzle (stabil in 0.4x): .config { name, columns, unique, where }
    const c = (idx as { config: { name: string; columns: unknown[]; unique: boolean; where?: SQL } }).config
    const unique = c.unique ? 'UNIQUE ' : ''
    const colNames = c.columns
      .map((col) => `"${(col as { name: string }).name}"`)
      .join(', ')
    let stmt = `CREATE ${unique}INDEX IF NOT EXISTS "${c.name}" ON "${cfg.name}" (${colNames})`
    if (c.where) {
      stmt += ` WHERE ${renderSql(c.where)}`
    }
    out.push(stmt + ';')
  }

  return out
}

/**
 * Liefert alle DDL-Statements (CREATE TABLE + CREATE INDEX) fuer das komplette
 * SQLite-Schema als Array. Reihenfolge: erst alle Tabellen, dann alle Indexe.
 * Idempotent durch 'IF NOT EXISTS'.
 */
export function getSqliteDdl(): string[] {
  // schema.sqlite enthaelt neben den Tabellen auch Relations-Objekte; nur echte
  // SQLiteTable-Instanzen behalten. `is()` narrowt hier nicht sauber auf den
  // generischen SQLiteTable-Typ, daher der Cast an der Filtergrenze.
  const tables = (Object.values(schema) as unknown[]).filter((v) =>
    is(v, SQLiteTable),
  ) as SQLiteTable[]

  const createTables: string[] = []
  const createIndexes: string[] = []
  for (const table of tables) {
    createTables.push(tableDdl(table))
    createIndexes.push(...indexDdl(table))
  }

  return [...createTables, ...createIndexes]
}

/** Dieselbe DDL als ein einzelner, ausfuehrbarer SQL-String (Statements per \n getrennt). */
export function getSqliteDdlSql(): string {
  return getSqliteDdl().join('\n')
}
