// ---------------------------------------------------------------------------
// DB-Provider (Dual-Target)
// ---------------------------------------------------------------------------
// Pi (STOQR_TARGET=node, Default): getDb() liefert das Postgres-Singleton aus
// @stoqr/db - Verhalten unveraendert gegenueber dem alten `db`-Import.
//
// App (STOQR_TARGET=app): SvelteKit bundelt $lib/server/* NICHT in den Client,
// daher laeuft dieser Modulpfad in der App gar nicht. Die App ruft dieselben
// Query-Funktionen ueber einen eigenen Provider in $lib/client auf, der eine
// On-Device-SQLite-Drizzle-Instanz via setDb() setzt (siehe Client-Datenservice).
//
// Die Query-Funktionen in $data/queries/* rufen getDb() statt eines harten
// db-Imports auf - so laeuft dieselbe Logik gegen Postgres (Pi) oder SQLite (App),
// ohne dass die 157 Aufrufstellen in den Routes sich aendern.

import { db as pgDb } from '@stoqr/db/client'
import type { Database } from '@stoqr/db/client'

export type { Database } from '@stoqr/db/client'

// Optional injizierte Instanz (App-Target: SQLite ueber Capacitor). Bleibt auf
// dem Pi null, dann greift das Postgres-Singleton.
let injected: Database | null = null

/** DB-Instanz setzen (App-Target: SQLite ueber Capacitor). */
export function setDb(instance: Database): void {
  injected = instance
}

/** Aktive DB-Instanz. Pi: Postgres-Singleton. App: injizierte SQLite-Instanz. */
export function getDb(): Database {
  return injected ?? pgDb
}
