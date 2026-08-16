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

import {
  getTableConfig,
  SQLiteTable,
  SQLiteSyncDialect,
  type SQLiteColumn,
} from 'drizzle-orm/sqlite-core'
import { is, SQL } from 'drizzle-orm'
import * as schema from './schema.sqlite'

// Generische SQLite-Spalte, wie getTableConfig().columns sie liefert.
type SQLiteTableColumn = SQLiteColumn

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

// Rendert die Spalten-DDL EINER Spalte (Name + Typ + Constraints + Default) —
// die gemeinsame Quelle fuer CREATE TABLE (tableDdl) und die additive
// Selbstheilung (getSqliteColumnDefs -> ALTER TABLE ADD COLUMN). So driftet der
// ADD-COLUMN-Pfad nie gegen die CREATE-TABLE-Definition.
function columnDdl(col: SQLiteTableColumn): string {
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

  return parts.join(' ')
}

// Baut die CREATE-TABLE-Anweisung fuer eine einzelne Tabelle.
function tableDdl(table: SQLiteTable): string {
  const cfg = getTableConfig(table)
  const cols = cfg.columns.map((col) => '  ' + columnDdl(col as SQLiteTableColumn))
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

// ---------------------------------------------------------------------------
// Additive Selbstheilung (ALTER TABLE ADD COLUMN)
// ---------------------------------------------------------------------------
// Hintergrund: On-Device gibt es KEINE Migrationen — Boot faehrt nur
// 'CREATE TABLE IF NOT EXISTS'. Wurde eine App vor dem Hinzufuegen einer Spalte
// (z.B. G47 Pfand: products.has_deposit/deposit_ct) installiert, existiert die
// Tabelle bereits und die neue Spalte fehlt dauerhaft — Import/Export verliert
// dann still das Feld (transfer.ts ist spalten-generisch: fehlt die Spalte,
// wird sie nicht geschrieben). Die Selbstheilung schliesst genau diese Luecke,
// additiv und verlustfrei.

export type SqliteColumnDef = {
  /** Spaltenname (wie im SQLite-Schema, snake_case). */
  name: string
  /** Vollstaendiges Spalten-DDL-Fragment fuer ADD COLUMN (Typ + Default). */
  ddl: string
}

/**
 * Liefert je Tabelle die Spalten, die per 'ALTER TABLE ADD COLUMN' nachruestbar
 * sind. SQLite verbietet ADD COLUMN fuer PRIMARY KEY / UNIQUE sowie NOT NULL
 * OHNE Default — solche Spalten koennen nur bei Tabellenerstellung entstehen und
 * werden hier bewusst ausgelassen (sie fehlen in der Praxis nie nachtraeglich).
 */
export function getSqliteColumnDefs(): Record<string, SqliteColumnDef[]> {
  const tables = (Object.values(schema) as unknown[]).filter((v) =>
    is(v, SQLiteTable),
  ) as SQLiteTable[]

  const out: Record<string, SqliteColumnDef[]> = {}
  for (const table of tables) {
    const cfg = getTableConfig(table)
    const cols: SqliteColumnDef[] = []
    for (const raw of cfg.columns) {
      const col = raw as SQLiteTableColumn
      // Nicht via ADD COLUMN nachruestbar -> ueberspringen.
      if (col.primary || col.isUnique) continue
      if (col.notNull && !(col.hasDefault && col.default !== undefined)) continue
      cols.push({ name: col.name, ddl: columnDdl(col) })
    }
    out[cfg.name] = cols
  }
  return out
}

// Minimaler Query-Executor fuer die Selbstheilung: fuehrt ein SQL-Statement aus
// und liefert die Zeilen als Objekt-Array (Spaltenname -> Wert). Kompatibel mit
// dem Capacitor-SQLite conn.query() Rueckgabeformat.
export type SelfHealExec = (
  sql: string,
  params?: unknown[],
) => Promise<Array<Record<string, unknown>>>

/**
 * Additive Schema-Selbstheilung: fuer jede Tabelle die im aktuellen Schema
 * deklarierten (nachruestbaren) Spalten mit dem Live-Stand (PRAGMA table_info)
 * abgleichen und fehlende via 'ALTER TABLE ADD COLUMN' ergaenzen.
 *
 * Idempotent (fehlt nichts -> keine Statements) und verlustfrei (rein additiv;
 * bestehende Daten/Spalten bleiben unangetastet). Laeuft beim Boot NACH dem
 * 'CREATE TABLE IF NOT EXISTS'-Lauf, damit neu angelegte Tabellen bereits
 * vollstaendig sind und nur echte Alt-Tabellen geheilt werden.
 *
 * Gibt die tatsaechlich ausgefuehrten ALTER-Statements zurueck (fuer Logging).
 */
export async function selfHealSchema(exec: SelfHealExec): Promise<string[]> {
  const defs = getSqliteColumnDefs()
  const applied: string[] = []

  for (const [tableName, cols] of Object.entries(defs)) {
    if (cols.length === 0) continue

    // Existiert die Tabelle ueberhaupt? (PRAGMA liefert dann leere Spaltenliste.)
    const info = await exec(`PRAGMA table_info("${tableName}")`)
    if (info.length === 0) continue // Tabelle fehlt komplett -> CREATE TABLE hat sie gebaut, nichts zu heilen.

    const live = new Set(info.map((r) => String(r.name)))
    for (const col of cols) {
      if (live.has(col.name)) continue
      const stmt = `ALTER TABLE "${tableName}" ADD COLUMN ${col.ddl};`
      await exec(stmt)
      applied.push(stmt)
    }
  }

  return applied
}
