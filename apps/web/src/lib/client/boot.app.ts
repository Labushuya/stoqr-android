// ---------------------------------------------------------------------------
// boot.app — App-Boot-Bootstrap (Capacitor SPA, offline)
// ---------------------------------------------------------------------------
// Laeuft EINMALIG beim App-Start (nur App-Target), BEVOR je ein routeApp()
// eine Query gegen die DB faehrt. Ablauf:
//   1) native Capacitor-SQLite-DB oeffnen (@capacitor-community/sqlite)
//   2) einen SqliteExecutor ueber die offene Connection bauen
//   3) DDL fahren (CREATE TABLE/INDEX) — VOR dem Seeding
//   4) Drizzle-Instanz via createSqliteDb(executor) bauen, setDb(db) setzen
//   5) seedLocal(db) — idempotenter First-Launch-Seed
//
// WICHTIG: Alle @capacitor-community/sqlite-Imports bleiben in dieser Datei
// isoliert (bzw. anderen *.app.ts), damit der Pi-Bundle NIE nativen Code zieht.
// Die Datei wird nur im App-Target lazy importiert (siehe hooks.client.ts).

import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from '@capacitor-community/sqlite'
import { Capacitor } from '@capacitor/core'
import {
  createSqliteDb,
  seedLocal,
  getSqliteDdl,
  selfHealSchema,
  type SqliteExecutor,
} from '@stoqr/db/sqlite'
import { setDb } from '$data/db'

const DB_NAME = 'stoqr'
const DB_VERSION = 1

// Boot ist idempotent: der erste Aufruf startet die Initialisierung, alle
// weiteren warten auf dasselbe Promise (verhindert doppeltes Oeffnen/Seeden).
let bootPromise: Promise<void> | null = null

// ---------------------------------------------------------------------------
// Executor: uebersetzt die von drizzle (sqlite-proxy) gebauten Statements auf
// die Capacitor-SQLite-Connection.
//
// method-Semantik:
//   'run'    — Statement ohne Ruecklieferung (INSERT/UPDATE/DELETE/DDL) -> run()
//   'all'/'get'/'values' — SELECT -> query(), Zeilen zurueckliefern
//
// Zeilen-Konvertierung (WICHTIG): query() liefert `{ values: any[] }`, wobei
// jede Zeile ein OBJEKT ist (Spaltenname -> Wert). Drizzle erwartet aber
// positionsbasierte Array-of-Arrays in SELECT-Spaltenreihenfolge. Der Plugin
// baut die Zeilen-Objekte nativ, indem er die Cursor-Spalten IN Ergebnis-
// Reihenfolge durchlaeuft — JS erhaelt die Einfuege-Reihenfolge der Keys.
// Daher liefert Object.values(row) die Werte exakt in Projektions-Reihenfolge,
// ohne dass wir Spaltennamen aus dem SQL parsen muessten. Das ist robust auch
// fuer Ausdruecke (count(*)), Aliase und relationale `data`-Subqueries.
function makeExecutor(conn: SQLiteDBConnection): SqliteExecutor {
  return async (sql, params, method) => {
    const values = (params ?? []) as unknown[]

    if (method === 'run') {
      // DDL/DML ohne Ruecklieferung. transaction=false: einzelne Statements,
      // damit Drizzle die Transaktionssteuerung behaelt.
      await conn.run(sql, values, false)
      return { rows: [] }
    }

    // SELECT (all/get/values).
    const res = await conn.query(sql, values)
    const objRows = (res.values ?? []) as Array<Record<string, unknown>>
    const mapped = objRows.map((row) => Object.values(row))

    // WICHTIG (sqlite-proxy Row-Shape je method):
    //   'all'/'values' -> Array-of-Arrays (mehrere Zeilen), Drizzle mappt per rows.map().
    //   'get'          -> die EINE Zeile FLACH als Werte-Array (rows = row), denn
    //                     mapGetResult() nimmt `const row = rows` und reicht das
    //                     direkt an mapResultRow bzw. customResultMapper([rows]).
    // Gaeben wir fuer 'get' ebenfalls Array-of-Arrays zurueck, waere die Zeile
    // doppelt verschachtelt -> relationale findFirst(... with:{...}) liefert die
    // Relation als undefined (z.B. item.product fehlt -> 404 auf der Detailseite).
    // Kein Treffer: mapped[0] ist undefined -> mapGetResult() gibt void 0 zurueck
    // (echtes "nicht gefunden"), damit der legitime 404 erhalten bleibt. NICHT
    // auf [] defaulten -> Drizzle wuerde [] als Zeile werten und ein Schein-
    // Objekt {id: undefined, ...} bauen.
    const rows = method === 'get' ? mapped[0] : mapped
    return { rows }
  }
}

