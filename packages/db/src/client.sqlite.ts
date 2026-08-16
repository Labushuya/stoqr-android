import { drizzle } from 'drizzle-orm/sqlite-proxy'
import * as schema from './schema.sqlite'

// ---------------------------------------------------------------------------
// SQLite-Client-Factory (Offline / On-Device)
//
// Diese Factory bindet NUR das Drizzle-SQLite-Schema an einen Executor.
// Die eigentliche Capacitor-SQLite-Verdrahtung (@capacitor-community/sqlite)
// passiert im App-Layer — dort wird der DB-Handle geoeffnet, Migrationen
// gefahren und der untenstehende `executor`-Callback implementiert.
//
// Wir nutzen den `sqlite-proxy`-Treiber: Drizzle baut die SQL-Statements
// (Dialekt: SQLite), reicht sie als String + Parameter an den Executor durch,
// und der App-Layer fuehrt sie gegen die native Capacitor-SQLite-DB aus.
// So bleibt dieses db-Package frei von nativer/Capacitor-Abhaengigkeit.
// ---------------------------------------------------------------------------

// Der App-Layer (Capacitor) liefert die eigentliche SQL-Ausfuehrung.
// batch/exec-Callbacks werden von der App via @capacitor-community/sqlite verdrahtet.
//
// method-Semantik (sqlite-proxy):
//   'run'    — Statement ohne Ruecklieferung (INSERT/UPDATE/DELETE/DDL)
//   'all'    — mehrere Zeilen (SELECT)
//   'get'    — genau eine Zeile (SELECT ... LIMIT 1)
//   'values' — rohe Werte-Tupel
// Der Executor MUSS Zeilen als Array-of-Arrays (rows: unknown[][]) liefern,
// also positionsbasiert in Spaltenreihenfolge — nicht als Objekte.
export type SqliteExecutor = (sql: string, params: unknown[], method: 'run' | 'all' | 'values' | 'get') => Promise<{ rows: unknown[][] }>

export function createSqliteDb(executor: SqliteExecutor) {
  return drizzle(executor as any, { schema })
}
export type SqliteDatabase = ReturnType<typeof createSqliteDb>
