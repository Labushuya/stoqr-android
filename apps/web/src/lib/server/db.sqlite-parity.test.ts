import { describe, it, expect } from 'vitest'
import { getTableColumns, getTableName } from 'drizzle-orm'
import * as pg from '@stoqr/db'
import { sqliteSchema } from '@stoqr/db/sqlite'

// ---------------------------------------------------------------------------
// Schema-Parity: Postgres (Pi) <-> SQLite (App)
// ---------------------------------------------------------------------------
// Faengt Schema-Drift ab: wird eine Tabelle/Spalte im Postgres-Schema
// (packages/db/src/schema.ts) ergaenzt, aber der SQLite-Spiegel
// (schema.sqlite.ts) nicht nachgezogen (oder umgekehrt), schlaegt dieser
// Test fehl. Er laeuft ohne DB, rein ueber Drizzle-Tabellen-Introspektion.

type TableMap = Record<string, Record<string, unknown>>

// Erkennt Drizzle-Tabellen-Objekte (pg- wie sqlite-Dialekt) an getTableName().
function collectTables(mod: Record<string, unknown>): TableMap {
  const out: TableMap = {}
  for (const value of Object.values(mod)) {
    if (!value || typeof value !== 'object') continue
    let name: string
    try {
      name = getTableName(value as never)
    } catch {
      continue // kein Tabellen-Objekt (Relations, Enums, Helfer)
    }
    if (typeof name !== 'string' || name.length === 0) continue
    const cols = getTableColumns(value as never)
    out[name] = Object.fromEntries(Object.keys(cols).map((k) => [k, true]))
  }
  return out
}

const pgTables = collectTables(pg as Record<string, unknown>)
const sqliteTablesRaw = collectTables(sqliteSchema as unknown as Record<string, unknown>)

// App-only Tabellen ohne Postgres-Gegenstueck (bewusst aus der Parity genommen).
const APP_ONLY = new Set(['meta'])
const sqliteTables = Object.fromEntries(
  Object.entries(sqliteTablesRaw).filter(([name]) => !APP_ONLY.has(name))
)

describe('Schema-Parity Postgres <-> SQLite', () => {
  it('spiegelt exakt dieselben Tabellen', () => {
    const pgNames = Object.keys(pgTables).sort()
    const sqliteNames = Object.keys(sqliteTables).sort()
    expect(sqliteNames).toEqual(pgNames)
  })

  it('spiegelt pro Tabelle exakt dieselben Spalten (JS-Keys)', () => {
    const drift: Record<string, { onlyPg: string[]; onlySqlite: string[] }> = {}
    for (const name of Object.keys(pgTables)) {
      const pgCols = Object.keys(pgTables[name] ?? {})
      const sqCols = Object.keys(sqliteTables[name] ?? {})
      const onlyPg = pgCols.filter((c) => !sqCols.includes(c))
      const onlySqlite = sqCols.filter((c) => !pgCols.includes(c))
      if (onlyPg.length || onlySqlite.length) {
        drift[name] = { onlyPg, onlySqlite }
      }
    }
    expect(drift).toEqual({})
  })
})