/**
 * Startet die On-Device-DB. Nur im App-Target sinnvoll; auf anderen Plattformen
 * (z.B. reiner Web-Preview ohne Capacitor) No-Op. Idempotent.
 */
export async function bootApp(): Promise<void> {
  if (__STOQR_TARGET__ !== 'app') return
  if (bootPromise) return bootPromise

  bootPromise = (async () => {
    // Ohne native Capacitor-Bruecke (z.B. Server-Preview) nicht ausfuehrbar —
    // gnaedig aussteigen, damit der Pi-/Web-Kontext nicht bricht.
    if (!Capacitor.isNativePlatform()) return

    const sqlite = new SQLiteConnection(CapacitorSQLite)

    // Verbindung wiederverwenden, falls sie aus einem frueheren Lauf noch offen
    // ist (Hot-Reload/erneuter Boot) — sonst neu anlegen. Nach einem WebView-
    // Full-Reload ist das JS-`bootPromise` zwar zurueckgesetzt, die native
    // Connection kann aber weiterleben; isConnection() meldet sie nicht immer.
    // Deshalb createConnection defensiv: bei "already exists" retrieven.
    const isConn = (await sqlite.isConnection(DB_NAME, false)).result
    let conn: SQLiteDBConnection
    if (isConn) {
      conn = await sqlite.retrieveConnection(DB_NAME, false)
    } else {
      try {
        conn = await sqlite.createConnection(DB_NAME, false, 'no-encryption', DB_VERSION, false)
      } catch (err) {
        // Native Connection existiert bereits (z.B. nach Full-Reload) — nutzen.
        if (String((err as Error)?.message ?? err).includes('already exists')) {
          conn = await sqlite.retrieveConnection(DB_NAME, false)
        } else {
          throw err
        }
      }
    }

    if (!(await conn.isDBOpen()).result) {
      await conn.open()
    }

    const executor = makeExecutor(conn)

    // 1) DDL VOR dem Seeding fahren (idempotent durch IF NOT EXISTS).
    for (const stmt of getSqliteDdl()) {
      await conn.execute(stmt, false)
    }

    // 1b) Additive Selbstheilung: Alt-Installationen (Tabelle existierte schon,
    //     bevor eine Spalte ins Schema kam, z.B. G47 Pfand) bekommen fehlende
    //     Spalten via ALTER TABLE ADD COLUMN nachgeruestet. Ohne diesen Schritt
    //     verliert der Import Felder still (transfer.ts schreibt nur existierende
    //     Spalten). Idempotent + rein additiv.
    const healed = await selfHealSchema(async (sql, params) => {
      const res = await conn.query(sql, (params ?? []) as unknown[])
      return (res.values ?? []) as Array<Record<string, unknown>>
    })
    if (healed.length > 0) {
      console.info(`[boot.app] schema self-heal: ${healed.length} Spalte(n) ergaenzt`, healed)
    }

    // 2) Drizzle-Instanz bauen + als aktive DB setzen — ab jetzt darf routeApp()
    //    getDb() nutzen. Cast: der DB-Provider (db.ts) tippt auf den Postgres-
    //    `Database`-Typ; im App-Target ist die aktive Instanz die SQLite-Drizzle.
    const db = createSqliteDb(executor)
    setDb(db as unknown as Parameters<typeof setDb>[0])

    // 3) First-Launch-Seed (idempotent via meta-Guard).
    await seedLocal(db)
  })()

  return bootPromise
}
